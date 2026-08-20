# Inventaire composants — version alwaysdata

Cette version remplace le stockage `localStorage` et les mots de passe présents dans le JavaScript par une application Node.js + PostgreSQL.

## Fonctions incluses

- authentification côté serveur ;
- mots de passe hachés avec bcrypt dans PostgreSQL ;
- sessions stockées dans PostgreSQL avec cookie `HttpOnly` ;
- stock et dates de péremption enregistrés dans PostgreSQL ;
- historique de chaque modification de stock/péremption ;
- page **Historique** permettant de retrouver l'état de l'inventaire à une date donnée ;
- commentaire libre persistant et historisé ;
- export Excel et PDF du stock ;
- export global Excel/PDF de la commande avec péremptions + commentaire ;
- export Excel/PDF séparé des péremptions ;
- export Excel/PDF de l'inventaire historique.

## Arborescence

```text
inventaire-alwaysdata/
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── config/
│   └── components.js
├── scripts/
│   └── create-user.js
└── public/
    ├── index.html
    ├── app.js
    └── styles.css
```

## 1. Créer PostgreSQL sur alwaysdata

Dans l'administration alwaysdata :

1. Ouvrir **Bases de données > PostgreSQL**.
2. Créer une base, par exemple `votrecompte_inventaire`.
3. Créer/choisir un utilisateur PostgreSQL ayant accès à cette base.
4. Noter : hôte, port, nom de base, utilisateur et mot de passe.

L'hôte est généralement de la forme `postgresql-VOTRE_COMPTE.alwaysdata.net` et le port standard est `5432`. Utilisez toutefois les valeurs affichées dans votre administration alwaysdata.

## 2. Mettre le projet sur GitHub

Remplacez les anciens fichiers par cette version, puis poussez le projet.

Important : `.env` est déjà présent dans `.gitignore`. Ne forcez jamais son ajout avec `git add -f`.

L’ancien mot de passe de la version navigateur a déjà été exposé dans le dépôt Git/GitHub. Il faut donc le considérer comme compromis et choisir un nouveau mot de passe. Supprimer une chaîne du dernier commit ne l'efface pas forcément de l'historique Git.

## 3. Installer le projet sur alwaysdata

Connectez-vous en SSH puis, par exemple :

```bash
git clone URL_DE_VOTRE_DEPOT inventaire
cd inventaire
npm install --omit=dev
cp .env.example .env
chmod 600 .env
```

Éditez ensuite `.env` avec les vraies valeurs alwaysdata.

Pour générer un secret de session robuste :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copiez le résultat dans `SESSION_SECRET`.

Exemple de `.env` :

```dotenv
NODE_ENV=production
SESSION_SECRET=une-longue-valeur-aleatoire
PGHOST=postgresql-moncompte.alwaysdata.net
PGPORT=5432
PGDATABASE=moncompte_inventaire
PGUSER=moncompte
PGPASSWORD=mot-de-passe-de-la-base
PGSSL=false
ADMIN_USERNAME=inventaire-admin
ADMIN_PASSWORD=un-nouveau-mot-de-passe-solide
APP_TIMEZONE=Europe/Paris
```

Au **premier démarrage seulement**, si la table `users` est vide, le serveur crée l'utilisateur défini par `ADMIN_USERNAME` / `ADMIN_PASSWORD`, puis enregistre uniquement son hash bcrypt en base.

Après ce premier démarrage réussi, vous pouvez supprimer `ADMIN_PASSWORD` du fichier `.env` : il n'est plus nécessaire pour les redémarrages suivants.

## 4. Créer le site Node.js dans alwaysdata

Dans **Web > Sites**, créez un site de type **Node.js**.

Commande de démarrage, en adaptant le chemin :

```bash
node /home/VOTRE_COMPTE/inventaire/server.js
```

Le serveur utilise automatiquement les variables `IP`/`HOST` et `PORT` fournies par alwaysdata.

Choisissez une version LTS récente de Node.js (Node 20 ou supérieur ; Node 22 LTS convient très bien).

## 5. Ajouter ou changer un utilisateur

Le mot de passe n'est jamais écrit dans GitHub.

Depuis le dossier du projet :

```bash
npm run user:add -- nouvel_utilisateur
```

Le script demande le mot de passe dans le terminal sans l'enregistrer dans le dépôt.

Pour changer le mot de passe d'un utilisateur existant :

```bash
npm run user:add -- inventaire-admin --update
```

## 6. Fonctionnement de l'historique

À chaque modification d'un composant, le serveur enregistre :

- ancienne quantité ;
- nouvelle quantité ;
- ancienne date de péremption ;
- nouvelle date de péremption ;
- date/heure du changement ;
- utilisateur connecté.

La page **Historique** reconstruit ensuite l'état de chaque composant à la fin de la date choisie, dans le fuseau `Europe/Paris` par défaut.

Le commentaire fonctionne lui aussi par versions : enregistrer un nouveau commentaire ne détruit pas les anciens commentaires nécessaires à l'historique.

## 7. Exports

### Stock actuel

- PDF
- Excel

### À recommander

L'export global contient :

- la liste des produits à recommander ;
- les péremptions à surveiller ;
- le commentaire libre.

Des boutons séparés permettent également d'exporter uniquement les péremptions en PDF ou Excel.

### Historique

Après avoir choisi et affiché une date :

- Export PDF
- Export Excel

Le commentaire correspondant à cette date est également exporté.

## 8. Mise à jour du code

Pour déployer une nouvelle version depuis GitHub :

```bash
cd /home/VOTRE_COMPTE/inventaire
git pull
npm install --omit=dev
```

Redémarrez ensuite le site Node.js depuis l'administration alwaysdata si nécessaire.

Les données PostgreSQL ne sont pas remplacées par `git pull` : le code et les données restent séparés.

## 9. Vérifications utiles

Une fois le site démarré, l'URL suivante permet de vérifier la connexion à PostgreSQL :

```text
https://VOTRE-SITE/api/health
```

Résultat attendu :

```json
{"ok":true}
```

## Remarque sur les données de l'ancienne version

Les données qui se trouvent encore uniquement dans le `localStorage` d'un navigateur ne peuvent pas apparaître automatiquement dans PostgreSQL. Avant de supprimer l'ancienne version, conservez/exportez les stocks importants. Une fonction d'import ponctuel peut être ajoutée si vous avez déjà des données locales à transférer.
