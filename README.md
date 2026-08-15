# Inventaire composants — GitHub Pages

Application statique HTML/CSS/JavaScript pour :

- connexion par identifiant / mot de passe ;
- saisie d'un composant via recherche et suggestions ;
- modification du stock actuel et de la date de fin ;
- affichage automatique des composants sous le stock minimum ;
- calcul de la quantité à recommander : `stock maximum - stock actuel` ;
- export PDF et Excel du stock actuel et des produits à recommander ;
- sauvegarde dans le navigateur avec `localStorage`.

## 1. Modifier l'identifiant et le mot de passe

Dans `app.js` :

```js
const AUTH = {
  username: "admin",
  password: "inventaire123"
};
```

> Attention : sur GitHub Pages, le JavaScript est public. Le mot de passe peut donc être retrouvé dans le code source. Ce système n'est pas une authentification sécurisée.

## 2. Renseigner la vraie liste de composants

Dans `app.js`, modifier :

```js
const COMPONENTS = [
  { id: "ATV", name: "ATV", min: 5, max: 20 },
  { id: "M340", name: "M340", min: 4, max: 16 },
  { id: "TSX47", name: "TSX47", min: 3, max: 12 }
];
```

Vous pouvez mettre autant de composants que nécessaire.

- `id` : identifiant unique du composant ;
- `name` : nom affiché ;
- `min` : stock minimal ;
- `max` : stock maximal cible.

## 3. Tester en local

Le plus simple est d'ouvrir `index.html` dans un navigateur.

Pour éviter certaines restrictions locales, vous pouvez aussi utiliser un petit serveur HTTP :

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## 4. Mise en ligne GitHub Pages

1. Créer un dépôt GitHub.
2. Ajouter `index.html`, `styles.css` et `app.js` à la racine.
3. Aller dans **Settings > Pages**.
4. Choisir **Deploy from a branch**.
5. Sélectionner la branche `main` et le dossier `/root`.
6. Enregistrer.

GitHub donnera ensuite l'adresse du site.

## 5. Limite importante de cette version

Les données sont enregistrées dans `localStorage` : elles restent sur le navigateur utilisé.

Donc :

- même PC + même navigateur : inventaire conservé ;
- autre PC : inventaire différent ;
- suppression des données du navigateur : inventaire supprimé ;
- plusieurs utilisateurs : pas de synchronisation automatique.

Pour un inventaire partagé, il faudra remplacer `localStorage` par une base de données en ligne, par exemple Firebase ou Supabase, et utiliser une authentification côté serveur/service.

## 6. Bibliothèques utilisées pour les exports

Chargées depuis un CDN dans `index.html` :

- SheetJS (`xlsx`) pour les fichiers Excel ;
- jsPDF ;
- jsPDF AutoTable.

Une connexion Internet est donc nécessaire pour charger ces bibliothèques lors de l'utilisation de l'application.
