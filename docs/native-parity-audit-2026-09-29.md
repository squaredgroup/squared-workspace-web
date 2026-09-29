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

## Deuxième passage : messagerie, fichiers et e-mails

- Le deuxième passage ajoute au web le transfert de messages, les pièces jointes, les liens vers les éléments Workspace, les reçus visibles, les épingles et sauvegardes, les préférences de conversation, les participants, ainsi que la modification et la suppression des groupes selon les droits serveur. Le téléversement utilise désormais `entityType` et le téléchargement passe par le point d'entrée binaire authentifié de l'API.
- Le deuxième passage ajoute les blocs de contenu natifs à l'éditeur des modèles et au compositeur, le choix d'un modèle, l'aperçu HTML rendu par l'API, les pièces jointes, les brouillons et les envois programmés.

## Écarts encore présents

- Les messages vocaux déjà enregistrés sont traités comme pièces jointes audio ; l'enregistrement direct du microphone dans le navigateur n'est pas encore disponible. Les campagnes et les outils de personnalisation groupée ne sont pas portés en totalité.
- Plusieurs modules d'entreprise déjà visibles sur le web utilisent des formulaires de domaine génériques. Ils n'ont pas été remplacés par tous les écrans SwiftUI spécialisés.
- Les données privées ne sont pas vérifiables sans session de test autorisée. Les routes du planning et des e-mails système répondent `401` sans session sur l'API publique, ce qui confirme leur présence mais pas l'état du schéma en production.

## Conditions de publication

Les migrations serveur `052_personal_planning.sql`, `053_system_mail_templates.sql` et `054_system_mail_visual_styles.sql` doivent être appliquées avant d'utiliser les trois fonctions correspondantes. Aucun changement DNS ou déploiement backend n'est inclus. Les tests statiques, unitaires, de session et la compilation passent localement ; l'audit navigateur doit passer dans la CI avant le déploiement de `main` vers GitHub Pages et Cloudflare Pages.
