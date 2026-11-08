# Squared Workspace Web

Ces consignes s’appliquent à ce dépôt. Répondre en français et préserver les instructions des dossiers parents ainsi que tout travail existant.

## Sources et périmètre

- Référence native : `/Users/squaredgroup/Desktop/Squared Workspace`.
- Dépôt web : `squaredgroup/squared-workspace-web`. Vérifier le dépôt et le checkout réels avant toute intervention ; ne pas créer une nouvelle copie si un checkout adapté existe.
- Checkout web actuel : `/Users/squaredgroup/.codex/.chatgpt-projects/g-p-691fa51aa19c819196c98c79ecb6c2ad/squared-workspace-web`.
- Site web en production : `https://workspace.app.squaredgroup.studio/`.
- API Workspace : `https://workspace.squaredgroup.studio/`. Ne pas confondre cette API avec le site web à publier.
- Le dossier `/Users/squaredgroup/Desktop/Workspace App` contient les audits et livraisons ; ce n’est pas le projet natif.

## Demande courte de synchronisation

Une demande comme « synchronise Workspace Web avec l’app » autorise le parcours ci-dessous : comparaison, implémentation des évolutions non reportées, compilation web, PR, fusion et publication sur l’hébergement existant. Elle ne demande pas un nouvel audit seul. Ce fichier ne crée aucune synchronisation automatique en arrière-plan.

1. Lire les `AGENTS.md` applicables des deux projets et inspecter leurs états Git. L’app native reste une référence en lecture seule pour cette synchronisation. Ne pas modifier son code, ses paquets, sa configuration ou son backend.
2. Comparer le code natif actuel au web, y compris les modifications natives non commitées. Utiliser la dernière référence de synchronisation fiable pour cibler les différences et leurs dépendances ; en son absence, faire une comparaison initiale complète. Un même commit Git ne prouve pas que deux arbres de travail sont identiques.
3. Reporter les évolutions concernées dans leur intégralité : pages, modules, navigation, composants, formulaires, tableaux, menus, médias, wording, actions, états et parcours. Commencer par les composants communs afin d’appliquer les corrections partout.
4. Reproduire le design natif à partir de ses sources et des captures fournies : polices et graisses, tailles, espacements, couleurs, bordures, arrondis, icônes, survols, sélection, thèmes, panneaux et organisation des pages. Préserver la direction visuelle existante. Vérifier l’ordre et la spécificité des feuilles de style pour que les anciens styles n’écrasent pas ces composants.
5. Conserver les données réelles, droits, circuits métier, sauvegardes, contrôles de version, synchronisations et contrats API. Ne pas inventer d’indicateur, de contenu, de série graphique ou de fonctionnalité de façade. Une action affichée doit rester raccordée à son comportement réel.
6. Adapter les interactions propres à macOS aux capacités du navigateur en conservant leur intention et leur présentation. Préserver l’usage mobile, la navigation au clavier et la sémantique d’accessibilité dans le code.
7. Si un contrat serveur, une API ou un accès manque, identifier précisément le blocage et poursuivre les parties réalisables. Ne pas élargir les droits, contourner un refus ou prétendre qu’un parcours est raccordé. Une modification du backend requiert sa propre demande autorisée.

## Vérification autorisée et interdictions

- Aucun test automatisé ou manuel : ni tests unitaires, ni suites fonctionnelles, ni tests navigateur ou audits exécutables d’accessibilité.
- Aucun navigateur automatisé, aucune automatisation Mac/iPhone et aucune validation visuelle exécutée par l’agent.
- Ne jamais lancer ni installer l’app native. Les essais et la validation du rendu appartiennent à l’utilisateur.
- Les lectures de sources, le contrôle du diff, la liaison statique des modules, le contrôle des types et la compilation/préparation de l’artefact web sont autorisés.
- Sur ce dépôt, `npm run typecheck`, `npm run validate`, `npm run build` et `npm run stage` correspondent à ces contrôles autorisés : relire les scripts avant de les utiliser si leur définition a changé.
- Ne pas exécuter `npm run check`, `npm run test:*`, les scripts de tests, les parcours Playwright ou une commande combinée qui déclencherait les vérifications interdites.
- Compiler après les modifications pertinentes et corriger les erreurs de compilation introduites. Ne pas répéter les compilations sans nouvelle modification ou problème à résoudre.

## Livraison d’une synchronisation

- Préserver les changements étrangers à la tâche ; ne pas réinitialiser le dépôt, forcer un push ou écraser le travail d’autrui.
- Utiliser une branche dédiée et une PR. Fusionner seulement lorsque les contrôles autorisés réussissent pour la version exacte à livrer.
- Empêcher les tests de se déclencher dans la CI, y compris lors des commits, pushes, PR et fusions. Le workflow actuel `pages.yml` permet un lancement manuel avec `omitAutomatedTests=true` ; vérifier sa définition avant utilisation. Utiliser `[skip ci]` dans les messages de commit/fusion lorsque nécessaire pour éviter les déclenchements automatiques, puis lancer explicitement le workflow autorisé.
- Publier le web sur sa cible existante. Ne pas créer de nouvel hébergement, changer les DNS ou intervenir sur un autre produit.
- Confirmer l’achèvement du déploiement, l’identifiant de version effectivement servi et les empreintes des fichiers publics. Ces lectures statiques n’exécutent aucun parcours applicatif connecté.
- Conserver dans le dépôt web une référence versionnée de synchronisation, par exemple `docs/native-parity.json` : fichiers natifs concernés, empreintes de leur contenu, révision Git de référence et écarts encore ouverts. Exclure secrets, données métier, caches et binaires générés. Actualiser cette référence après le report effectif des changements ; ne pas marquer un écart bloqué comme terminé.
- Terminer par un compte rendu court : changements reportés, version publiée, lien du site et écarts restants. Distinguer implémentation, compilation, publication et validation manuelle. Une compilation ou une empreinte de fichier ne prouve pas la fidélité du rendu ni le fonctionnement d’un parcours.

## Modification des consignes seules

Une demande limitée à ce fichier ne déclenche pas une synchronisation du produit, une compilation ou une publication du site. Relire le contenu et le diff, puis enregistrer les consignes dans le dépôt sans lancer de tests.
