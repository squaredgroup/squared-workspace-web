import { state, setRoute } from "../store.js";
import { listSpecialized, getSpecialized, saveSpecialized, loadWorkspace, createConversation } from "../api.js";
import { viewContext, getDraft, saveDraft } from "../focus-state.js";
import { h, pageHeader, button, icon, iconButton, modal, field, input, textarea, select, validateControls, emptyState, toast, errorMessage, profileAvatar, formatDate, confirmAction } from "../ui.js";

const states={new:"Nouveau",triaged:"Qualifié",assigned:"Attribué",inProgress:"En cours",waiting:"En attente",resolved:"Résolu",closed:"Clos",cancelled:"Annulé"};
const severities={low:"Faible",medium:"Normale",high:"Élevée",critical:"Critique"};
const impacts={individual:"Une personne",team:"Une équipe",businessUnit:"Un pôle",organization:"Toute l’organisation",customerFacing:"Les clients"};
const urgencies={low:"Peut attendre",normal:"Délai habituel",high:"À traiter rapidement",immediate:"Bloquant maintenant"};
const categories=["Technique","Accès et compte","Demande de service","Autre"];
const done=ticket=>["resolved","closed","cancelled"].includes(ticket.status||ticket.data?.state);
const label=ticket=>states[ticket.status||ticket.data?.state]||ticket.status||"Nouveau";
const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const manager=()=>state.user?.permissions?.includes("manageSupport");
const canCreate=()=>manager()||state.user?.permissions?.includes("createSupportRequests");
const name=member=>`${member?.firstName||member?.first_name||""} ${member?.lastName||member?.last_name||""}`.trim()||member?.name||member?.email||"Membre";
const person=id=>(state.workspace?.team||[]).find(member=>(member.id||member.memberId)===id);
const statusBadge=ticket=>h("span",{class:`sq-ticket-state sq-state-${ticket.status||ticket.data?.state||"new"}`,text:label(ticket)});

export async function renderSupport(subpage="tickets-clients"){
  const root=h("div",{class:"sq-support-page"});
  const context=viewContext(`support:${subpage}`,{query:"",filter:"open",sort:"recent"});
  const heading=pageHeader({eyebrow:"Assistance",title:"Support",subtitle:manager()?"Un espace pour qualifier, attribuer et suivre chaque demande.":"Vos demandes, leurs détails et leur avancement au même endroit.",actions:canCreate()?[button("Créer un ticket",{kind:"primary",iconName:"add",onClick:()=>ticketForm(null,()=>refresh())})]:[]});
  root.append(heading);
  let tickets=[],selected=null;
  const metrics=h("div",{class:"sq-support-metrics"}),content=h("div",{class:"sq-support-content"});root.append(metrics,content);
  const refresh=async()=>{
    try{tickets=await listSpecialized("tickets");if(state.route.item)selected=tickets.find(ticket=>ticket.id===state.route.item)||await getSpecialized("tickets",encodeURIComponent(state.route.item));paint();}
    catch(error){content.replaceChildren(h("div",{class:"sq-load-error"},emptyState("Le support est indisponible",errorMessage(error),"warning"),button("Réessayer",{iconName:"sync",onClick:refresh})));}
  };
  function paint(){
    root.classList.toggle("sq-ticket-view",Boolean(selected));
    const visible=tickets.filter(ticket=>subpage!=="demandes-internes"||ticket.data?.metadata?.tags?.includes("Interne"));
    metrics.replaceChildren(...[["Demandes ouvertes",visible.filter(ticket=>!done(ticket)).length,"support"],["En cours",visible.filter(ticket=>["assigned","inProgress"].includes(ticket.status)).length,"clock"],["Résolues",visible.filter(ticket=>["resolved","closed"].includes(ticket.status)).length,"check"]].map(([title,count,glyph])=>h("div",{class:"sq-support-metric"},h("span",{class:"sq-metric-glyph"},icon(glyph,19)),h("div",{},h("span",{text:title}),h("strong",{text:String(count)})))));
    const search=input(context.query,{type:"search",placeholder:"Rechercher un ticket…","aria-label":"Rechercher un ticket"});
    const sort=select(context.sort,[{value:"recent",label:"Dernière activité"},{value:"priority",label:"Priorité"}]);sort.setAttribute("aria-label","Trier les tickets");
    const results=h("div",{class:"sq-ticket-list"}),summary=h("p",{class:"sq-results-summary",role:"status","aria-live":"polite"});
    const filters=[["open","Ouverts"],["mine","Mes demandes"],["all","Tous"],["resolved","Résolus"]].map(([value,title])=>button(title,{kind:"ghost",pressed:context.filter===value,onClick:()=>{context.filter=value;filters.forEach((control,index)=>control.setAttribute("aria-pressed",String(["open","mine","all","resolved"][index]===value)));draw();}}));
    const list=h("section",{class:"sq-ticket-board","aria-label":"Liste des tickets"},h("div",{class:"sq-board-head"},h("div",{},h("h2",{text:manager()?"Tickets":"Mes tickets"}),h("p",{text:"Suivez les demandes accessibles à votre compte."})),h("div",{class:"sq-board-search"},icon("search",17),search)),h("div",{class:"sq-board-controls"},h("div",{class:"sq-filter-tabs","aria-label":"Filtrer les tickets"},...filters),sort),summary,results);
    function draw(){
      const query=normalize(context.query);
      const rows=visible.filter(ticket=>(context.filter==="all"||context.filter==="open"&&!done(ticket)||context.filter==="resolved"&&["resolved","closed"].includes(ticket.status)||context.filter==="mine"&&ticket.data?.requesterID===state.user?.id)&&normalize(`${ticket.title} ${ticket.data?.reference||""} ${ticket.data?.description||""}`).includes(query));
      const priority={critical:4,high:3,medium:2,low:1};
      rows.sort((a,b)=>context.sort==="priority"?(priority[b.data?.severity]||0)-(priority[a.data?.severity]||0):new Date(b.updatedAt||b.updated_at||b.data?.metadata?.updatedAt||0)-new Date(a.updatedAt||a.updated_at||a.data?.metadata?.updatedAt||0));
      summary.textContent=`${rows.length} ticket${rows.length>1?"s":""}`;
      results.replaceChildren(...(rows.length?rows.map(ticket=>{
        const data=ticket.data||{},assignee=person(data.assigneeID);
        return h("button",{type:"button",class:`sq-ticket-row ${selected?.id===ticket.id?"selected":""}`,"aria-label":`Ouvrir le ticket ${ticket.title}`,onClick:()=>setRoute("support",subpage,ticket.id)},h("span",{class:`sq-ticket-priority sq-priority-${data.severity||"medium"}`,title:`Priorité ${severities[data.severity]||"normale"}`},icon("support",18)),h("span",{class:"sq-ticket-text"},h("span",{class:"sq-ticket-reference",text:data.reference||"Ticket"}),h("strong",{text:ticket.title||data.title||"Sans titre"}),h("span",{class:"sq-ticket-excerpt",text:data.description||"Aucune description"})),h("span",{class:"sq-ticket-meta"},statusBadge(ticket),h("small",{text:formatDate(ticket.updatedAt||ticket.updated_at||data.metadata?.updatedAt)})),assignee?profileAvatar(assignee,{size:28,label:`Attribué à ${name(assignee)}`}):h("span",{class:"sq-ticket-unassigned",text:"—",title:"Non attribué"}));
      }):[h("div",{class:"sq-support-empty"},emptyState(query?"Aucun ticket trouvé":"Tout est à jour",query?"Essayez une autre recherche ou un autre filtre.":"Les nouvelles demandes apparaîtront ici.","support"),canCreate()?button("Créer un ticket",{kind:"ghost",iconName:"add",onClick:()=>ticketForm(null,refresh)}):null)]));
    }
    search.addEventListener("input",()=>{context.query=search.value;draw();});sort.addEventListener("change",()=>{context.sort=sort.value;draw();});draw();
    content.classList.toggle("sq-ticket-open",Boolean(selected));content.replaceChildren(list,...(selected?[ticketDetail(selected,subpage,refresh)]:[]));
  }
  await refresh();return root;
}
function ticketDetail(ticket,subpage,refresh){
  const data=ticket.data||{},requester=person(data.requesterID),assignee=person(data.assigneeID);
  const facts=[["Priorité",severities[data.severity]||"Non définie"],["Impact",impacts[data.impact]||"Non défini"],["Urgence",urgencies[data.urgency]||"Non définie"],["Responsable",assignee?name(assignee):"Non attribué"]];
  const dates=[["Demande créée",ticket.createdAt||ticket.created_at||data.metadata?.createdAt],["Première réponse",data.firstRespondedAt],["Résolution",data.resolvedAt]].filter(([,date])=>date);
  const head=h("div",{class:"sq-ticket-detail-head"},h("span",{text:data.reference||"Ticket",class:"sq-ticket-reference"}),iconButton("close","Fermer le ticket",()=>setRoute("support",subpage)));
  const identity=h("div",{class:"sq-ticket-requester"},profileAvatar(requester||{name:"Demandeur"},{size:32,ariaHidden:true}),h("div",{},h("strong",{text:requester?name(requester):"Demandeur"}),h("small",{text:"À l’origine de cette demande"})));
  const description=h("section",{class:"sq-ticket-description"},h("h3",{text:"La demande"}),h("p",{text:data.description||"Aucune description renseignée."}));
  const properties=h("dl",{class:"sq-ticket-facts"},...facts.map(([title,value])=>h("div",{},h("dt",{text:title}),h("dd",{text:value}))));
  const events=dates.map(([title,date])=>h("div",{},h("span",{class:"sq-timeline-dot","aria-hidden":"true"}),h("div",{},h("strong",{text:title}),h("small",{text:formatDate(date)}))));
  const timeline=h("section",{class:"sq-ticket-timeline"},h("h3",{text:"Suivi du ticket"}),...events);
  const deadlines=[["Réponse attendue",data.responseDueAt],["Résolution attendue",data.resolutionDueAt]].filter(([,date])=>date).map(([title,date])=>h("p",{class:"sq-ticket-deadline",text:`${title} · ${formatDate(date)}`}));
  const body=h("div",{class:"sq-ticket-detail-body"},statusBadge(ticket),h("h2",{text:ticket.title||data.title}),identity,description,properties,timeline,...deadlines);
  const discussion=ticketDiscussion(ticket);
  const edit=manager()?button("Gérer le ticket",{kind:"primary",iconName:"edit",onClick:async()=>{try{const fresh=await getSpecialized("tickets",encodeURIComponent(ticket.id));ticketForm(fresh,refresh);}catch(error){toast(errorMessage(error),"error");}}}):null;
  return h("aside",{class:"sq-ticket-detail","aria-label":"Détail du ticket"},head,body,edit||discussion?h("div",{class:"sq-ticket-detail-actions"},edit,discussion):null);
}
function ticketDiscussion(ticket){
  if(!state.user?.permissions?.includes("sendMessages"))return null;
  const target=manager()?person(ticket.data?.requesterID):(person(ticket.data?.assigneeID)||(state.workspace?.team||[]).find(member=>member.id!==state.user?.id&&(member.permissions?.includes("manageSupport")||["OWNER","ADMIN"].includes(member.role))));
  const targetId=target?.id||target?.memberId;
  if(!targetId||targetId===state.user?.id)return null;
  return button(manager()?"Échanger":"Contacter le support",{iconName:"messages",onClick:async()=>{
    try{
      const owner=state.user?.id;
      let conversation=(state.workspace?.conversations||[]).find(value=>(value.kind==="direct"||(value.participantIDs||[]).length===2)&&(value.participantIDs||[]).includes(owner)&&(value.participantIDs||[]).includes(targetId));
      if(!conversation){conversation=await createConversation({id:crypto.randomUUID(),name:name(target),kind:"direct",participantIDs:[owner,targetId],participants:[],messages:[],unread:0,createdAt:new Date().toISOString()});await loadWorkspace();}
      if(state.user?.id!==owner)return;
      const key=conversation.id;
      if(!getDraft(key))saveDraft(key,`À propos du ticket ${ticket.data?.reference||""} : ${ticket.title}.`);
      setRoute("messages","",conversation.id);
    }catch(error){toast(errorMessage(error),"error");}
  }});
}
function ticketForm(ticket,refresh){
  if(ticket&&!manager()||!ticket&&!canCreate())return;
  const old=ticket?.data||{},editing=Boolean(ticket),owner=state.user?.id;
  const title=input(ticket?.title||"",{required:true,minLength:3,maxLength:240,placeholder:"Résumez votre demande en une phrase"});
  const description=textarea(old.description||"",{required:true,minLength:10,maxLength:20000,rows:5,placeholder:"Que se passe-t-il ? Quel résultat attendiez-vous ?"});
  const category=select(old.metadata?.tags?.find(tag=>categories.includes(tag))||categories[0],categories);
  const severity=select(old.severity||"medium",Object.entries(severities).map(([value,label])=>({value,label})));
  const impact=select(old.impact||"individual",Object.entries(impacts).map(([value,label])=>({value,label})));
  const urgency=select(old.urgency||"normal",Object.entries(urgencies).map(([value,label])=>({value,label})));
  const status=select(ticket?.status||"new",Object.entries(states).map(([value,label])=>({value,label})));
  const assignee=select(old.assigneeID||"",[{value:"",label:"Non attribué"},...(state.workspace?.team||[]).map(member=>({value:member.id||member.memberId,label:name(member)}))]);
  if(old.assigneeID&&!person(old.assigneeID))assignee.append(h("option",{value:old.assigneeID,selected:true,text:"Responsable actuel — conservé"}));
  const error=h("p",{class:"sq-inline-error",role:"alert",hidden:true});
  const content=h("form",{class:"form sq-ticket-form"},h("p",{class:"sq-form-intro",text:editing?"Mettez à jour la prise en charge et le suivi de cette demande.":"Décrivez votre besoin. Le support pourra ensuite qualifier et attribuer votre ticket."}),field("Objet de la demande",title),h("div",{class:"form-row"},field("Catégorie",category),field("Priorité",severity)),field("Description",description,"Ajoutez le contexte et les étapes qui permettent de comprendre la demande."),h("div",{class:"form-row"},field("Qui est concerné ?",impact),field("Urgence",urgency)),editing?h("div",{class:"form-row"},field("Statut",status),field("Responsable",assignee)):null,error);
  let busy=false,dirty=false,dialog;content.addEventListener("input",()=>dirty=true);content.addEventListener("change",()=>dirty=true);
  const save=async close=>{
    if(busy||state.user?.id!==owner||!validateControls(title,description))return;
    if(!title.value.trim()||!description.value.trim()){error.textContent="Renseignez l’objet et la description de votre demande.";error.hidden=false;return;}
    busy=true;error.hidden=true;dialog.panel.setAttribute("aria-busy","true");dialog.panel.querySelectorAll("button").forEach(control=>control.disabled=true);
    try{
      const now=new Date().toISOString(),id=ticket?.id||crypto.randomUUID(),nextState=editing?status.value:"new";
      const metadata={...old.metadata,version:old.metadata?.version||1,createdBy:old.metadata?.createdBy||owner,createdAt:old.metadata?.createdAt||now,updatedBy:owner,updatedAt:now,tags:[...(old.metadata?.tags||[]).filter(tag=>!categories.includes(tag)),category.value,...(!editing&&state.route.subpage==="demandes-internes"?["Interne"]:[])]};
      const data={...old,id,title:title.value.trim(),description:description.value.trim(),reference:old.reference||`SUP-${id.slice(0,8).toUpperCase()}`,state:nextState,severity:severity.value,impact:impact.value,urgency:urgency.value,requesterID:old.requesterID||owner,assigneeID:editing?assignee.value||null:null,escalationLevel:old.escalationLevel||0,metadata};
      if(editing&&["resolved","closed"].includes(nextState)&&!old.resolvedAt)data.resolvedAt=now;
      if(editing&&!["resolved","closed"].includes(nextState))data.resolvedAt=null;
      const saved=await saveSpecialized("tickets",{id,...(editing?{version:ticket.version}:{}),title:data.title,status:nextState,data});
      busy=false;dirty=false;close();await loadWorkspace();toast(editing?"Ticket mis à jour":"Ticket créé");
      if(!editing)setRoute("support",state.route.subpage||"tickets-clients",saved.id||id);else await refresh();
    }catch(cause){busy=false;error.hidden=false;error.textContent=errorMessage(cause);dialog.panel.querySelectorAll("button").forEach(control=>control.disabled=false);}
    finally{dialog.panel.removeAttribute("aria-busy");}
  };
  dialog=modal({title:editing?"Gérer le ticket":"Créer un ticket",content,className:"sq-ticket-editor",wide:true,initialFocus:"input",beforeClose:()=>{if(busy)return false;if(dirty){confirmAction({title:"Abandonner cette demande ?",message:"Les informations saisies n’ont pas été enregistrées.",confirmLabel:"Abandonner",onConfirm:()=>{dirty=false;dialog.close();}});return false;}return true;},actions:[{label:editing?"Enregistrer les modifications":"Créer le ticket",kind:"primary",icon:"check",onClick:save}]});
  content.addEventListener("submit",event=>{event.preventDefault();void save(dialog.close);});
}
