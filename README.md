# Squared Workspace Web

Version Web de Squared Workspace, déployée sur Cloudflare Pages avec GitHub comme source versionnée et miroir de continuité.

## Architecture

- `squaredgroup.studio` : site principal Wix Studio
- `workspace.app.squaredgroup.studio` : cette application Web, servie par Cloudflare Pages
- `workspace.squaredgroup.studio` : backend Oracle/Fastify existant

Le projet ne contient **aucun backend**. Toutes les données viennent de l'API Squared Workspace existante.

## Déploiement GitHub Pages

1. Le dépôt GitHub est `squaredgroup/squared-workspace-web`.
2. Le contenu du frontend est à la racine de la branche `main`.
3. Dans **Settings → Pages → Build and deployment**, utiliser **GitHub Actions**.
4. Le workflow `.github/workflows/pages.yml` publie automatiquement l'application à chaque push sur `main`.
5. Dans **Settings → Pages → Custom domain**, saisir `workspace.app.squaredgroup.studio`.
6. Activer **Enforce HTTPS** dès que GitHub a émis le certificat.

Le fichier `CNAME` contient déjà `workspace.app.squaredgroup.studio`.

## DNS Wix

Dans Wix → Domaines → `squaredgroup.studio` → Gérer les enregistrements DNS :

- Type : `CNAME`
- Nom d'hôte : `workspace.app`
- Valeur : `squaredgroup.github.io`

Ne modifiez pas l'enregistrement actuel de `workspace.squaredgroup.studio` : il continue de pointer vers le backend Oracle utilisé par les apps natives.

## Configuration API

Le fichier `js/runtime-config.js` contient :

```js
window.SQUARED_CONFIG = Object.freeze({
  apiBaseUrl: `${location.origin}/api`,
  webBaseUrl: location.origin
});
```

En production Cloudflare Pages, `_worker.js` relaie uniquement `/health`, `/ready`,
`/.well-known/webauthn` et `/v1/**` depuis `/api/**`. Les jetons restent dans les
en-têtes et les réponses authentifiées sont forcées en `no-store`.

## CORS côté API

Le relais même origine rend la connexion indépendante du CORS du backend. L’autorisation
CORS directe reste recommandée pour le miroir GitHub Pages et les outils de diagnostic :

```text
https://workspace.app.squaredgroup.studio
```

Exemple :

```ts
await app.register(cors, {
  origin: config.NODE_ENV === "production"
    ? ["https://workspace.app.squaredgroup.studio"]
    : true,
  exposedHeaders: ["ETag", "X-Next-Cursor"]
});
```

## Liens d'activation / mot de passe / vérification e-mail

Le backend actuel génère encore ces URLs sur `workspace.squaredgroup.studio`. Le plus simple est de rediriger uniquement ces trois routes :

```caddy
@workspaceWebLinks path /activation /reinitialisation /verification-email
redir @workspaceWebLinks https://workspace.app.squaredgroup.studio{uri} 302
```

## Actualisation des versions

Le projet contient :

- `manifest.webmanifest`
- `sw.js`, limité à la purge des anciennes installations
- icônes d'application
- navigation responsive desktop / tablette / mobile

Le Service Worker ne met aucune réponse en cache. Chaque build génère un identifiant
de version vérifié au chargement et au retour dans l’onglet. Les en-têtes Cloudflare
interdisent également la conservation d’une ancienne interface par le navigateur ou le CDN.
