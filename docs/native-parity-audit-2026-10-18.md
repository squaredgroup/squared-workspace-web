# Audit de parité — Squared Workspace natif vers Web

Date de référence : 18 octobre 2026

Branche Web : `codex/native-parity-october-2026`

Base Web auditée : `origin/main` à `7c7dc98`

## Résultat exécutif

Le Web n’était pas resté à la version du 21 septembre : il avait reçu des évolutions jusqu’au 1er octobre. L’écart principal correspond aux changements natifs du 1er au 18 octobre.

La couverture Web est déjà large : authentification, dashboard, projets, tâches, messages, mail, profils, photos, tables métier et CMS historique. Elle n’était cependant plus organisée comme l’app et ne connaissait pas le nouveau CMS Studio. Cette branche remet d’abord en parité les fondations visibles et les nouveaux contrats serveur sans supprimer les routes historiques.

## Sources comparées

- Navigation et permissions natives : `WorkspaceNavigation.swift`.
- Design : `WorkspaceTheme.swift`, `WorkspaceTypography.swift`, sidebar, top bar et composants partagés.
- Paramètres : `SettingsView.swift` et ses 28 rubriques.
- CMS : `WorkspaceWebContentHubView.swift`, les composants `WorkspaceCMSStudio*` et les routes `/v1/cms-studio`.
- Consolidation métier : `CONSOLIDATION-2026-10-18.md`, `CONTINUITE-2026-10-18.txt`, `BUSINESS_COMPLETION-2026-10-17.txt` et `AUDIT-ERP-2026-10-18.txt`.
- Mobile : `MOBILE_ADAPTATION.md` et les composants adaptatifs natifs.
- Web : configuration de routes, shell, modules, clients API, styles, PWA et suites navigateur.

L’app native contient aussi des modifications locales non versionnées. Elles ont été étudiées comme état en cours, mais aucune promesse Web ne repose uniquement sur un fichier non stabilisé.

## Matrice de parité

| Domaine | App native au 18 octobre | Web avant cette branche | État dans cette branche |
| --- | --- | --- | --- |
| Shell desktop | 9 espaces principaux, administration intégrée | 10 groupes et de nombreuses pages CMS dupliquées | 9 espaces, routes profondes conservées |
| Navigation mobile | Accueil, Projets, Tâches, Messages, Plus | Accueil, Travail, À traiter, Messages, Espaces | libellés et destinations alignés |
| Calendrier | espace unifié, sources et rendez-vous non datés | trois calendriers séparés | entrée renommée et navigation unifiée ; agrégation fonctionnelle avancée encore à compléter |
| Design | fond `#08090B`, cartes `#101214`, Wix Madefor Display/Text | palette proche, Space Grotesk | tokens et polices natives intégrés |
| Paramètres | 28 rubriques, fonctions d’administration intégrées | apparence et sessions seulement | annuaire complet relié aux pages Web existantes ; contrôles propres à certaines rubriques encore à approfondir |
| Mes sites | CMS Studio multi-site complet | écrans Wix par collection | hub multi-site réel, onglets, brouillons, historique, publication, médias et réglages |
| Formulaires métier | 83 schémas typés et circuits guidés | éditeurs dynamiques et plusieurs modules spécialisés | couverture existante conservée ; transitions guidées récentes à brancher module par module |
| Synchronisation | états local/en attente/serveur/conflit | lecture ETag, reprise de révision et erreurs | état global conservé ; brouillons chiffrés natifs non simulés dans le navigateur |
| Mobile | cinq onglets, cibles tactiles, formulaires adaptatifs | shell responsive et outils mobiles | navigation alignée, 320–1440 px recettés |
| Accessibilité | Dynamic Type et libellés natifs | axe et clavier Web | axe clair/sombre et routes mobiles contrôlés |

## Changements livrés dans ce lot

### Navigation et design

- Sidebar réduite et structurée autour des neuf espaces de l’app.
- État actif calculé au niveau de l’espace : une ancienne page CMS garde « Mes sites » actif.
- Accès distinct aux Paramètres et au profil dans le pied de sidebar.
- Navigation mobile identique à l’app.
- Wix Madefor Text pour l’interface et Wix Madefor Display pour les titres.
- Palette sombre alignée sur les tokens natifs et commandes de top bar plus compactes.
- Anciennes URLs, recherche globale, favoris et page Plus conservés.

### Mes sites

Le Web utilise maintenant les routes serveur du CMS Studio, et non une copie locale :

- liste et sélection des sites ;
- vue d’ensemble et indicateurs réellement renvoyés ;
- collections et recherche serveur ;
- filtres de statut ;
- création et modification de brouillons selon le schéma ;
- révisions indépendantes, historique et commentaires visibles ;
- publication explicite selon les droits ;
- médiathèque par site ;
- configuration du site, langues et mesure agrégée.

Les limites natives restent respectées : le Web ne se présente pas comme un éditeur de mise en page Wix, ne fabrique pas de trafic et ne transforme pas un échec réseau en compteurs à zéro.

### Paramètres

Le centre Web expose les rubriques natives et relie les destinations déjà fonctionnelles : compte, sécurité, notifications, membres, e-mails, données, projets, calendrier, People, automatisations, conformité, appareils, activité et support. Les réglages d’apparence, de densité, de largeur, de langue, de fuseau, de sidebar et de mouvement continuent d’être enregistrés par l’API réelle.

## Écarts qui ne doivent pas être masqués

1. Le calendrier Web ne fusionne pas encore toutes les sources natives dans une grille Jour/Semaine/Mois équivalente.
2. Les nouveaux circuits guidés finance, achats, clients, rapports, automatisations, données personnelles et paiements ont des routes serveur, mais toutes leurs commandes ne disposent pas encore d’une interface Web spécialisée.
3. La reprise locale chiffrée de tous les anciens éditeurs reste propre à l’app native ; le Web ne doit pas annoncer un hors-ligne complet.
4. La prévisualisation CMS Web rend les données et le contenu ; l’habillage exact Wix/Docs/Build exige un raccordement public par site.
5. Une recette par fixtures ne vaut pas une validation avec le compte réel, Gmail, Stripe, SumUp, Wix, APNs ou les droits de production.

Ces écarts sont des limites fonctionnelles explicites, pas des écrans artificiellement marqués « terminés ».

## Validation de cette branche

- TypeScript sans erreur.
- 51 modules JavaScript liés et ressources vérifiées.
- Budgets initiaux : environ 62 Ko JS gzip et 56 Ko CSS gzip avant compilation Vite.
- 17 tests unitaires après ajout des invariants de navigation native.
- Build et staging de production réussis.
- Audit axe : connexion, dashboard et huit états mobiles clair/sombre.
- 15 scénarios navigateur de connexion, MFA, session, expiration et réseau.
- 105 contrôles responsive des parcours principaux de 320 à 1 440 px.
- 237 contrôles route/sous-page sur 47 sections, sans ressource manquante ni erreur JavaScript inattendue.

Tous les scénarios utilisent des fixtures synthétiques. Aucune donnée de production n’a été créée, modifiée, envoyée ou supprimée.

## Garde de fusion

La branche ne doit être fusionnée dans `main` que si :

1. les contrôles locaux restent verts ;
2. la CI GitHub est verte ;
3. la recette publique post-déploiement confirme la nouvelle release ;
4. aucune régression de compte réel n’est détectée dans la connexion, le dashboard, les messages, les e-mails et Mes sites.
