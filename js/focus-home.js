import { state, setRoute } from "./store.js";
import { canAccessSection } from "./config.js";
import { loadWorkspace } from "./api.js";
import { h, button, icon, emptyState, pageHeader, select } from "./ui.js";
import { viewContext } from "./focus-state.js";
import { dueOf, dueBucket, dayKey, isFinished, isMine, titleOf, domainLabels } from "./focus-model.js";
import { recordRow, editRecord, canEditRecord } from "./focus-records.js";

export async function renderFocusHome(todayOnly=false){
  if(state.online||!state.workspace)await loadWorkspace();
  const context=viewContext("home",{scope:state.user?.role==="CLIENT"?"all":"mine"});
  const root=h("div",{class:"focus-home"}),body=h("div",{class:"focus-home-content"});
  const name=state.user?.firstName||state.user?.first_name||"";
  const date=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  const scope=select(context.scope,[{value:"mine",label:"Mon travail"},{value:"all",label:"Périmètre visible"}]);scope.setAttribute("aria-label","Périmètre de la journée");
  root.append(pageHeader({eyebrow:date,title:todayOnly?"Aujourd’hui":`${new Date().getHours()<18?"Bonjour":"Bonsoir"}${name?", "+name:""}.`,subtitle:"Vos prochaines actions, au même endroit."}),h("div",{class:"focus-home-toolbar"},scope,canEditRecord("tasks")?button("Nouvelle tâche",{kind:"primary",iconName:"add",onClick:()=>editRecord("tasks",null,reload)}):null),body);
  const reload=async()=>{await loadWorkspace();draw();};
  const permitted=domain=>canAccessSection(domain,state.user);
  const array=domain=>permitted(domain)&&Array.isArray(state.workspace?.[domain])?state.workspace[domain]:[];
  function draw(){
    const allTasks=array("tasks").filter(item=>!isFinished(item));
    const tasks=context.scope==="mine"?allTasks.filter(item=>isMine(item,state.user?.id)):allTasks;
    const decisions=array("validations").filter(item=>!isFinished(item));
    const blocks=[];
    const group=(title,domain,items,limit=4)=>{
      if(!items.length)return;
      const sorted=[...items].sort((a,b)=>String(dueOf(a)||"9999").localeCompare(String(dueOf(b)||"9999")));
      blocks.push(h("section",{class:"focus-home-group"},h("div",{class:"focus-group-heading"},h("h2",{text:title}),h("span",{class:"focus-count",text:String(items.length)})),...sorted.slice(0,limit).map(item=>recordRow(domain,item,{compact:true,onRefresh:reload})),items.length>limit?button(`Voir les ${items.length} éléments`,{kind:"ghost",onClick:()=>setRoute(domain)}):null));
    };
    if(decisions.length)blocks.push(h("section",{class:"focus-attention"},h("div",{},h("span",{class:"focus-kicker",text:"À examiner"}),h("h2",{text:`${decisions.length} validation${decisions.length>1?"s":""} en attente`}),h("p",{text:"Dans votre périmètre autorisé. Lire une demande ne la valide pas."})),button("Examiner",{iconName:"ArrowRight",onClick:()=>setRoute("validations","pending")})));
    group("En retard","tasks",tasks.filter(item=>dueBucket(item)==="overdue"),3);
    group("Aujourd’hui","tasks",tasks.filter(item=>dueBucket(item)==="today"),5);
    if(!tasks.some(item=>["today","overdue"].includes(dueBucket(item))))blocks.push(emptyState("Aucune échéance aujourd’hui",context.scope==="mine"?"Aucune tâche affectée à vous n’est en retard ou prévue aujourd’hui. Le périmètre visible permet de consulter le reste du travail.":"Aucune tâche datée ne demande de traitement aujourd’hui.","check"));
    const events=Array.isArray(state.workspace?.events)?state.workspace.events:[];
    const upcoming=canAccessSection("planning",state.user)?events.filter(item=>!isFinished(item)&&dayKey(dueOf(item))>=dayKey(new Date())&&(context.scope==="all"||isMine(item,state.user?.id))):[];
    group("Prochains rendez-vous","events",upcoming,2);
    const other=h("div",{class:"focus-home-secondary"});
    const undated=tasks.filter(item=>dueBucket(item)==="undated"),future=tasks.filter(item=>dueBucket(item)==="future");
    for(const [title,items] of [["À venir",future],["Sans échéance",undated]])if(items.length)other.append(h("details",{class:"focus-disclosure"},h("summary",{text:`${title} · ${items.length}`}),...items.slice(0,6).map(item=>recordRow("tasks",item)),items.length>6?button("Ouvrir les tâches",{onClick:()=>setRoute("tasks")}):null));
    if(!todayOnly){const projects=array("projects").filter(item=>!isFinished(item));if(projects.length)other.append(h("section",{class:"focus-home-group"},h("div",{class:"focus-group-heading"},h("h2",{text:"Vos projets"}),button("Tous",{kind:"ghost",onClick:()=>setRoute("projects","workspace")})),...projects.slice(0,3).map(item=>recordRow("projects",item))));}
    body.replaceChildren(...blocks,other);
  }
  scope.addEventListener("change",()=>{context.scope=scope.value;draw();});draw();return root;
}
