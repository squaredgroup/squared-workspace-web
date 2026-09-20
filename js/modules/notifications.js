import { state } from "../store.js";
import { loadWorkspace,saveCoreEntity } from "../api.js";
import { h,pageHeader,card,button,emptyState,formatDate,relativeDate,toast,errorMessage,icon } from "../ui.js";

const readState=value=>Boolean(value?.isRead??value?.is_read??value?.payload?.isRead??value?.payload?.is_read);
const titleOf=value=>value?.title||value?.payload?.title||value?.payload?.subject||"Notification Workspace";
const bodyOf=value=>value?.body||value?.message||value?.payload?.body||value?.payload?.message||value?.payload?.detail||"Une mise à jour est disponible dans votre espace.";
const dateOf=value=>value?.createdAt||value?.created_at||value?.updatedAt||value?.updated_at||value?.payload?.createdAt||null;
const categoryOf=value=>value?.kind||value?.type||value?.payload?.kind||value?.payload?.type||"Workspace";

function period(value){
  const date=new Date(dateOf(value));
  if(Number.isNaN(date.valueOf()))return"Plus anciennes";
  const age=Date.now()-date.getTime();
  if(age<86400000&&new Date().getDate()===date.getDate())return"Aujourd’hui";
  if(age<7*86400000)return"Cette semaine";
  return"Plus anciennes";
}
function updatedNotification(value){
  const now=new Date().toISOString();
  return {...value,isRead:true,is_read:true,readAt:now,read_at:now,payload:{...(value.payload||{}),isRead:true,is_read:true,readAt:now,read_at:now}};
}

export async function renderNotifications(){
  const root=h("div"),host=h("div");let filter="all",query="",notifications=[];
  const reload=async()=>{await loadWorkspace();notifications=[...(state.workspace?.notifications||[])].sort((a,b)=>new Date(dateOf(b)||0)-new Date(dateOf(a)||0));draw()};
  const markRead=async value=>{
    if(readState(value))return;
    try{await saveCoreEntity("notifications",updatedNotification(value));toast("Notification marquée comme lue");await reload()}
    catch(error){toast(errorMessage(error),"error",6000)}
  };
  const draw=()=>{
    const normalized=query.trim().toLowerCase();
    const visible=notifications.filter(value=>(filter==="all"||!readState(value))&&`${titleOf(value)} ${bodyOf(value)} ${categoryOf(value)}`.toLowerCase().includes(normalized));
    const groups=["Aujourd’hui","Cette semaine","Plus anciennes"].map(label=>[label,visible.filter(value=>period(value)===label)]).filter(([,values])=>values.length);
    const controls=h("div",{class:"toolbar notification-toolbar"},
      h("div",{class:"segmented",role:"group","aria-label":"Filtrer les notifications"},
        button("Toutes",{small:true,pressed:filter==="all",onClick:()=>{filter="all";draw()}}),
        button("Non lues",{small:true,pressed:filter==="unread",onClick:()=>{filter="unread";draw()}})
      ),
      h("div",{class:"spacer"}),
      h("input",{class:"search-input",type:"search",placeholder:"Rechercher une notification…","aria-label":"Rechercher une notification",value:query,onInput:event=>{query=event.target.value;draw()}})
    );
    host.replaceChildren(controls,visible.length?h("div",{class:"notification-groups"},...groups.map(([label,values])=>h("section",{class:"notification-group","aria-labelledby":`notifications-${label.replace(/\W/g,"-")}`},h("h2",{id:`notifications-${label.replace(/\W/g,"-")}`,text:label}),h("div",{class:"notification-list"},...values.map(value=>h("article",{class:`notification-card ${readState(value)?"read":"unread"}`},h("div",{class:"notification-icon"},icon(readState(value)?"check":"notification",17)),h("div",{class:"notification-copy"},h("div",{class:"notification-meta"},h("span",{text:categoryOf(value)}),h("time",{datetime:dateOf(value)||null,text:dateOf(value)?relativeDate(dateOf(value)):""})),h("h3",{text:titleOf(value)}),h("p",{text:bodyOf(value)})),readState(value)?null:button("Marquer comme lue",{small:true,kind:"ghost",onClick:()=>markRead(value)}))))))):emptyState(normalized?"Aucun résultat":filter==="unread"?"Tout est lu":"Aucune notification",normalized?"Aucune notification ne correspond à cette recherche.":filter==="unread"?"Vous n’avez aucune notification en attente.":"Les prochaines alertes et décisions apparaîtront ici.","notification"));
  };
  root.append(pageHeader({eyebrow:"Communication",title:"Notifications",subtitle:"Alertes, décisions et mises à jour qui demandent votre attention.",actions:[button("Actualiser",{iconName:"sync",onClick:reload})]}),card("Centre de notifications","Filtrez les éléments non lus et conservez une vue claire de l’activité utile.",host,{iconName:"notification"}));
  await reload();return root;
}
