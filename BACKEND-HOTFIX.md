# Squared Workspace Backend hotfix

Cette branche contient le hotfix CORS destiné au backend Oracle de Squared Workspace.

## Origine Web autorisée

`https://workspace.app.squaredgroup.studio`

Le hotfix part de l'image existante `ghcr.io/squaredgroup/squared-workspace-api:latest`, vérifie que la configuration CORS de production attendue existe, puis remplace uniquement cette configuration.

La branche `main` reste la version Web GitHub Pages.
