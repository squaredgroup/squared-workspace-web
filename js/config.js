export const APP_NAME = "Squared Workspace";

export const API_BASE_URL = String(window.SQUARED_CONFIG?.apiBaseUrl || "https://workspace.squaredgroup.studio").replace(/\/$/, "");
export const WEB_BASE_URL = String(window.SQUARED_CONFIG?.webBaseUrl || location.origin).replace(/\/$/, "");
export function apiURL(path = "") { return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`; }
export function realtimeURL(path = "/v1/realtime") {
  const url = new URL(apiURL(path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}


export const ICONS = {
  dashboard:"SidebarDashboard", today:"SidebarToday", projects:"SidebarProjects", missions:"SidebarMissions", tasks:"SidebarTasks", planning:"SidebarPlanning", map:"SidebarMap",
  businessUnits:"SidebarBusinessUnits", objectives:"SidebarObjectives", reports:"SidebarReports", finance:"SidebarFinance", timeExpenses:"SidebarTimeExpenses",
  validations:"SidebarValidations", deliverables:"SidebarDeliverables", contracts:"SidebarContracts", documents:"SidebarDocuments", resources:"SidebarResources",
  siteServices:"SidebarSiteServices", siteProducts:"SidebarSiteProducts", siteReferences:"SidebarSiteReferences", siteReleases:"SidebarSiteReleases", sitePublications:"SidebarSitePublications", siteMedia:"SidebarSiteMedia",
  messages:"CircleMessages", mailbox:"Mail", notifications:"Notification", activity:"Clock", clients:"Company", team:"Users", people:"User", securityOperations:"Shield", governance:"SidebarGovernance", support:"HelpSign", marketing:"Sparkles", automations:"Sync", training:"Star", profile:"User", settings:"Settings",
  siteHelp:"HelpSign", siteTraining:"Star", siteInbox:"Mail", siteNewsletter:"Mail", siteSystem:"Grid", commercial:"Money", suppliers:"Bag",
  folder:"Folder", chart:"Chart", globe:"Globe", archive:"Archive", calendar:"Calendar", clock:"Clock", users:"Users", wallet:"Wallet", trend:"Trend", money:"Money", bag:"Bag", warning:"Warning", shield:"Shield", document:"Document", check:"Check", company:"Company", key:"Key", user:"User", star:"Star", grid:"Grid", sliders:"Sliders", phone:"Phone", mail:"Mail", cloud:"Cloud", image:"Image", sync:"Sync", settings:"Settings", invoice:"Invoice", lock:"Lock", sparkles:"Sparkles", search:"Search", add:"Add", edit:"Edit", trash:"Trash", logout:"Logout", send:"Send", download:"Download", upload:"Upload", external:"External", close:"Close", sun:"Sun", moon:"Moon"
};

export function iconPath(name, fill=false){
  const token = ICONS[name] || name || "Grid";
  const prefix = fill ? "IconlyFill" : "IconlyRegular";
  return `/assets/icons/${prefix}${token}.svg`;
}

const p = (title,id,summary,icon="document",permissions=[]) => ({ title,id:id||slug(title),summary,icon,permissions });
const enterprise = (titles, icon) => titles.map(title => p(title,slug(title),`Consultez et pilotez ${title.toLowerCase()} depuis cet espace.`,icon));
export function slug(value){ return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }

export const SECTIONS = {
  businessUnits:{title:"Pôles & entités",group:"Pilotage",permissions:["manageBusinessUnits"]},
  objectives:{title:"Objectifs",group:"Pilotage",permissions:["manageObjectives"],subpages:enterprise(["Vision annuelle","Objectifs du groupe","Objectifs par pôle","Résultats clés","Revues","Historique"],"trend")},
  reports:{title:"Rapports",group:"Pilotage",permissions:["viewReports"],subpages:enterprise(["Direction","Finance","Commercial","Projets","Rentabilité","Ressources humaines","Clients","Marketing","Sécurité","Personnalisés"],"chart")},

  dashboard:{title:"Tableau de bord",group:"Général"}, today:{title:"Aujourd’hui",group:"Général"},
  projects:{title:"Projets",group:"Général",subpages:[p("Projets Workspace","workspace","Suivez les projets actifs, leurs responsables et leur progression.","folder"),p("Portefeuille","portfolio","Arbitrez valeur, budget, capacité et risques du portefeuille.","chart",["manageProjects"]),p("Publication","publication","Préparez les projets destinés au site Squared Group.","globe",["manageCMS"]),p("Archives","archives","Restaurez ou purgez les projets retirés du portefeuille.","archive",["manageProjects"])]},
  missions:{title:"Missions",group:"Général"}, tasks:{title:"Tâches",group:"Général"},
  planning:{title:"Planning",group:"Général",subpages:[p("Planning personnel","personal","Organisez votre semaine type et vos routines personnelles.","calendar"),p("Agenda connecté","connected","Réunissez événements Workspace et calendriers connectés.","clock"),p("Rendez-vous","appointments","Gérez les rendez-vous synchronisés depuis le site.","users",["manageCMS"])]},
  map:{title:"Carte",group:"Général"},

  finance:{title:"Finance",group:"Finance",permissions:["viewFinance","manageFinance"],subpages:enterprise(["Devis & ventes","Factures clients","Achats & dépenses","Trésorerie","Budgets","Flux inter-pôles","Comptabilité"],"wallet")},
  timeExpenses:{title:"Temps & dépenses",group:"Finance",permissions:["manageTimesheets"],subpages:enterprise(["Feuilles de temps","Dépenses","Capacité","Rentabilité"],"clock")},

  siteServices:{title:"Services",group:"Offre",permissions:["manageCMS"],cms:true}, siteProducts:{title:"Produits",group:"Offre",permissions:["manageCMS"],cms:true}, siteReferences:{title:"Références",group:"Offre",permissions:["manageCMS"],cms:true}, siteReleases:{title:"Vie des produits",group:"Offre",permissions:["manageCMS"],cms:true},

  validations:{title:"Validations",group:"Décision",subpages:[p("À décider","pending","Traitez les validations qui attendent une décision.","warning"),p("Historique","history","Retrouvez les décisions approuvées ou refusées.","clock")]},
  deliverables:{title:"Livrables",group:"Décision"},
  contracts:{title:"Contrats",group:"Décision",permissions:["manageContracts"],subpages:[p("Contrats","contracts","Suivez signatures, montants et échéances contractuelles.","invoice"),p("Centre juridique","legal","Centralisez obligations, parties et engagements juridiques.","shield",["viewLegal","manageLegal"])]},
  governance:{title:"Gouvernance",group:"Décision",permissions:["manageRisks","manageCompliance"],subpages:[p("Registre des risques",null,null,"warning",["manageRisks"]),p("Incidents",null,null,"warning",["manageRisks"]),p("Conformité",null,null,"shield",["manageCompliance"]),p("Politiques",null,null,"document",["manageCompliance"]),p("Obligations",null,null,"check",["manageCompliance"]),p("RGPD",null,null,"lock",["manageCompliance"]),p("Audits",null,null,"search",["manageCompliance"]),p("Réunions",null,null,"users",["manageRisks"]),p("Décisions",null,null,"shield",["manageRisks"])]},

  training:{title:"Formation BUILD",group:"Documentation"}, siteTraining:{title:"CMS Formation",group:"Documentation",permissions:["manageCMS"],cms:true},
  sitePublications:{title:"Publications",group:"Documentation",permissions:["manageCMS"],cms:true,subpages:[p("Publications","publications","Gérez les contenus éditoriaux publiés sur le site.","document"),p("Opportunités","opportunities","Suivez les opportunités éditoriales et commerciales du site.","trend")]},
  documents:{title:"Documents",group:"Documentation"}, siteMedia:{title:"Médias",group:"Documentation",permissions:["manageCMS"],cms:true}, resources:{title:"Ressources",group:"Documentation"}, siteHelp:{title:"Centre d’aide",group:"Documentation",permissions:["manageCMS"],cms:true},

  commercial:{title:"Commercial",group:"Relations",permissions:["manageSales"],subpages:enterprise(["Prospects","Opportunités","Pipeline","Propositions","Relances","Prévisions"],"money")},
  clients:{title:"Clients",group:"Relations",permissions:["manageClients"],subpages:[p("Organisations","organizations","Pilotez les organisations clientes et leur portefeuille.","company"),p("Contacts","contacts","Retrouvez les interlocuteurs et décideurs de chaque compte.","users",["manageClients"]),p("Accès Workspace","access","Contrôlez les accès accordés aux membres clients.","key",["manageTeam"]),p("Comptes du site","site-accounts","Gérez les comptes clients synchronisés avec le site.","globe",["manageCMS"])]},
  people:{title:"People",group:"Relations",permissions:["viewPeople","managePeople","reviewPeople","configurePeople"],subpages:[p("Personnes",null,null,"users"),p("Évaluations",null,null,"check"),p("Profils",null,null,"user"),p("Compétences",null,null,"star"),p("Potentiel",null,null,"trend"),p("Mission Fit",null,null,"grid"),p("Développement",null,null,"trend"),p("Revues",null,null,"search"),p("Banque de questions",null,null,"document",["configurePeople"]),p("Règles",null,null,"sliders",["configurePeople"]),p("Analytique",null,null,"chart"),p("Réglages",null,null,"settings",["configurePeople"])]},
  siteInbox:{title:"Demandes",group:"Relations",permissions:["manageCMS"],cms:true}, suppliers:{title:"Fournisseurs",group:"Relations",permissions:["manageSuppliers"],subpages:enterprise(["Annuaire","Contacts","Contrats","Commandes","Factures","Évaluations","Risques","Disponibilités"],"bag")},

  marketing:{title:"Marketing",group:"Marketing",permissions:["manageMarketing"],subpages:enterprise(["Campagnes","Calendrier éditorial","Audiences","Formulaires","Acquisition","Référencement","Consentements"],"sparkles")}, siteNewsletter:{title:"Newsletter",group:"Marketing",permissions:["manageCMS"]},

  messages:{title:"Messages",group:"Communication"},
  mailbox:{title:"E-mails",group:"Communication",permissions:["viewMail"],subpages:[p("Boîte mail","mailbox","Consultez, classez et recherchez les échanges externes.","mail"),p("Connexion","connections","Administrez la connexion sécurisée à Google Workspace.","sync",["manageMailSettings"]),p("Modèles","templates","Préparez des modèles personnalisés et dynamiques.","document",["sendMail","organizeMail","manageMailSettings"]),p("Identité & style","appearance","Contrôlez le branding et le rendu des e-mails envoyés.","image",["manageMailSettings"])]},
  notifications:{title:"Notifications",group:"Communication"}, activity:{title:"Activité",group:"Communication",subpages:[p("Activité","activity","Explorez les actions récentes de votre espace.","clock"),p("Journal d’audit","audit","Contrôlez les opérations sensibles et leur traçabilité.","shield")]},

  team:{title:"Équipe",group:"Administration",permissions:["manageTeam"],subpages:[p("Membres","members","Consultez les rôles, disponibilités et charges de l’équipe.","users"),p("Ressources humaines","human-resources","Gérez le cycle de vie RH et ses informations protégées.","company",["viewHR","manageHR"])]},
  support:{title:"Support",group:"Administration",permissions:["manageSupport","createSupportRequests"],subpages:[p("Tickets clients",null,null,"phone"),p("Demandes internes",null,null,"mail",["manageSupport"]),p("Incidents techniques",null,null,"warning",["manageSupport"]),p("SLA",null,null,"clock",["manageSupport"]),p("Satisfaction",null,null,"star",["manageSupport"]),p("Base de connaissances",null,null,"cloud",["manageSupport"])]},
  securityOperations:{title:"Appareils & serveurs",group:"Administration",adminOnly:true,subpages:[p("Appareils","devices","Supervisez les appareils et sessions des membres.","user"),p("Serveurs","servers","Surveillez la santé et la charge de l’infrastructure.","chart"),p("Contrôle","control","Accédez aux actions de sécurité et au plan de contrôle.","shield"),p("Parc informatique","technology-assets","Gérez équipements, licences, garanties et accès sensibles.","bag",["manageAssets"])]},
  automations:{title:"Automatisations",group:"Administration",permissions:["manageAutomations"],subpages:enterprise(["Scénarios","Modèles","Exécutions","Erreurs"],"sync")}, siteSystem:{title:"Intégrations",group:"Administration",permissions:["manageCMS"],cms:true}, profile:{title:"Profil",group:"Administration"}, settings:{title:"Paramètres",group:"Administration"}
};

export const NAV_GROUPS = ["Pilotage","Général","Finance","Offre","Décision","Documentation","Relations","Marketing","Communication","Administration"].map(name => ({name,sections:Object.keys(SECTIONS).filter(key=>SECTIONS[key].group===name)}));

export const CORE_DOMAIN_BY_SECTION = {projects:"projects",missions:"missions",tasks:"tasks",validations:"validations",deliverables:"deliverables",contracts:"contracts",documents:"documents",resources:"resources",clients:"clients",planning:"events",notifications:"notifications",activity:"activities"};

export const SPECIALIZED_BY_SECTION = {
  businessUnits:["business-units","legal-entities","establishments","cost-centers","memberships"],
  objectives:["metric-definitions","metric-values","metric-targets","metric-scenarios","data-quality-observations"],
  reports:["metric-definitions","metric-values","metric-targets","metric-scenarios","data-quality-observations"],
  finance:["quotes","quote-lines","invoices","invoice-lines","payments","expenses","purchase-orders","purchase-order-lines","supplier-bills","tax-rates","ledger-accounts","cash-accounts","revenue-recognition-entries","financial-forecasts","fiscal-periods","intercompany-transactions","consolidation-entries"],
  timeExpenses:["time-entries","expenses","capacity-snapshots","resource-bookings","day-rates","project-economics"],
  commercial:["leads","opportunities","sales-stages","quotes","quote-lines","proposals","sales-activities","sales-forecasts","renewals"],
  suppliers:["suppliers","purchase-orders","purchase-order-lines","supplier-bills"],
  governance:["policies","controls","compliance-evidence","compliance-incidents","legal-obligations"],
  support:["tickets","service-level-agreements","service-incidents","problems","service-changes"],
  marketing:["brands","brand-audiences","brand-campaigns","brand-contents","brand-channels"],
  automations:["automation-definitions"],
  securityOperations:["technology-assets","software-licenses","warranties"],
  team:["employment-contracts","compensations","work-schedules","leave-requests","onboarding-plans","positions","career-events","trainings"],
  contracts:["legal-parties","contract-clauses","legal-obligations","amendments","intellectual-property","policies","controls","compliance-evidence","compliance-incidents"]
};

export const SUBPAGE_DOMAIN_HINTS = {
  "finance:devis-ventes":["quotes","quote-lines"], "finance:factures-clients":["invoices","invoice-lines","payments"], "finance:achats-depenses":["purchase-orders","purchase-order-lines","expenses","supplier-bills"], "finance:tresorerie":["cash-accounts","payments","financial-forecasts"], "finance:comptabilite":["ledger-accounts","tax-rates","revenue-recognition-entries","fiscal-periods","consolidation-entries"], "finance:flux-inter-poles":["intercompany-transactions"],
  "timeExpenses:feuilles-de-temps":["time-entries"],"timeExpenses:depenses":["expenses"],"timeExpenses:capacite":["capacity-snapshots","resource-bookings"],"timeExpenses:rentabilite":["project-economics","day-rates"],
  "commercial:prospects":["leads"],"commercial:opportunites":["opportunities"],"commercial:pipeline":["opportunities","sales-stages"],"commercial:propositions":["proposals","quotes"],"commercial:relances":["sales-activities","renewals"],"commercial:previsions":["sales-forecasts"],
  "suppliers:annuaire":["suppliers"],"suppliers:commandes":["purchase-orders","purchase-order-lines"],"suppliers:factures":["supplier-bills"],
  "governance:politiques":["policies"],"governance:conformite":["controls","compliance-evidence"],"governance:incidents":["compliance-incidents"],"governance:obligations":["legal-obligations"],
  "support:tickets-clients":["tickets"],"support:incidents-techniques":["service-incidents","problems"],"support:sla":["service-level-agreements"],
  "marketing:campagnes":["brand-campaigns"],"marketing:audiences":["brand-audiences"],"marketing:calendrier-editorial":["brand-contents","brand-channels"],
  "automations:scenarios":["automation-definitions"],
  "securityOperations:technology-assets":["technology-assets","software-licenses","warranties"],
  "team:human-resources":["employment-contracts","compensations","work-schedules","leave-requests","onboarding-plans","positions","career-events","trainings"],
  "contracts:legal":["legal-parties","contract-clauses","legal-obligations","amendments","intellectual-property","policies","controls","compliance-evidence","compliance-incidents"]
};

export const SECTION_DESCRIPTIONS = {
  dashboard:"Vue exécutive de l’activité, des priorités et de la santé de Squared Workspace.", today:"Votre centre d’attention pour les actions, échéances et décisions du jour.", projects:"Arbitrez le portefeuille, suivez la production et retrouvez les projets publiés ou archivés.", missions:"Pilotez les missions actives, leurs responsables et leur exécution.", tasks:"Centralisez l’exécution quotidienne et les prochaines actions.", planning:"Passez de votre semaine personnelle aux agendas connectés et aux rendez-vous du site.", map:"Visualisez les activités et entités disposant de données géographiques.", businessUnits:"Structurez les pôles, entités juridiques, établissements et centres de coûts du groupe.", objectives:"Reliez la vision du groupe aux objectifs, métriques et revues.", reports:"Accédez aux lectures décisionnelles de chaque fonction et aux données de pilotage.", finance:"Suivez le cycle financier complet, du devis à la comptabilité et aux flux inter-pôles.", timeExpenses:"Rapprochez le temps, les dépenses, la capacité disponible et la rentabilité réelle.", commercial:"Pilotez la relation commerciale depuis le prospect jusqu’aux prévisions de signature.", suppliers:"Centralisez vos partenaires, commandes, factures et risques fournisseurs.", validations:"Traitez les décisions ouvertes puis retrouvez leur historique complet.", governance:"Structurez conformité, contrôles, politiques, obligations et incidents.", clients:"Réunissez organisations, contacts et accès numériques dans une vue relationnelle.", people:"Explorez les profils, compétences, évaluations et parcours de développement.", team:"Gérez les membres et les processus RH depuis deux espaces séparés.", contracts:"Passez du suivi contractuel opérationnel au centre juridique du groupe.", support:"Orientez chaque demande vers le bon circuit de support.", marketing:"Organisez marques, campagnes, audiences et contenus.", mailbox:"Consultez, classez et envoyez les échanges externes.", messages:"Échangez dans les conversations internes synchronisées en temps réel.", activity:"Consultez l’activité courante et les traces d’audit.", securityOperations:"Supervisez les appareils, sessions, serveurs et actifs informatiques.", automations:"Concevez les scénarios et surveillez leur exécution.", profile:"Gérez votre identité, vos coordonnées et la sécurité de votre compte.", settings:"Réglez l’expérience Workspace et vos préférences.", training:"Accédez au parcours Squared BUILD lié à votre compte.", siteNewsletter:"Pilotez les abonnés et campagnes de newsletter.", siteServices:"Administrez les services du site Squared Group.", siteProducts:"Administrez les produits du site Squared Group.", siteReferences:"Administrez les références et éléments de marque du site.", siteReleases:"Administrez la vie des produits publiée sur le site.", sitePublications:"Pilotez les contenus éditoriaux synchronisés avec Wix.", siteHelp:"Administrez le contenu du centre d’aide.", siteMedia:"Administrez les médias exposés sur le site.", siteTraining:"Administrez les collections Wix de la formation BUILD.", siteInbox:"Consultez les demandes remontées depuis le site.", siteSystem:"Surveillez les intégrations Wix et les connexions de service."
};

export function canAccessSection(sectionKey,user){
  const section=SECTIONS[sectionKey]; if(!section||!user) return false;
  if(section.adminOnly && !["OWNER","ADMIN"].includes(user.role)) return false;
  if(section.permissions?.length && !section.permissions.some(p=>user.permissions?.includes(p))) return false;
  return true;
}
export function canAccessSubpage(page,user){ return !page?.permissions?.length || page.permissions.some(p=>user?.permissions?.includes(p)); }
