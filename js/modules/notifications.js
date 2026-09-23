import { state, setRoute } from "../store.js";
import { canAccessSection } from "../config.js";
import { loadWorkspace, saveCoreEntity } from "../api.js";
import { h, pageHeader, button, emptyState, relativeDate, toast, errorMessage, icon } from "../ui.js";
import { viewContext } from "../focus-state.js";
import { normalize, notificationTarget, sectionForDomain, isFinished } from "../focus-model.js";
import { openRecord, recordRow } from "../focus-records.js";
const readState=value=>Boolean(value?.isRead??value?.is_read??value?.payload?.isRead??value?.payload?.is_read);
const titleOf=value=>value?.title||value?.payload?.title||value?.payload?.subject||"Notification Workspace";
const bodyOf=value=>value?.body||value?.message||value?.payload?.body||value?.payload?.message||value?.payload?.detail||"Une mise à jour est disponible.";
const dateOf=value=>value?.createdAt||value?.created_at||value?.updatedAt||value?.updated_at||value?.payload?.createdAt||null;
export async function renderNotifications(){
  const root=h("div",{class:"focus-inbox"}),results=h("div"),decisions=h("section",{class:"focus-home-group"});
  const context=viewContext("notifications",{query:"",filter:"all"});let notifications=[];
  const search=h("input",{class:"search-input",type:"search",placeholder:"Rechercher une notification…","aria-label":"Rechercher une notification",value:context.query});
  const all=button("Toutes",{pressed:context.filter==="all",onClick:()=>{context.filter="all";draw();}}),unread=button("Non lues",{pressed:context.filter==="unread",onClick:()=>{context.filter="unread";draw();}});
  const controls=h("div",{class:"toolbar notification-toolbar"},h("div",{class:"segmented",role:"group","aria-label":"Filtrer les notifications"},all,unread),search);
  const reload=async()=>{await loadWorkspace();notifications=[...(state.workspace?.notifications||[])].sort((a,b)=>new Date(dateOf(b)||0)-new Date(dateOf(a)||0));draw();};
  const markRead=async value=>{
    if(readState(value))return;
    const now=new Date().toISOString();
    try{await saveCoreEntity("notifications",{...value,isRead:true,is_read:true,readAt:now,payload:{...(value.payload||{}),isRead:true,is_read:true,readAt:now}});toast("Notification marquée comme lue");await reload();}
    catch(e){toast(errorMessage(e),"error");}
  };
  function draw(){
    all.setAttribute("aria-pressed",String(context.filter==="all"));unread.setAttribute("aria-pressed",String(context.filter==="unread"));
    const term=normalize(context.query.trim());
    const pending=canAccessSection("validations",state.user)?(state.workspace?.validations||[]).filter(item=>!isFinished(item)):[];
    decisions.hidden=!pending.length;
    decisions.replaceChildren(...[h("h2",{text:"Décisions en attente"}),h("p",{class:"focus-summary",text:"À examiner dans votre périmètre. Marquer une notification comme lue ne clôture pas une décision."}),...pending.slice(0,5).map(item=>recordRow("validations",item)),pending.length>5?button("Toutes les validations",{onClick:()=>setRoute("validations","pending")}):null].filter(Boolean));
    const visible=notifications.filter(item=>(context.filter==="all"||!readState(item))&&normalize(`${titleOf(item)} ${bodyOf(item)}`).includes(term));
    results.replaceChildren(...(visible.length?visible.map(value=>{
      const target=notificationTarget(value),canOpen=target&&canAccessSection(sectionForDomain(target.domain),state.user);
      return h("article",{class:`notification-card ${readState(value)?"read":"unread"}`},h("div",{class:"notification-icon"},icon("notification",20)),h("div",{class:"notification-copy"},h("div",{class:"notification-meta"},h("time",{text:dateOf(value)?relativeDate(dateOf(value)):""})),h("h3",{text:titleOf(value)}),h("p",{text:bodyOf(value)})),h("div",{class:"focus-notification-actions"},canOpen?button("Ouvrir l’élément",{onClick:()=>openRecord(target.domain,target.id)}):null,readState(value)?null:button("Marquer comme lue",{small:true,kind:"ghost",onClick:()=>markRead(value)})));
    }):[emptyState(context.filter==="unread"?"Tout est lu":"Aucune notification",term?"Aucun résultat pour cette recherche.":"Les informations nouvelles apparaîtront ici.","notification")]));
  }
  search.addEventListener("input",()=>{context.query=search.value;draw();});
  root.append(pageHeader({eyebrow:"Votre attention",title:"Notifications",subtitle:"Séparez les informations des décisions à prendre.",actions:[button("Actualiser",{iconName:"sync",onClick:reload})]}),decisions,controls,results);
  if(state.online)await reload();else{notifications=[...(state.workspace?.notifications||[])];draw();}
  return root;
}
