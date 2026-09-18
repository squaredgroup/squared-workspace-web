# Squared Workspace Web

Version Web statique de Squared Workspace, conçue pour GitHub Pages.

## Architecture

- `squaredgroup.studio` : site principal Wix Studio
- `app.squaredgroup.studio` : cette application Web, servie par GitHub Pages
- `workspace.squaredgroup.studio` : backend Oracle/Fastify existant

Le projet ne contient **aucun backend**. Toutes les données viennent de l'API Squared Workspace existante.

## Déploiement GitHub Pages

1. Créer un dépôt GitHub dédié, par exemple `squared-workspace-web`.
2. Mettre le contenu de ce dossier à la racine de la branche `main`.
3. Dans **Settings → Pages → Build and deployment**, sélectionner **GitHub Actions**.
4. Le workflow `.github/workflows/pages.yml` publie automatiquement l'application à chaque push sur `main`.
5. Dans **Settings → Pages → Custom domain**, saisir `app.squaredgroup.studio`.
6. Activer **Enforce HTTPS** dès que GitHub a émis le certificat.

Le fichier `CNAME` est déjà fourni pour `app.squaredgroup.studio`.

## DNS Wix

Dans Wix → Domaines → `squaredgroup.studio` → Gérer les enregistrements DNS :

- Type : `CNAME`
- Nom d'hôte : `app`
- Valeur : `<TON-COMPTE-OU-ORGANISATION>.github.io`

Ne modifiez pas l'enregistrement actuel de `workspace.squaredgroup.studio` : il continue de pointer vers le backend Oracle utilisé par les apps natives.

## Configuration API

Le fichier `js/runtime-config.js` contient :

```js
window.SQUARED_CONFIG = Object.freeze({
  apiBaseUrl: "https://workspace.squaredgroup.studio",
  webBaseUrl: "https://app.squaredgroup.studio"
});
```

C'est le seul fichier à modifier si l'adresse de l'API ou du Web change.

## CORS requis côté API

Comme le frontend et l'API sont sur deux origines différentes, le backend doit autoriser l'origine Web.

Dans la configuration `@fastify/cors`, la production doit autoriser :

```ts
await app.register(cors, {
  origin: config.NODE_ENV === "production"
    ? ["https://app.squaredgroup.studio"]
    : true,
  exposedHeaders: ["ETag", "X-Next-Cursor"]
});
```

Aucun cookie inter-domaine n'est nécessaire : la version Web utilise le même système access token / refresh token que le backend actuel.

## Liens d'activation / mot de passe / vérification e-mail

Le backend actuel génère encore ces URLs sur `workspace.squaredgroup.studio`. Le plus simple est de rediriger uniquement ces trois routes, sans toucher à l'API :

```caddy
@workspaceWebLinks path /activation /reinitialisation /verification-email
redir @workspaceWebLinks https://app.squaredgroup.studio{uri} 302
```

Le reste de `workspace.squaredgroup.studio` continue de servir Fastify normalement.

## PWA

Le projet contient :

- `manifest.webmanifest`
- `sw.js`
- icônes d'application
- shell offline
- navigation responsive desktop / tablette / mobile

L'application peut donc être ajoutée à l'écran d'accueil depuis Safari/Chrome.

## Routes

La navigation applicative utilise des fragments `#/...`, ce qui est compatible avec GitHub Pages. Un `404.html` est également fourni pour les liens directs d'activation et de sécurité.
