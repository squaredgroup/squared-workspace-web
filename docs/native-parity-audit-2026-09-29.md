# Squared Workspace Web — synchronisation native du 29 septembre 2026

Source examinée : archive « Squared Workspace.zip » du 29 septembre 2026 (SwiftUI iOS/macOS, API Fastify, schéma PostgreSQL). Cible : dépôt `squaredgroup/squared-workspace-web`, branche `main` au commit `b386bb9` avant le changement.

## Alignements livrés dans ce changement

| Domaine | Écart constaté | Résultat web |
| --- | --- | --- |
| Planning personnel | La sous-page renvoyait vers les événements partagés. | Écran privé par membre sur `GET/PUT /v1/me/personal-planning`, contrôle de version, créneaux récurrents, catégories et import/export JSON conformes au schéma natif. |
| E-mails système | Aucun accès aux modèles de connexion, invitation, vérification et alertes. | Liste, édition des blocs et du style propre au modèle, aperçu serveur, restauration et conflit de révision, avec permissions `viewMail`/`manageMailSettings`. |
| Modèles de rédaction | Consultation seule. | Création, modification et suppression selon `sendMail`/`organizeMail`. Les blocs existants sont conservés lors d'une modification. |
| Style e-mail | Le formulaire traitait l'enveloppe `{style,connection}` comme un objet de champs et envoyait un corps invalide. | Champs explicites conformes au schéma serveur ; consultation sans droit d'administration. |
| Boîte Google | La page Connexion était une impasse. | Statut, lancement OAuth côté serveur, synchronisation et déconnexion avec confirmations et permissions. |
| Messages | Le web ne proposait que l'envoi de texte. | Réponse liée, modification et suppression de ses messages, réactions, affichage des réactions du snapshot, mutations ciblées sur l'API. |
| Aperçu e-mail | `frame-src 'none'` empêchait l'affichage des iframes `srcdoc` déjà utilisées dans la boîte. | Iframes limitées à l'origine du site et conservées en mode `sandbox`; scripts interdits dans l'aperçu des messages. |

## Écarts encore présents

- La messagerie native inclut notamment transfert, pièces jointes, messages vocaux, épingles, sauvegardes, reçus et gestion avancée des conversations. Ce changement couvre les actions citées plus haut, pas l'intégralité de cet atelier.
- Le compositeur mail natif possède des blocs, une personnalisation et des campagnes plus complets. L'éditeur des modèles de rédaction web reste limité au texte, à l'objet et au partage ; il préserve les blocs existants sans proposer leur édition complète.
- Plusieurs modules d'entreprise déjà visibles sur le web utilisent des formulaires de domaine génériques. Ils n'ont pas été remplacés par tous les écrans SwiftUI spécialisés.
- Les données privées ne sont pas vérifiables sans session de test autorisée. Les routes du planning et des e-mails système répondent `401` sans session sur l'API publique, ce qui confirme leur présence mais pas l'état du schéma en production.

## Conditions de publication

Les migrations serveur `052_personal_planning.sql`, `053_system_mail_templates.sql` et `054_system_mail_visual_styles.sql` doivent être appliquées avant d'utiliser les trois fonctions correspondantes. Aucun changement DNS ou déploiement backend n'est inclus. Les tests statiques, unitaires, de session et la compilation passent localement ; l'audit navigateur doit passer dans la CI avant le déploiement de `main` vers GitHub Pages et Cloudflare Pages.
