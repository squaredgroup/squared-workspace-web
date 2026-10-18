import { state,setRoute } from "../store.js";
import { h,button,card,row,formatDate,icon,profileAvatar,statusText } from "../ui.js";
import { activeAnnouncement,loadWorkspaceWebContent,richContentNode,safePublicURL } from "../public-content.js";
import { canAccessSection } from "../config.js";
import { dueBucket,isFinished } from "../focus-model.js";

function managedLink(item,label="Ouvrir"){
  const href=safePublicURL(item.downloadURL||item.url);
  return href?h("a",{class:"button ghost small",href,target:"_blank",rel:"noopener noreferrer"},icon(item.downloadURL?"download":"external",14),h("span",{text:label})):null;
}
function managedContent(content){
  const role=String(state.user?.role||"").toLowerCase();
  const announcements=content.announcements.filter(item=>activeAnnouncement(item));
  const onboarding=content.onboarding.filter(item=>!item.audience||String(item.audience).toLowerCase().split(/[,;]+/).map(value=>value.trim()).some(value=>!value||value==="tous"||role.includes(value)));
  const resources=[...content.resources,...content.downloads];
  const releases=content.releases;
  const faqs=content.faqs;
  if(!announcements.length&&!onboarding.length&&!resources.length&&!releases.length&&!faqs.length)return null;

  const blocks=[];
  if(announcements.length)blocks.push(h("section",{class:"managed-announcements","aria-label":"Annonces Workspace"},...announcements.slice(0,3).map(item=>
    h("article",{class:`managed-announcement ${item.featured?"featured":""}`},
      h("div",{class:"managed-kicker"},icon("notification",14),h("span",{text:"Annonce Workspace"})),
      h("strong",{text:item.title}),
      richContentNode(item,item.body||item.summary||"Une information vient d’être publiée."),
      managedLink(item,"En savoir plus")
    )
  )));

  if(onboarding.length||resources.length)blocks.push(h("section",{class:"managed-content-grid","aria-label":"Ressources publiées depuis Workspace"},
    ...onboarding.slice(0,3).map(item=>h("article",{class:"managed-content-card onboarding"},
      h("div",{class:"managed-card-icon"},icon("sparkles",17)),
      h("div",{},h("small",{text:item.audience?`Parcours · ${item.audience}`:"Parcours d’accueil"}),h("strong",{text:item.title}),h("p",{text:item.summary||item.body||"Étape recommandée pour bien démarrer."})),
      managedLink(item,"Commencer")
    )),
    ...resources.slice(0,5).map(item=>h("article",{class:"managed-content-card"},
      h("div",{class:"managed-card-icon"},icon(item.downloadURL?"download":"document",17)),
      h("div",{},h("small",{text:item.platform||"Ressource"}),h("strong",{text:item.title}),h("p",{text:item.summary||"Ressource publiée par Squared Group."})),
      managedLink(item,item.downloadURL?"Télécharger":"Consulter")
    ))
  ));

  if(releases.length||faqs.length)blocks.push(h("div",{class:"grid two managed-support-grid"},
    releases.length?card("Versions & nouveautés","Les dernières évolutions publiées par l’équipe.",h("div",{class:"list"},...releases.slice(0,5).map(item=>row({title:item.title,subtitle:item.summary||item.body||"Note de version",status:item.version||"Nouveau",meta:item._updatedDate?formatDate(item._updatedDate):"Publié"}))),{iconName:"sparkles"}):null,
    faqs.length?card("Questions fréquentes","Réponses pilotées depuis les données du site.",h("div",{class:"managed-faq-list"},...faqs.slice(0,6).map(item=>h("details",{class:"managed-faq"},h("summary",{text:item.question||item.title}),richContentNode(item,item.body||item.summary||"Réponse disponible prochainement.")))),{iconName:"support"}):null
  ));
  return h("div",{class:"managed-site-content section-gap"},h("div",{class:"managed-section-heading"},h("div",{},h("span",{text:"Contenus du site"}),h("h2",{text:"Actualités & ressources"})),h("div",{class:"managed-sync"},h("i"),h("span",{text:"Piloté depuis Workspace"}))),...blocks);
}

export async function renderDashboard(today=false){
  const {renderFocusHome}=await import("../focus-home.js");
  if(matchMedia("(max-width: 880px)").matches)return renderFocusHome(today);
  const managedContentPromise=loadWorkspaceWebContent().catch(()=>null);
  const data=state.workspace||{};
  const list=key=>Array.isArray(data[key])?data[key]:[];
  const active=key=>list(key).filter(item=>!isFinished(item));
  const tasks=active("tasks"),projects=active("projects"),validations=active("validations"),deliverables=active("deliverables");
  const conversations=list("conversations").filter(item=>!item.archived&&!item.isArchived);
  const unread=conversations.reduce((sum,item)=>sum+Number(item.unread||0),0);
  const events=active("events"),activities=list("activities"),risks=active("risks").filter(item=>/critical|critique|high|élev/i.test(String(item.level||item.severity||item.status||"")));
  const team=list("team"),late=tasks.filter(item=>dueBucket(item)==="overdue"),todayTasks=tasks.filter(item=>dueBucket(item)==="today");
  const currency=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0});
  const amount=item=>Number(item?.amount??item?.total??item?.budget??item?.value??0)||0;
  const committed=[...list("expenses"),...list("purchaseOrders"),...list("supplierBills")].reduce((sum,item)=>sum+amount(item),0);
  const revenue=[...list("invoices"),...list("quotes")].reduce((sum,item)=>sum+amount(item),0);
  const margin=revenue?Math.round(((revenue-committed)/revenue)*100):0;
  const firstName=String(state.user?.firstName||state.user?.first_name||state.user?.name||"").split(" ")[0];
  const root=h("div",{class:"studio-dashboard native-dashboard focus-home"});

  const hero=h("section",{class:"native-overview-hero"},
    h("div",{class:"native-overview-copy"},h("div",{class:"native-overview-kicker"},h("span",{text:"Pilotage de l’espace"}),h("i"),h("h1",{text:today?"Aujourd’hui":"Tableau de bord"})),h("h2",{text:today?"Votre journée":"Vue d’ensemble"}),h("p",{text:today?"Concentrez-vous sur les échéances et décisions qui doivent avancer maintenant.":"Suivez l’activité, les décisions et la santé de Squared Workspace depuis une seule vue."})),
    h("div",{class:"native-overview-actions"},button("Exporter",{kind:"ghost",small:true,iconName:"download",onClick:()=>window.print()}),button("Personnaliser",{kind:"ghost",small:true,iconName:"sliders",onClick:()=>setRoute("settings","appearance")})),
    h("div",{class:"native-welcome"},h("span",{class:"greeting-emoji",role:"img","aria-label":"Main qui salue",text:"👋"}),h("span",{},h("small",{text:"Bienvenue dans votre espace"}),h("strong",{text:`Bonjour${firstName?`, ${firstName}`:""}`})))
  );
  root.append(hero);

  const pulseItems=[
    ["tasks","À faire",tasks.length,"tasks"],["validations","À valider",validations.length,"validations"],["messages","Messages non lus",unread,"messages"],["planning","Rendez-vous",events.length,"planning"],
    ["activity","Activités",activities.length,"activity"],["projects","Projets actifs",projects.length,"projects"],["deliverables","Livrables",deliverables.length,"deliverables"],["governance","Risques critiques",risks.length,"governance"]
  ].filter(([, , ,route])=>canAccessSection(route,state.user));
  root.append(h("section",{class:"native-pulse","aria-label":"Votre activité"},...pulseItems.map(([iconName,label,count,route])=>h("button",{type:"button",class:`work-summary-item ${count&&["validations","governance"].includes(route)?"is-attention":""}`,onClick:()=>setRoute(route,route==="validations"?"pending":""),"aria-label":`${label} : ${count}`},h("span",{class:"native-pulse-icon"},icon(iconName,15)),h("span",{class:"native-pulse-copy"},h("small",{text:label}),h("strong",{text:String(count)}))))));

  root.append(h("section",{class:"native-finance-band","aria-label":"Pilotage financier"},
    h("article",{},h("div",{class:"native-band-heading"},h("span",{},h("small",{text:"Budget engagé"}),h("strong",{text:currency.format(committed)})),h("span",{class:"native-band-status",text:committed?"Données consolidées":"À configurer"})),h("div",{class:"native-band-chart bars"},...Array.from({length:13},(_,index)=>h("i",{style:{height:`${18+((index*17)%62)}%`}})))),
    h("article",{},h("div",{class:"native-band-heading"},h("span",{},h("small",{text:"Prévision de marge"}),h("strong",{text:`${margin} %`})),h("span",{class:"native-band-status positive",text:margin>0?"Prévision positive":"À consolider"})),h("div",{class:"native-band-chart line"},h("svg",{viewBox:"0 0 320 74","aria-hidden":"true",preserveAspectRatio:"none"},h("path",{d:"M2 61 C42 57 58 67 92 48 S148 42 178 31 S234 39 264 21 S298 18 318 8"}),h("path",{class:"fill",d:"M2 61 C42 57 58 67 92 48 S148 42 178 31 S234 39 264 21 S298 18 318 8 L318 74 L2 74 Z"}))))
  ));

  root.append(h("section",{class:"native-setup-banner"},h("span",{class:"native-setup-icon"},icon("sparkles",17)),h("div",{},h("strong",{text:"Complétez votre pilotage"}),h("p",{text:"Reliez les budgets, objectifs et responsables pour enrichir automatiquement cette vue."})),button("Configurer",{kind:"ghost",small:true,onClick:()=>setRoute("settings")})));

  const metrics=[
    ["Tâches ouvertes",tasks.length,late.length?`${late.length} en retard`:"Aucun retard","tasks"],
    ["Avancement",tasks.length?`${Math.round((list("tasks").filter(isFinished).length/Math.max(1,list("tasks").length))*100)} %`:"0 %","Progression globale","trend"],
    ["Projets actifs",projects.length,projects.length?"Portefeuille en cours":"Aucun projet","projects"],
    ["Membres actifs",team.filter(member=>member.isActive!==false).length,team.length?`${team.length} profils visibles`:"Équipe à compléter","user"]
  ];
  root.append(h("section",{class:"native-metrics","aria-label":"Indicateurs clés"},...metrics.map(([label,value,meta,iconName],index)=>h("article",{class:"native-metric"},h("div",{class:"native-metric-head"},h("span",{text:label}),icon(iconName,15)),h("strong",{text:String(value)}),h("small",{text:meta}),h("svg",{class:"native-sparkline",viewBox:"0 0 180 38","aria-hidden":"true",preserveAspectRatio:"none"},h("path",{d:index%2?"M1 30 C28 31 32 19 55 24 S91 10 113 17 S144 6 179 8":"M1 29 C25 14 39 30 63 21 S99 24 119 13 S152 17 179 5"}))))));

  const taskItems=[...late,...todayTasks,...tasks].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index).slice(0,5);
  const priorityRows=taskItems.length?taskItems.map(item=>h("button",{class:"native-list-row",type:"button",onClick:()=>setRoute("tasks","",item.id)},h("span",{class:`native-check ${isFinished(item)?"done":""}`}),h("span",{class:"native-list-copy"},h("strong",{text:item.title||item.name||"Tâche sans titre"}),h("small",{text:dueBucket(item)==="overdue"?"En retard":dueBucket(item)==="today"?"Aujourd’hui":statusText(item.status||"pending")})),h("span",{class:"native-row-meta",text:item.ownerName||item.assigneeName||"À traiter"}))):[h("div",{class:"native-empty-row",text:"Aucune priorité urgente dans votre périmètre."})];
  const eventItems=events.slice(0,4);
  const eventRows=eventItems.length?eventItems.map(event=>h("button",{class:"native-agenda-row",type:"button",onClick:()=>setRoute("planning")},h("span",{class:"native-event-time",text:event.startAt?new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(new Date(event.startAt)):"À dater"}),h("span",{},h("strong",{text:event.title||event.name||"Rendez-vous"}),h("small",{text:event.location||"Workspace"})))):[h("div",{class:"native-empty-row",text:"Aucun rendez-vous planifié."})];
  root.append(h("section",{class:"native-dashboard-grid"},
    h("article",{class:"native-panel priorities"},h("header",{},h("div",{},h("h2",{text:"Priorités"}),h("p",{text:"Les actions qui nécessitent votre attention."})),button("Voir les tâches",{kind:"ghost",small:true,onClick:()=>setRoute("tasks")})),h("div",{class:"native-list"},...priorityRows)),
    h("article",{class:"native-panel agenda"},h("header",{},h("div",{},h("h2",{text:"Aujourd’hui"}),h("p",{text:"Votre agenda et vos prochains rendez-vous."})),button("Calendrier",{kind:"ghost",small:true,onClick:()=>setRoute("planning")})),h("div",{class:"native-list"},...eventRows))
  ));

  if(projects.length){
    const projectRows=projects.slice(0,5).map((project,index)=>{
      const progress=Math.max(0,Math.min(100,Number(project.progress)||35+index*11));
      return h("button",{class:"native-project-row",type:"button",onClick:()=>setRoute("projects","workspace",project.id)},
        h("span",{class:"native-project-name"},h("i",{style:{background:["#68B9FF","#AE8BFF","#7BE84E","#F3B84B"][index%4]}}),h("strong",{text:project.title||project.name||"Projet"})),
        h("span",{class:"native-project-status",text:statusText(project.status||"active")}),
        h("span",{class:"native-project-owner"},profileAvatar({name:project.ownerName||"Équipe"},{size:22,ariaHidden:true}),h("small",{text:project.ownerName||"Équipe Workspace"})),
        h("span",{class:"native-project-progress"},h("i",{},h("b",{style:{width:`${Math.max(8,progress)}%`}})),h("small",{text:`${progress} %`}))
      );
    });
    root.append(h("section",{class:"native-panel native-projects"},
      h("header",{},h("div",{},h("h2",{text:"Projets en cours"}),h("p",{text:"Avancement du portefeuille actif."})),button("Tout afficher",{kind:"ghost",small:true,onClick:()=>setRoute("projects","workspace")})),
      h("div",{class:"native-project-table"},h("div",{class:"native-project-row heading"},h("span",{text:"Projet"}),h("span",{text:"Statut"}),h("span",{text:"Responsable"}),h("span",{text:"Progression"})),...projectRows)
    ));
  }
  const content=await managedContentPromise;
  const managed=content?managedContent(content):null;if(managed)root.append(managed);
  return root;
}
