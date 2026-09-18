# Wix + GitHub Pages — branchement final

## Ce que fait chaque service

**Wix**
- conserve `squaredgroup.studio` et le site public ;
- gère les DNS du domaine ;
- crée le sous-domaine `app.squaredgroup.studio`.

**GitHub Pages**
- héberge uniquement le frontend Squared Workspace : HTML, CSS, JavaScript, images et PWA ;
- ne contient aucune base de données ni secret serveur.

**Oracle**
- conserve le backend Squared Workspace existant sur `workspace.squaredgroup.studio` ;
- PostgreSQL, stockage, authentification, Wix CMS, Gmail et WebSocket restent inchangés.

## Schéma

```text
squaredgroup.studio
        │
        ├── www / @ ─────────────── Wix Studio
        │
        ├── app ─────────────────── GitHub Pages
        │        Squared Workspace Web
        │
        └── workspace ───────────── Oracle Cloud
                 API Fastify + PostgreSQL
```

## DNS

Dans Wix, ajouter :

```text
Type   Host   Valeur
CNAME  app    TON-COMPTE-GITHUB.github.io
```

Il ne faut pas remplacer le DNS de `workspace` dans cette première version : les clients Apple continuent à l'utiliser comme API.

## Après publication

Vérifier :

- `https://app.squaredgroup.studio`
- certificat HTTPS GitHub Pages actif ;
- connexion / MFA / passkey ;
- chargement du dashboard ;
- CRUD projets/tâches/etc. ;
- WebSocket ;
- CMS Wix ;
- Gmail ;
- fichiers ;
- activation ;
- réinitialisation de mot de passe ;
- responsive iPhone/iPad/Desktop ;
- installation PWA.
