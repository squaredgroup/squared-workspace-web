# Compatibilité navigateur du backend Squared Workspace

## État exact

Le correctif source est versionné ici. **Il n’est pas appliqué sur le serveur Oracle.** Cette branche ne contient ni le backend complet, ni un accès de déploiement. Aucun secret n’a été ajouté et aucune image GHCR supposée n’est utilisée.

Le diagnostic GitHub Actions en lecture seule du 18 septembre 2026 (run 35397514675) a obtenu :
- `/health` : HTTP 200, sans autorisation CORS ;
- `OPTIONS /v1/auth/password`, `/v1/me`, `/v1/projects` : HTTP 404, sans autorisation CORS ;
- `/.well-known/webauthn` : HTTP 404.

## Modifications du patch

`cors-hotfix/cors.patch` est un vrai patch unifié pour la version du Backend fournie dans le ZIP original. Il remplace l’ancien correctif incomplet.

- Origine Web unique en production : `https://workspace.app.squaredgroup.studio`.
- Méthodes et en-têtes nécessaires aux connexions, lectures, modifications et contrôles de version.
- Maintien des routes, JWT, rôles, permissions et mécanismes MFA existants.
- Maintien de l’identifiant RP WebAuthn natif ; déclaration de l’origine Web apparentée et vérification explicite de cette origine. Les navigateurs sans prise en charge des origines apparentées doivent utiliser les parcours existants mot de passe/code de récupération. Aucune MFA n’est désactivée.
- Liens de réinitialisation et vérification e-mail adaptés au Web ; compatibilité des anciens liens.
- Bouton Web ajouté à la page d’activation existante, sans supprimer le parcours natif.

## Validation réalisée sur le ZIP fourni

Compilation TypeScript complète réussie. Six tests Fastify/CORS par injection réussis : origine officielle, méthodes/en-têtes, origines refusées, requêtes natives sans Origin, accès privé toujours protégé, configuration invalide refusée. Le patch passe `git apply --check` sur les sources d’origine.

Ces tests ne remplacent pas un déploiement ni une connexion réelle au serveur de production.

## Application sur les vraies sources backend

Depuis cette branche et avec une copie à jour des sources du projet natif :

```bash
bash cors-hotfix/apply-cors-hotfix.sh /chemin/du/projet --check
bash cors-hotfix/apply-cors-hotfix.sh /chemin/du/projet --apply
cd /chemin/du/projet/Backend
npm ci
npm run build
node --test tests/web-browser-policy.test.mjs
```

Le script contrôle l’ensemble du patch avant d’écrire. Il s’arrête si la base source diffère ; il ne tente aucune réparation destructive. Une seconde application est détectée et ignorée.

Faire ensuite le déploiement Oracle selon le mécanisme réellement utilisé par cette instance. Le script ne déploie rien, ne redémarre aucun service et ne modifie aucune variable de production. Le défaut de `WEB_APP_ORIGIN` vise déjà l’adresse officielle ; si la production définit cette variable, elle doit être vérifiée.

Le workflow `Check production API browser access` sur `main` permet ensuite de revérifier les réponses publiques, sans compte ni mot de passe. La branche `main` reste le client Web GitHub Pages.
