# Squared Workspace Web — Quality Standard

## Niveau cible

- WCAG 2.2 AA comme base d’accessibilité.
- Cibles interactives d’au moins 24 × 24 CSS px, et 44 px sur pointeur tactile quand l’interface le permet.
- Focus clavier toujours visible et non masqué par la topbar ou la tab bar.
- Dialogues selon le pattern WAI-ARIA : focus contenu dans la modale, Escape pour fermer, retour du focus à l’élément déclencheur, arrière-plan inerte.
- Navigation SPA annoncée aux technologies d’assistance et accès direct au contenu via skip link.
- prefers-reduced-motion, prefers-reduced-transparency et forced-colors pris en charge.
- Aucun rendu métier via innerHTML, eval, document.write ou équivalent.

## Performance

Objectifs terrain au 75e percentile : LCP ≤ 2,5 s ; INP ≤ 200 ms ; CLS ≤ 0,1.
Le client charge uniquement le module métier de la page demandée. La CI impose un budget gzip sur le noyau JavaScript et les feuilles CSS.

## PWA

Les mises à jour sont atomiques : le nouveau Service Worker prépare le shell, attend, puis l’utilisateur choisit quand actualiser. Les réponses API authentifiées ne sont jamais mises en cache.

## Sécurité navigateur

- CSP déclarative.
- Referrer policy no-referrer.
- Jeton de renouvellement limité au stockage de session de l’onglet.
- Aucun cache applicatif des réponses API authentifiées.
- Rendu des données avec les API DOM textuelles, sans injection HTML arbitraire.

## Validation avant production

1. Validation de tous les modules ES et ressources.
2. Budgets sécurité, accessibilité et performance.
3. Tests unitaires de session.
4. Tests navigateur desktop/mobile, auth et clavier.
5. Génération réussie de l’artefact GitHub Pages.
