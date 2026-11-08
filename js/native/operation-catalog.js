// Extracted from WorkspaceOperationPage; native source remains read-only.
export const OPERATION_PAGES=[
  {
    "id": "op-collaboration",
    "key": "collaboration",
    "title": "Coédition par blocs",
    "summary": "Éditer des blocs partagés, voir les participants et examiner les conflits.",
    "icon": "messages",
    "permissions": []
  },
  {
    "id": "op-aftercare",
    "key": "aftercare",
    "title": "Après les appels",
    "summary": "Conserver une note audio, transcrire un fichier et préparer les suites d’un échange.",
    "icon": "phone",
    "permissions": []
  },
  {
    "id": "op-offline",
    "key": "offline",
    "title": "Fichiers hors ligne",
    "summary": "Choisir les fichiers disponibles sans réseau et vérifier leur version.",
    "icon": "cloud",
    "permissions": []
  },
  {
    "id": "op-repair",
    "key": "repair",
    "title": "Correction des données",
    "summary": "Examiner doublons, relations manquantes et corrections autorisées.",
    "icon": "search",
    "permissions": []
  },
  {
    "id": "op-deliveries",
    "key": "deliveries",
    "title": "Livraisons et versions",
    "summary": "Distinguer versions observées, versions déclarées et couverture fonctionnelle.",
    "icon": "updateRight",
    "permissions": [
      "manageOrganization"
    ]
  },
  {
    "id": "op-attendance",
    "key": "attendance",
    "title": "Pointage par badge",
    "summary": "Vérifier un badge puis confirmer une entrée ou une sortie.",
    "icon": "scan",
    "permissions": [
      "manageTeam",
      "manageHR"
    ]
  },
  {
    "id": "op-review",
    "key": "review",
    "title": "Revue client",
    "summary": "Réunir livrables, versions, annotations et retours du client.",
    "icon": "check",
    "permissions": []
  },
  {
    "id": "op-inbox",
    "key": "inbox",
    "title": "Boîte de réception métier",
    "summary": "Trier les décisions et actions qui demandent votre attention.",
    "icon": "messages",
    "permissions": []
  },
  {
    "id": "op-relationships",
    "key": "relationships",
    "title": "Carte des dossiers",
    "summary": "Explorer les relations accessibles entre les dossiers du Workspace.",
    "icon": "grid",
    "permissions": []
  },
  {
    "id": "op-desks",
    "key": "desks",
    "title": "Espaces mémorisés",
    "summary": "Mémoriser un ensemble de pages et de recherches pour une activité.",
    "icon": "grid",
    "permissions": []
  },
  {
    "id": "op-commitments",
    "key": "commitments",
    "title": "Engagements des échanges",
    "summary": "Préparer une tâche à partir d’un engagement que vous avez sélectionné.",
    "icon": "messages",
    "permissions": []
  },
  {
    "id": "op-forms",
    "key": "forms",
    "title": "Formulaires conditionnels",
    "summary": "Questions conditionnelles, pièces jointes et collecte structurée.",
    "icon": "document",
    "permissions": [
      "manageProjects"
    ]
  },
  {
    "id": "op-approvals",
    "key": "approvals",
    "title": "Circuits d’approbation",
    "summary": "Définir les étapes, les approbateurs et les limites d’un circuit.",
    "icon": "shield",
    "permissions": []
  },
  {
    "id": "op-brands",
    "key": "brands",
    "title": "Bibliothèque de marque",
    "summary": "Retrouver les marques, contenus et règles de présentation autorisés.",
    "icon": "image",
    "permissions": [
      "manageMarketing"
    ]
  },
  {
    "id": "op-retrospectives",
    "key": "retrospectives",
    "title": "Retours d’expérience",
    "summary": "Capitaliser les enseignements d’un projet sans recopier ses données protégées.",
    "icon": "check",
    "permissions": []
  },
  {
    "id": "op-scenarios",
    "key": "scenarios",
    "title": "Scénarios de décision",
    "summary": "Comparer des hypothèses explicites dans une même devise.",
    "icon": "chart",
    "permissions": [
      "viewFinance",
      "manageFinance"
    ]
  },
  {
    "id": "op-access",
    "key": "access",
    "title": "Simulation des droits",
    "summary": "Lire les droits effectifs d’un membre sans ouvrir sa session.",
    "icon": "shield",
    "permissions": [
      "manageAccess"
    ]
  },
  {
    "id": "op-recovery",
    "key": "recovery",
    "title": "Restauration sélective",
    "summary": "Examiner une ancienne version avant de préparer sa restauration.",
    "icon": "shield",
    "permissions": []
  },
  {
    "id": "op-presentation",
    "key": "presentation",
    "title": "Présentation confidentielle",
    "summary": "Présenter une sélection de contenus sans afficher les données internes.",
    "icon": "lock",
    "permissions": []
  },
  {
    "id": "op-glossary",
    "key": "glossary",
    "title": "Glossaire métier",
    "summary": "Comprendre les statuts, les sources et le vocabulaire de gestion.",
    "icon": "document",
    "permissions": []
  },
  {
    "id": "op-sandbox",
    "key": "sandbox",
    "title": "Bac à sable des automatisations",
    "summary": "Simuler une règle sur un événement isolé sans exécuter ses actions.",
    "icon": "grid",
    "permissions": [
      "manageAutomations"
    ]
  },
  {
    "id": "op-assistant",
    "key": "assistant",
    "title": "Assistant contextualisé",
    "summary": "Préparer une note locale à partir de références accessibles et explicites.",
    "icon": "sparkles",
    "permissions": []
  },
  {
    "id": "op-feedback",
    "key": "feedback",
    "title": "Feedback produit",
    "summary": "Rassembler les suggestions, les votes et les décisions produit.",
    "icon": "star",
    "permissions": []
  },
  {
    "id": "op-incident",
    "key": "incident",
    "title": "Mode incident",
    "summary": "Réunir chronologie, tâches, échanges et documents d’une cellule d’incident.",
    "icon": "warning",
    "permissions": [
      "manageRisks",
      "manageSupport",
      "manageOrganization"
    ]
  }
];
