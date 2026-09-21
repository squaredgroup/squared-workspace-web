import { state,setRoute } from "../store.js";
import { loadWorkspace,loadDomainCatalog,listSpecialized } from "../api.js";
import { h,pageHeader,card,row,emptyState,statCard,formatDate,relativeDate,button,icon,progressBar } from "../ui.js";

const arrays=workspace=>({
  projects:workspace?.projects||[],
  missions:workspace?.missions||[],
  tasks:workspace?.tasks||[],
  validations:workspace?.validations||[],
  deliverables:workspace?.deliverables||[],
  notifications:workspace?.notifications||[]
});
const statusOf=value=>String(value?.status||value?.payload?.status||"").toLowerCase();
const active=values=>values.filter(v=>!/(completed|done|archived|closed|approved|rejected|cancelled|canceled)/i.test(statusOf(v)));
const titleOf=value=>value?.title||value?.payload?.title||value?.name||"Sans titre";
const dueOf=value=>value?.dueAt||value?.due_at||value?.payload?.dueAt||value?.payload?.due_at||null;
const updatedOf=value=>value?.updatedAt||value?.updated_at||value?.payload?.updatedAt||value?.createdAt||value?.created_at||null;
function greeting(){
  const hour=new Date().getHours();
  return hour<12?"Bonjour":hour<18?"Bon après-midi":"Bonsoir";
}
function pulse(iconName,title,copy){return h("div",{class:"pulse-item"},h("div",{class:"pulse-icon"},icon(iconName,16)),h("div",{class:"pulse-copy"},h("strong",{text:title}),h("span",{text:copy})))}
function quick(label,section,iconName,subpage=""){return button(label,{iconName,kind:"ghost",onClick:()=>setRoute(section,subpage)})}

export async function renderDashboard(today=false){
  const root=h("div");
  const workspace=await loadWorkspace();
  const data=arrays(workspace);
  const tasks=active(data.tasks),projects=active(data.projects),missions=active(data.missions),validations=active(data.validations);
  const unread=data.notifications.filter(v=>!(v.isRead??v.payload?.isRead)).length;
  const completedTasks=data.tasks.filter(value=>/(completed|done|closed)/i.test(statusOf(value))).length;
  const taskProgress=data.tasks.length?completedTasks/data.tasks.length*100:0;
  const overdue=[...tasks,...missions].filter(value=>dueOf(value)&&new Date(dueOf(value)).getTime()<Date.now()).length;
  const name=(state.user?.firstName||state.user?.first_name||state.user?.name||"").split(" ")[0];
  const currentDate=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date());

  root.append(pageHeader({
    eyebrow:today?"Focus":"Squared Group",
    title:today?"Aujourd’hui":"Tableau de bord",
    subtitle:today?"Un espace resserré sur ce qui doit avancer maintenant.":"Vue exécutive de votre périmètre Squared Workspace, synchronisée avec les données de l’app."
  }));

  root.append(h("section",{class:"executive-hero"},
    h("div",{},
      h("div",{class:"hero-kicker",text:today?currentDate:"Executive Workspace"}),
      h("div",{class:"hero-title",text:`${greeting()}${name?", "+name:""}.`}),
      h("div",{class:"hero-copy",text:today?"Priorisez les tâches, décisions et échéances réellement utiles aujourd’hui.":"Le groupe, vos projets et vos décisions restent réunis dans un seul système opérationnel, avec les mêmes accès que dans Squared Workspace."}),
      h("div",{class:"hero-meta"},
        quick("Voir aujourd’hui","today","clock"),
        quick("Projets","projects","folder","workspace"),
        quick("Tâches","tasks","check"),
        quick("Messages","messages","mail")
      )
    ),
    h("div",{class:"hero-side"},
      pulse(state.online?"sync":"warning",state.online?"Connecté à Workspace":"Mode hors ligne",state.online?(state.lastSyncAt?`Dernière synchro ${relativeDate(state.lastSyncAt)}`:"Synchronisation active"):"Les données serveur seront actualisées au retour du réseau."),
      pulse("user",state.user?.role||"Membre","Accès et navigation adaptés à votre rôle."),
      pulse("shield","Accès cloisonné","Seules les données autorisées par votre compte sont chargées.")
    )
  ));

  root.append(h("div",{class:"grid stats"},
    statCard("Projets actifs",projects.length,"Portefeuille en cours","folder"),
    statCard("Tâches ouvertes",tasks.length,"Exécution opérationnelle","check"),
    statCard("Décisions",validations.length,"Validations à traiter","warning"),
    statCard("Notifications",unread,"Éléments non lus","notification")
  ));

  root.append(h("section",{class:"decision-grid section-gap","aria-label":"Centre de décision"},
    h("article",{class:"decision-card primary"},h("div",{class:"decision-icon"},icon("check",18)),h("div",{},h("span",{text:"Avancement des tâches"}),h("strong",{text:data.tasks.length?`${completedTasks} sur ${data.tasks.length} terminées`:"Aucune tâche mesurée"}),progressBar(taskProgress,"Tâches terminées"))),
    h("article",{class:`decision-card ${overdue?"warning":""}`},h("div",{class:"decision-icon"},icon(overdue?"warning":"clock",18)),h("div",{},h("span",{text:"Échéances dépassées"}),h("strong",{text:overdue?`${overdue} élément${overdue>1?"s":""} à reprendre`:"Aucun retard détecté"}),h("p",{text:overdue?"Ouvrez Aujourd’hui pour réorganiser les priorités.":"Le périmètre visible reste dans les délais."})),overdue?quick("Agir","today","clock"):null),
    h("article",{class:"decision-card"},h("div",{class:"decision-icon"},icon("notification",18)),h("div",{},h("span",{text:"Signal à traiter"}),h("strong",{text:unread?`${unread} notification${unread>1?"s":""} non lue${unread>1?"s":""}`:"Tout est lu"}),h("p",{text:unread?"Les nouveaux événements sont regroupés au même endroit.":"Aucun signal ne demande votre attention."})),unread?quick("Consulter","notifications","notification"):null)
  ));

  const due=[...tasks,...missions,...validations]
    .map(value=>({value,date:dueOf(value)}))
    .filter(item=>item.date)
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .slice(0,8);
  const recent=[...data.projects,...data.tasks,...data.deliverables]
    .filter(updatedOf)
    .sort((a,b)=>new Date(updatedOf(b))-new Date(updatedOf(a)))
    .slice(0,8);

  root.append(h("div",{class:"grid two section-gap"},
    card(today?"À traiter maintenant":"Prochaines échéances",today?"Les éléments datés qui demandent votre attention.":"Ce qui approche dans votre périmètre Workspace.",
      due.length?h("div",{class:"list"},...due.map(({value,date})=>row({
        title:titleOf(value),
        subtitle:value?.payload?.projectName||value?.payload?.detail||"Workspace",
        status:value.status||value.payload?.status,
        meta:formatDate(date)
      }))):emptyState("Rien d’urgent","Aucune échéance proche ne demande d’action immédiate.","check"),
      {iconName:"clock"}
    ),
    card("Activité récente","Dernières modifications synchronisées depuis les domaines opérationnels.",
      recent.length?h("div",{class:"list"},...recent.map(value=>row({
        title:titleOf(value),
        subtitle:value?.payload?.detail||prettySource(value),
        status:value.status||value.payload?.status,
        meta:relativeDate(updatedOf(value))
      }))):emptyState("Aucune activité","Les prochaines modifications apparaîtront ici.","trend"),
      {iconName:"trend"}
    )
  ));

  if(projects.length){
    root.append(card("Portefeuille actif","Les projets actuellement ouverts dans votre périmètre.",
      h("div",{class:"list"},...projects.slice(0,6).map(project=>row({
        title:titleOf(project),
        subtitle:project?.payload?.clientName||project?.payload?.detail||"Projet Workspace",
        status:project.status||project.payload?.status,
        meta:updatedOf(project)?relativeDate(updatedOf(project)):"Actif"
      }))),
      {iconName:"folder",className:"section-gap"}
    ));
  }

  if(today){
    const focused=tasks.slice(0,6);
    root.append(card("Priorités ouvertes","Vos tâches actives, sans bruit supplémentaire.",
      focused.length?h("div",{class:"list"},...focused.map(value=>row({
        title:titleOf(value),
        subtitle:value?.payload?.projectName||"Tâche Workspace",
        status:value.status||value.payload?.status,
        meta:dueOf(value)?formatDate(dueOf(value)):"Sans échéance"
      }))):emptyState("Journée dégagée","Aucune tâche ouverte n’est actuellement visible dans votre périmètre.","check"),
      {iconName:"check",className:"section-gap"}
    ));
  }

  try{
    if(!state.domainCatalog)await loadDomainCatalog();
    const candidates=[
      ["invoices","Factures","invoice"],
      ["opportunities","Opportunités","money"],
      ["time-entries","Temps saisi","clock"],
      ["service-incidents","Incidents","warning"]
    ].filter(([kind])=>state.domainCatalog?.kinds?.some(value=>value.kind===kind));
    if(candidates.length){
      const cards=[];
      for(const [kind,label,iconName] of candidates.slice(0,4)){
        const items=await listSpecialized(kind);
        cards.push(statCard(label,items.length,items[0]?.updatedAt?`Mis à jour ${relativeDate(items[0].updatedAt)}`:"Données métier",iconName));
      }
      root.append(h("div",{class:"grid stats section-gap"},...cards));
    }
  }catch{/* Le dashboard principal reste disponible si un domaine secondaire répond mal. */}

  return root;
}
function prettySource(value){
  if(value?.payload?.projectName)return value.payload.projectName;
  if(value?.kind)return String(value.kind).replaceAll("-"," ");
  return "Workspace";
}
