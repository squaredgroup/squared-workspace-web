# Squared Focus — refonte des parcours mobiles

## Objectif
Passer d’un site administratif adapté à la largeur du téléphone à des parcours orientés travail. Conserver l’identité Squared, les API, les comptes, les permissions, les anciennes URL et le pilotage ordinateur. Aucun changement de DNS ni de données de production pendant les tests.

## Parcours livrés dans le code
Accueil mobile compact, périmètre personnel explicite, vraies catégories aujourd’hui / retard / à venir / sans date ; ouverture des objets et création de tâches.
Navigation Accueil / Travail / À traiter / Messages / Espaces (libellés clients adaptés), catalogue des modules avec recherche et favoris existants ; outils branchés sur des fonctions, pas sur le texte des boutons.
Objets adressables avec ?item dans le fragment : recherche, listes, notifications et détails. Compatibilité des anciennes routes. Conservation de la recherche, des filtres, du tri et du défilement par périmètre utilisateur.
Formulaires lisibles pour les principaux domaines core : titre, description, sélecteur de projet, responsable, statut et échéance selon le type d’objet. Les valeurs liées non chargées sont conservées. Les champs payload inconnus ne sont pas écrasés. JSON invalide bloquant dans les éditeurs avancés conservés pour les domaines spécialisés.
Recherche locale sur tous les objets chargés, avec pagination visuelle ; extension explicite aux autres données autorisées via les endpoints de listes existants. Périmètre incomplet signalé.
Notifications séparant activité lue et décisions à examiner ; lien source seulement lorsque les métadonnées permettent d’identifier un objet autorisé.
Conversation mobile avec contenu prioritaire, zone de réponse et brouillons dans sessionStorage : isolés par compte/périmètre/session, 24 h maximum, 50 entrées maximum, purge à la déconnexion et repli mémoire si le stockage est bloqué. Aucune synchronisation des brouillons entre appareils ni file d’envoi automatique.
Lecture e-mail pilotée dans son module : champs de recherche conservés, réponses tardives écartées, retour à la liste, action Répondre prioritaire, commandes secondaires regroupées. Le rendu HTML isolé et le blocage des images distantes sont conservés.
Thèmes sémantiques, listes moins encadrées, textes courants lisibles et contrastes renforcés en clair.

## Portée métier et limites
Les formulaires utilisent l’enveloppe générique déjà disponible (title, status, parentId, version, payload). Les décisions sont enregistrées sur l’objet avec contrôle de version et commentaire ; elles ne constituent ni une signature juridique, ni une nouvelle notification garantie au destinataire. La demande de modification reste en attente et conserve le commentaire dans la description de l’objet.
Les modules d’administration spécialisés gardent leurs règles serveur et leurs éditeurs avancés. La saisie est fiabilisée, mais cela n’équivaut pas à un formulaire sur mesure pour tous les métiers possibles.
Aucune migration de schéma, nouvelle API d’IA, nouveau fournisseur, service payant ou connecteur non autorisé n’est ajouté.

## Vérifications automatiques
La CI conserve les suites de sessions, autorisations, activation, sécurité du rendu, navigation et toutes les routes mobiles. Elle ajoute les tests purs focus-model et les parcours focus_flows : recherche stable, résultat au-delà de 30 objets, lien exact et rechargement, création / modification / fin de tâche, payload conservé, notifications liées, brouillon après rechargement et purge à la déconnexion. L’audit axe est étendu à huit états mobiles en thèmes clair/sombre. Les scénarios emploient une API synthétique ; aucune écriture métier réelle.
Les rapports JSON et captures sont archivés par la CI. La publication est bloquée dès qu’un contrôle échoue ; l’exécution des autres suites après une erreur sert à fournir plusieurs diagnostics dans un seul rapport, pas à ignorer les échecs.

## Recette réelle à effectuer
Sur iPhone Safari et mode installé, Android Chrome et tablette : clavier ouvert, rotation, texte agrandi, réseau intermittent, lecture de fichiers réels, session expirée, changement de compte et reprise après verrouillage. Mesurer LCP/INP/CLS sur appareils et réseau réels avant de revendiquer un résultat de performance terrain.
Faire essayer à des représentants direction, collaborateurs et clients : trouver la prochaine action, créer une tâche, retrouver un objet, commenter un livrable, répondre et revenir à une liste filtrée. Relever succès, erreurs, détours et temps sans guider la personne. Ces essais utilisateurs et appareils physiques ne sont pas simulés par les tests de CI.

## Retour arrière
Revenir au commit précédant cette refonte via une PR de revert ; la même pipeline recompile et déploie. Aucun changement backend ou DNS n’est à annuler. Les anciennes routes restent valables.
