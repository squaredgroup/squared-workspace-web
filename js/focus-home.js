import { state, setRoute } from "./store.js";
import { canAccessSection } from "./config.js";
import { loadWorkspace } from "./api.js";
import { h, button, icon, pageHeader, select, profileAvatar } from "./ui.js";
import { viewContext } from "./focus-state.js";
import { dueOf, dueBucket, dayKey, isFinished, isMine, sectionForDomain } from "./focus-model.js";
import { analyzeWorkspace } from "./data-insights.js";
import { recordRow, editRecord, canEditRecord } from "./focus-records.js";

export async function renderFocusHome(todayOnly=false,{embedded=false}={}){
  if(state.online||!state.workspace)await loadWorkspace();
  const context=viewContext("home",{scope:["OWNER","ADMIN","CLIENT"].includes(state.user?.role)?"all":"mine"});
  const root=h("div",{class:"focus-home"}),body=h("div",{class:"focus-home-content"});
  const name=(state.user?.firstName||state.user?.first_name||state.user?.name||"").split(" ")[0];
  const date=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  const scope=select(context.scope,[{value:"mine",label:"Mon travail"},{value:"all",label:"Périmètre visible"}]);scope.setAttribute("aria-label","Périmètre de la journée");
  const header=pageHeader({eyebrow:date,title:todayOnly?"Aujourd’hui":`${new Date().getHours()<12?"Bonjour":new Date().getHours()<18?"Bon après-midi":"Bonsoir"}${name?", "+name:""}.`,subtitle:"Vos priorités, vos projets et vos échanges au même endroit."});
  const title=header.querySelector(".page-title");
  if(!todayOnly){title.classList.add("focus-greeting");title.replaceChildren(h("span",{class:"greeting-emoji",role:"img","aria-label":"Main qui salue",text:"👋"}),h("span",{text:title.textContent}));}
  if(embedded){const heading=h("h2",{class:title.className});heading.append(...title.childNodes);title.replaceWith(heading);}
  const reload=async()=>{await loadWorkspace();draw();};
  root.append(header,h("div",{class:"focus-home-toolbar"},scope,canEditRecord("tasks")?button("Nouvelle tâche",{kind:"primary",iconName:"add",onClick:()=>editRecord("tasks",null,reload)}):null),body);
  const permitted=domain=>canAccessSection(sectionForDomain(domain),state.user);
  const array=domain=>permitted(domain)&&Array.isArray(state.workspace?.[domain])?state.workspace[domain]:[];
  function draw(){
    const allTasks=array("tasks").filter(item=>!isFinished(item));
    const tasks=context.scope==="mine"?allTasks.filter(item=>isMine(item,state.user?.id)):allTasks;
    const decisions=array("validations").filter(item=>!isFinished(item));
    const projects=array("projects").filter(item=>!isFinished(item));
    const conversations=array("conversations").filter(item=>!item.isArchived&&!item.archived);
    const unread=conversations.reduce((sum,item)=>sum+(Number(item.unread)||0),0);
    const late=tasks.filter(item=>dueBucket(item)==="overdue"),today=tasks.filter(item=>dueBucket(item)==="today");
    const metrics=h("div",{class:"work-summary","aria-label":"Votre activité"});
    for(const [key,label,count,attention] of [["tasks","Tâches ouvertes",tasks.length,late.length],["validations","À valider",decisions.length,decisions.length],["projects","Projets actifs",projects.length,0],["messages","Messages non lus",unread,0]]){
      if(!canAccessSection(key,state.user))continue;
      metrics.append(h("button",{type:"button",class:`work-summary-item ${attention?"is-attention":""}`,"aria-label":`${label} : ${count}`,onClick:()=>setRoute(key,key==="validations"?"pending":key==="projects"?"workspace":"")},h("span",{"aria-hidden":"true"},icon(key,18)),h("span",{},h("strong",{text:String(count)}),h("small",{text:label}))));
    }
    const primary=h("div",{class:"work-primary"}),secondary=h("div",{class:"work-secondary"});
    const group=(target,label,domain,items,limit=4)=>{
      if(!items.length)return;
      const sorted=[...items].sort((a,b)=>String(dueOf(a)||"9999").localeCompare(String(dueOf(b)||"9999")));
      target.append(h("section",{class:"focus-home-group"},h("div",{class:"focus-group-heading"},h("h2",{text:label}),h("span",{class:"focus-count",text:String(items.length)})),...sorted.slice(0,limit).map(item=>recordRow(domain,item,{compact:true,onRefresh:reload})),items.length>limit?button("Voir tout",{kind:"ghost",small:true,ariaLabel:`Voir tous les éléments : ${label}`,onClick:()=>setRoute(sectionForDomain(domain),domain==="projects"?"workspace":"")}):null));
    };
    if(decisions.length)group(primary,"Décisions attendues","validations",decisions,3);
    group(primary,"En retard","tasks",late,3);
    group(primary,"Aujourd’hui","tasks",today,5);
    if(!late.length&&!today.length)primary.append(h("div",{class:"work-clear"},h("span",{"aria-hidden":"true"},icon("check",22)),h("div",{},h("strong",{text:"Votre journée est à jour"}),h("p",{text:tasks.length?"Les prochaines tâches restent accessibles ci-dessous et dans votre liste.":"Aucune tâche à traiter dans le périmètre sélectionné."}))));
    const events=array("events");
    const upcoming=events.filter(item=>!isFinished(item)&&dayKey(dueOf(item))>=dayKey(new Date())&&(context.scope==="all"||isMine(item,state.user?.id)));
    group(primary,"Prochains rendez-vous","events",upcoming,2);
    for(const [label,items] of [["À venir",tasks.filter(item=>dueBucket(item)==="future")],["Sans échéance",tasks.filter(item=>dueBucket(item)==="undated")]]){
      if(items.length)primary.append(h("details",{class:"focus-disclosure"},h("summary",{text:`${label} · ${items.length}`}),...items.slice(0,5).map(item=>recordRow("tasks",item,{onRefresh:reload})),items.length>5?button("Ouvrir les tâches",{kind:"ghost",onClick:()=>setRoute("tasks")}):null));
    }
    if(!todayOnly)group(secondary,"Vos projets","projects",projects,3);
    if(conversations.length){
      const sorted=[...conversations].sort((a,b)=>Number(b.unread||0)-Number(a.unread||0)||new Date(b.messages?.at(-1)?.createdAt||b.updatedAt||b.createdAt||0)-new Date(a.messages?.at(-1)?.createdAt||a.updatedAt||a.createdAt||0));
      secondary.append(h("section",{class:"focus-home-group work-conversations"},h("div",{class:"focus-group-heading"},h("h2",{text:"Derniers échanges"}),button("Messages",{small:true,kind:"ghost",onClick:()=>setRoute("messages")})),...sorted.slice(0,4).map(conversation=>{
        const ids=conversation.participantIDs||conversation.participantIds||[],person=(state.workspace?.team||[]).find(member=>ids.includes(member.id||member.memberId)&&(member.id||member.memberId)!==state.user?.id);
        const last=conversation.messages?.at(-1),name=conversation.name||person?.name||`${person?.firstName||""} ${person?.lastName||""}`.trim()||"Conversation";
        return h("button",{class:"work-conversation",type:"button","aria-label":`Ouvrir la conversation ${name}`,onClick:()=>setRoute("messages","",conversation.id)},profileAvatar(person||{name},{size:32,ariaHidden:true}),h("span",{},h("strong",{text:name}),h("small",{text:last?.body||last?.text||conversation.preview||"Ouvrir la conversation"})),Number(conversation.unread)>0?h("span",{class:"work-unread",text:Number(conversation.unread)>99?"99+":String(conversation.unread)}):null);
      })));
    }
    const parts=[metrics,h("div",{class:"work-body-grid"},primary,secondary)];
    const quality=analyzeWorkspace(state.workspace);
    if(quality.total&&["OWNER","ADMIN"].includes(state.user?.role))parts.push(h("details",{class:"focus-disclosure work-quality"},h("summary",{text:`Qualité des données · ${quality.score} / 100`}),h("section",{class:`focus-data-health ${quality.status}`},h("div",{},h("h2",{text:`${quality.score} / 100`}),h("p",{text:`${quality.overdue} en retard · ${quality.incomplete} à compléter · ${quality.stale} sans activité récente`})),canAccessSection("tasks",state.user)?button("Voir les tâches",{kind:"ghost",onClick:()=>setRoute("tasks")}):null)));
    body.replaceChildren(...parts);
  }
  scope.addEventListener("change",()=>{context.scope=scope.value;draw();});draw();return root;
}
