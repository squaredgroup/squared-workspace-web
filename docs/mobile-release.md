# Mobile Workspace — 22 septembre 2026

## Périmètre
Couche responsive intégrée au bundle Vite, sans changement d’API, d’hébergement ou de DNS. Space Grotesk, tokens de thèmes et icônes Iconly existants conservés.

Navigation tactile, marges de sécurité, typographie lisible, champs de saisie 16 px, fenêtres défilantes adaptées au clavier, statuts des listes conservés, tableaux défilants, thèmes clair/sombre, lecture mobile à écran unique des conversations et e-mails.

Outils mobiles : recherche globale, actualisation existante, partage de liens de rubriques sans paramètres sensibles, favoris (six maximum, isolés par membre, filtrés par permissions), rubriques récentes en mémoire, installation PWA selon capacités du navigateur, déconnexion confirmée.

Messages : recherche stable sans recréation du champ, filtres toutes/non lues, recherche dans une discussion, dates, accès aux derniers messages, brouillons en mémoire par utilisateur et conversation. Mise à jour temps réel incrémentale. Envoi protégé contre les doubles clics et désactivé hors ligne. Un échec conserve le brouillon ; un envoi confirmé suivi d’un échec d’actualisation ne conseille pas de renvoyer le message.

## Confidentialité et limites
Les brouillons ne sont pas sauvegardés durablement : un rechargement, la fermeture de l’onglet ou la déconnexion les efface. Aucun cache de données métier et aucune file d’envoi hors ligne ajoutés. Les pages et fonctions accessibles restent déterminées par les permissions serveur existantes.

## Vérification
La suite mobile utilise la vraie application compilée et une API synthétique isolée. Elle couvre 320, 360, 390, 430, 768, 880, 1024 et 1440 px ainsi que le paysage 844 x 390, puis les parcours de messages, navigation, outils, e-mails et fenêtres. Les résultats JSON et captures sont conservés dans l’artifact workspace-visual-recipe. Les tests existants de sessions, sécurité, accessibilité et parcours produit ne sont pas supprimés.

Ces tests automatisés ne remplacent pas une recette sur appareils iOS/Android physiques ni une validation des intégrations avec de vraies données. Un passage en production doit suivre une validation CI réussie.
