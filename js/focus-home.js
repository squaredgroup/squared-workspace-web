import { state, setRoute } from "./store.js";
import { canAccessSection } from "./config.js";
import { loadWorkspace } from "./api.js";
import { h, button, icon, select } from "./ui.js";
import { viewContext } from "./focus-state.js";
import { dueOf, dueBucket, dayKey, isFinished, isMine, titleOf, sectionForDomain, valueOf } from "./focus-model.js";
import { recordRow, editRecord, canEditRecord, openRecord } from "./focus-records.js";

const countUnread=()=>Array.isArray(state.workspace?.notifications)?state.workspace.notifications.filter(value=>!(value?.isRead??value?.is_read??value?.payload?.isRead??value?.payload?.is_read)).length:0;

export async function renderFocusHome(todayOnly=false){
  if(state.online||!state.workspace)await loadWorkspace();
  const context=viewContext("home",{scope:state.user?.role==="CLIENT"?"all":"mine"});
  const root=h("div",{class:"focus-home os-home"}),body=h("div",{class:"focus-home-content"});
  const name=state.user?.firstName||state.user?.first_name||"";
  const date=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  const scope=select(context.scope,[{value:"mine",label:"Mon travail"},{value:"all",label:"Périmètre visible"}]);scope.setAttribute("aria-label","Périmètre de la journée");
  const greeting=todayOnly?"Aujourd’hui":`${new Date().getHours()<18?"Bonjour":"Bonsoir"}${name?", "+name:""}.`;
  const intro=h("header",{class:"os-home-head"},
    h("div",{class:"os-home-title"},h("span",{class:"os-home-date",text:date}),h("h1",{text:greeting}),h("p",{text:"Voici ce qui mérite votre attention maintenant."})),
    h("div",{class:"os-home-actions"},scope,canEditRecord("tasks")?button("Nouvelle tâche",{kind:"primary",iconName:"add",onClick:()=>editRecord("tasks",null,reload)}):null)
  );
  const pulse=h("div",{class:"os-pulse","aria-label":"Résumé de votre espace"});
  root.append(intro,pulse,body);
  const reload=async()=>{await loadWorkspace();draw();};
  const permitted=domain=>canAccessSection(domain,state.user);
  const array=domain=>permitted(domain)&&Array.isArray(state.workspace?.[domain])?state.workspace[domain]:[];

  function draw(){
    const allTasks=array("tasks").filter(item=>!isFinished(item));
    const tasks=context.scope==="mine"?allTasks.filter(item=>isMine(item,state.user?.id)):allTasks;
    const decisions=array("validations").filter(item=>!isFinished(item));
    const projects=array("projects").filter(item=>!isFinished(item));
    const unread=countUnread(),overdue=tasks.filter(item=>dueBucket(item)==="overdue"),today=tasks.filter(item=>dueBucket(item)==="today");
    const pulseItems=[
      {label:"Aujourd’hui",value:today.length,iconName:"today",route:"today"},
      {label:"En retard",value:overdue.length,iconName:"warning",route:"tasks",alert:overdue.length>0},
      {label:"À traiter",value:decisions.length,iconName:"check",route:"validations",accent:decisions.length>0},
      {label:"Non lus",value:unread,iconName:"notification",route:"notifications"}
    ].filter(item=>canAccessSection(item.route,state.user)||item.route==="today");
    pulse.replaceChildren(...pulseItems.map(item=>h("button",{type:"button",class:`os-pulse-item ${item.alert?"is-alert":""} ${item.accent?"is-accent":""}`,onClick:()=>setRoute(item.route)},h("span",{class:"os-pulse-icon"},icon(item.iconName,17)),h("strong",{text:String(item.value)}),h("span",{text:item.label}))));

    const blocks=[];
    if(decisions.length)blocks.push(h("section",{class:"focus-attention os-attention"},
      h("div",{class:"os-attention-symbol","aria-hidden":"true"},icon("check",22)),
      h("div",{class:"os-attention-copy"},h("span",{class:"focus-kicker",text:"Action requise"}),h("h2",{text:`${decisions.length} validation${decisions.length>1?"s":""} en attente`}),h("p",{text:"Des éléments attendent votre décision."})),
      button("Examiner",{iconName:"ArrowRight",onClick:()=>setRoute("validations","pending")})
    ));
    const group=(title,subtitle,domain,items,limit=4)=>{
      if(!items.length)return;
      const sorted=[...items].sort((a,b)=>String(dueOf(a)||"9999").localeCompare(String(dueOf(b)||"9999")));
      blocks.push(h("section",{class:"focus-home-group os-section"},
        h("div",{class:"focus-group-heading os-section-head"},h("div",{},h("h2",{text:title}),h("p",{text:subtitle})),h("span",{class:"focus-count",text:String(items.length)})),
        h("div",{class:"os-section-list"},...sorted.slice(0,limit).map(item=>recordRow(domain,item,{compact:true,onRefresh:reload}))),
        items.length>limit?button(`Tout afficher · ${items.length}`,{kind:"ghost",onClick:()=>setRoute(sectionForDomain(domain))}):null
      ));
    };
    group("En retard","À reprendre en priorité.","tasks",overdue,3);
    group("Aujourd’hui","Votre séquence de travail du jour.","tasks",today,5);
    if(!today.length&&!overdue.length)blocks.push(h("section",{class:"os-clear-state"},h("span",{class:"os-clear-icon"},icon("check",20)),h("div",{},h("strong",{text:"Journée sous contrôle"}),h("p",{text:context.scope==="mine"?"Aucune tâche qui vous est affectée n’est en retard ou prévue aujourd’hui.":"Aucune échéance ne demande d’action immédiate."}))));
    const events=Array.isArray(state.workspace?.events)?state.workspace.events:[];
    const upcoming=canAccessSection("planning",state.user)?events.filter(item=>!isFinished(item)&&dayKey(dueOf(item))>=dayKey(new Date())&&(context.scope==="all"||isMine(item,state.user?.id))):[];
    group("À l’agenda","Les prochains rendez-vous de votre périmètre.","events",upcoming,2);
    if(!todayOnly&&projects.length)blocks.push(h("section",{class:"os-projects"},
      h("div",{class:"os-section-head"},h("div",{},h("h2",{text:"Projets actifs"}),h("p",{text:"Reprenez là où vous vous êtes arrêté."})),button("Tous",{kind:"ghost",onClick:()=>setRoute("projects","workspace")})),
      h("div",{class:"os-project-rail"},...projects.slice(0,6).map(project=>h("button",{type:"button",class:"os-project-card",onClick:()=>openRecord("projects",project.id)},
        h("span",{class:"os-project-top"},h("span",{class:"os-project-mark"},icon("projects",18)),h("span",{class:"os-project-status",text:String(valueOf(project,"status")||"Actif").replaceAll("_"," ")})),
        h("strong",{text:titleOf(project)}),
        h("span",{class:"os-project-meta",text:valueOf(project,"description","detail")||"Ouvrir le projet et ses éléments liés"}),
        h("span",{class:"os-project-open"},h("span",{text:"Ouvrir"}),icon("ArrowRight",14))
      )))
    ));
    const other=h("div",{class:"focus-home-secondary os-secondary"});
    const undated=tasks.filter(item=>dueBucket(item)==="undated"),future=tasks.filter(item=>dueBucket(item)==="future");
    for(const [title,items] of [["À venir",future],["Sans échéance",undated]])if(items.length)other.append(h("details",{class:"focus-disclosure os-disclosure"},h("summary",{text:`${title} · ${items.length}`}),...items.slice(0,6).map(item=>recordRow("tasks",item)),items.length>6?button("Ouvrir les tâches",{onClick:()=>setRoute("tasks")}):null));
    body.replaceChildren(...blocks,other);
  }
  scope.addEventListener("change",()=>{context.scope=scope.value;draw();});draw();return root;
}
