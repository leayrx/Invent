'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const COMPONENTS = require('./config/components');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PgSession = connectPgSimple(session);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.IP || process.env.HOST || '127.0.0.1';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Paris';
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
  throw new Error('SESSION_SECRET doit contenir au moins 24 caractères.');
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true
    }),
    name: 'inventaire.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez plus tard.' }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Authentification requise.' });
  next();
}

function sameOriginGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== req.get('host')) {
      return res.status(403).json({ error: 'Origine non autorisée.' });
    }
  } catch {
    return res.status(403).json({ error: 'Origine invalide.' });
  }
  next();
}
app.use('/api', sameOriginGuard);

function normalizeDate(value, label = 'Date') {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} invalide.`);
  const [year, month, day] = text.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`${label} invalide.`);
  }
  return text;
}

function normalizeExpiry(value) {
  if (value === '' || value === null || value === undefined) return null;
  return normalizeDate(value, 'Date de péremption');
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) {
    throw new Error('La quantité doit être un entier positif ou nul.');
  }
  return quantity;
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS components (
        component_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        min_stock INTEGER NOT NULL CHECK (min_stock >= 0),
        max_stock INTEGER NOT NULL CHECK (max_stock >= min_stock),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_current (
        component_id TEXT PRIMARY KEY REFERENCES components(component_id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        expiry DATE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by BIGINT REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_events (
        id BIGSERIAL PRIMARY KEY,
        component_id TEXT NOT NULL REFERENCES components(component_id) ON DELETE CASCADE,
        old_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        old_expiry DATE,
        new_expiry DATE,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        changed_by BIGINT REFERENCES users(id),
        source TEXT NOT NULL DEFAULT 'web'
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_events_component_date
      ON inventory_events(component_id, changed_at DESC, id DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendation_notes (
        id BIGSERIAL PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by BIGINT REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recommendation_notes_date
      ON recommendation_notes(created_at DESC, id DESC)
    `);

    await client.query('UPDATE components SET active = FALSE');

    for (const component of COMPONENTS) {
      await client.query(
        `INSERT INTO components (component_id, name, min_stock, max_stock, active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (component_id) DO UPDATE SET
           name = EXCLUDED.name,
           min_stock = EXCLUDED.min_stock,
           max_stock = EXCLUDED.max_stock,
           active = TRUE,
           updated_at = NOW()`,
        [component.id, component.name, component.min, component.max]
      );
      await client.query(
        `INSERT INTO inventory_current (component_id, quantity, expiry)
         VALUES ($1, 0, NULL)
         ON CONFLICT (component_id) DO NOTHING`,
        [component.id]
      );
    }

    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (countResult.rows[0].count === 0) {
      const username = process.env.ADMIN_USERNAME?.trim();
      const password = process.env.ADMIN_PASSWORD;
      if (username && password && password.length >= 10 && Buffer.byteLength(password, 'utf8') <= 72) {
        const passwordHash = await bcrypt.hash(password, 12);
        await client.query(
          'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
          [username, passwordHash]
        );
        console.log(`Utilisateur initial « ${username} » créé.`);
      } else {
        console.warn('Aucun utilisateur présent. Définissez ADMIN_USERNAME et ADMIN_PASSWORD (10 caractères minimum), ou lancez npm run user:add -- <identifiant>.');
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  if (Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Mot de passe trop long.' });

  const result = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username]
  );
  const user = result.rows[0];
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!valid) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });

  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Impossible de créer la session.' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: 'Impossible d’enregistrer la session.' });
      res.json({ user: { username: user.username } });
    });
  });
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('inventaire.sid');
    res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: { username: req.session.username } });
});

app.get('/api/components', requireAuth, async (_req, res) => {
  const result = await pool.query(`
    SELECT component_id AS id, name, min_stock AS min, max_stock AS max
    FROM components
    WHERE active = TRUE
    ORDER BY name COLLATE "C"
  `);
  res.json(result.rows);
});

app.get('/api/inventory', requireAuth, async (_req, res) => {
  const result = await pool.query(`
    SELECT c.component_id AS id, c.name, c.min_stock AS min, c.max_stock AS max,
           i.quantity, TO_CHAR(i.expiry, 'YYYY-MM-DD') AS expiry,
           i.updated_at, u.username AS updated_by
    FROM components c
    JOIN inventory_current i ON i.component_id = c.component_id
    LEFT JOIN users u ON u.id = i.updated_by
    WHERE c.active = TRUE
    ORDER BY c.name COLLATE "C"
  `);
  res.json(result.rows);
});

app.put('/api/inventory/:componentId', requireAuth, async (req, res) => {
  const componentId = req.params.componentId;
  let quantity;
  let expiry;
  try {
    quantity = normalizeQuantity(req.body?.quantity);
    expiry = normalizeExpiry(req.body?.expiry);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT i.quantity, TO_CHAR(i.expiry, 'YYYY-MM-DD') AS expiry
       FROM inventory_current i
       JOIN components c ON c.component_id = i.component_id
       WHERE i.component_id = $1 AND c.active = TRUE
       FOR UPDATE`,
      [componentId]
    );
    if (currentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Composant introuvable.' });
    }

    const current = currentResult.rows[0];
    const oldExpiry = current.expiry || null;
    const hasChanged = current.quantity !== quantity || oldExpiry !== expiry;

    if (hasChanged) {
      await client.query(
        `UPDATE inventory_current
         SET quantity = $1, expiry = $2, updated_at = NOW(), updated_by = $3
         WHERE component_id = $4`,
        [quantity, expiry, req.session.userId, componentId]
      );
      await client.query(
        `INSERT INTO inventory_events
         (component_id, old_quantity, new_quantity, old_expiry, new_expiry, changed_by, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'web')`,
        [componentId, current.quantity, quantity, oldExpiry, expiry, req.session.userId]
      );
    }

    const updatedResult = await client.query(`
      SELECT c.component_id AS id, c.name, c.min_stock AS min, c.max_stock AS max,
             i.quantity, TO_CHAR(i.expiry, 'YYYY-MM-DD') AS expiry,
             i.updated_at, u.username AS updated_by
      FROM components c
      JOIN inventory_current i ON i.component_id = c.component_id
      LEFT JOIN users u ON u.id = i.updated_by
      WHERE c.component_id = $1
    `, [componentId]);
    await client.query('COMMIT');
    res.json(updatedResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Impossible d’enregistrer le stock.' });
  } finally {
    client.release();
  }
});

app.get('/api/notes/current', requireAuth, async (_req, res) => {
  const result = await pool.query(`
    SELECT n.content, n.created_at, u.username AS created_by
    FROM recommendation_notes n
    LEFT JOIN users u ON u.id = n.created_by
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 1
  `);
  res.json(result.rows[0] || { content: '', created_at: null, created_by: null });
});

app.post('/api/notes', requireAuth, async (req, res) => {
  const content = String(req.body?.content ?? '').trim();
  if (content.length > 10000) return res.status(400).json({ error: 'Commentaire trop long (10 000 caractères maximum).' });

  const latest = await pool.query('SELECT content FROM recommendation_notes ORDER BY created_at DESC, id DESC LIMIT 1');
  if ((latest.rows[0]?.content || '') === content) {
    return res.json({ ok: true, unchanged: true, content });
  }

  const result = await pool.query(`
    INSERT INTO recommendation_notes (content, created_by)
    VALUES ($1, $2)
    RETURNING content, created_at
  `, [content, req.session.userId]);
  res.json({ ...result.rows[0], created_by: req.session.username });
});

app.get('/api/history/dates', requireAuth, async (_req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT day
    FROM (
      SELECT (changed_at AT TIME ZONE $1)::date AS day FROM inventory_events
      UNION
      SELECT (created_at AT TIME ZONE $1)::date AS day FROM recommendation_notes
    ) d
    WHERE day IS NOT NULL
    ORDER BY day DESC
    LIMIT 120
  `, [APP_TIMEZONE]);
  res.json(result.rows.map((row) => row.day));
});

app.get('/api/history', requireAuth, async (req, res) => {
  let date;
  try {
    date = normalizeDate(req.query.date, 'Date');
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const itemsResult = await pool.query(`
      SELECT c.component_id AS id, c.name, c.min_stock AS min, c.max_stock AS max,
             COALESCE(e.new_quantity, 0) AS quantity,
             TO_CHAR(e.new_expiry, 'YYYY-MM-DD') AS expiry,
             e.changed_at AS last_changed_at,
             u.username AS changed_by
      FROM components c
      LEFT JOIN LATERAL (
        SELECT ie.new_quantity, ie.new_expiry, ie.changed_at, ie.changed_by
        FROM inventory_events ie
        WHERE ie.component_id = c.component_id
          AND ie.changed_at < (($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE $2)
        ORDER BY ie.changed_at DESC, ie.id DESC
        LIMIT 1
      ) e ON TRUE
      LEFT JOIN users u ON u.id = e.changed_by
      WHERE c.active = TRUE
      ORDER BY c.name COLLATE "C"
    `, [date, APP_TIMEZONE]);

    const noteResult = await pool.query(`
      SELECT n.content, n.created_at, u.username AS created_by
      FROM recommendation_notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.created_at < (($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE $2)
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 1
    `, [date, APP_TIMEZONE]);

    res.json({
      date,
      timezone: APP_TIMEZONE,
      items: itemsResult.rows,
      note: noteResult.rows[0] || { content: '', created_at: null, created_by: null }
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Impossible de lire cet historique.' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Inventaire démarré sur ${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Échec de l’initialisation de la base de données :', error);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
