'use strict';

const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const username = String(process.argv[2] || '').trim();
const updateExisting = process.argv.includes('--update');

if (!username) {
  console.error('Usage : npm run user:add -- <identifiant> [--update]');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 2
});

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    let value = '';
    output.write(question);
    input.setEncoding('utf8');
    input.resume();

    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      const rl = readline.createInterface({ input, output, terminal: true });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    input.setRawMode(true);
    const onData = (key) => {
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Opération annulée.'));
        return;
      }
      if (key === '\r' || key === '\n') {
        output.write('\n');
        cleanup();
        resolve(value);
        return;
      }
      if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += key;
    };
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
    };
    input.on('data', onData);
  });
}

(async () => {
  try {
    const password = await askHidden('Nouveau mot de passe (10 caractères minimum) : ');
    const confirm = await askHidden('Confirmez le mot de passe : ');
    if (password !== confirm) throw new Error('Les deux mots de passe ne correspondent pas.');
    if (password.length < 10) throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
    if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('Le mot de passe ne doit pas dépasser 72 octets avec bcrypt.');

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rowCount && !updateExisting) {
      throw new Error('Cet utilisateur existe déjà. Ajoutez --update pour remplacer son mot de passe.');
    }

    const hash = await bcrypt.hash(password, 12);
    if (existing.rowCount) {
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = $2',
        [hash, username]
      );
      console.log(`Mot de passe mis à jour pour « ${username} ».`);
    } else {
      await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
        [username, hash]
      );
      console.log(`Utilisateur « ${username} » créé.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
