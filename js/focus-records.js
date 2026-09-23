import { state, setRoute } from "./store.js";
import { canAccessSection, SECTIONS } from "./config.js";
import { getCoreEntity, saveCoreEntity, loadWorkspace, downloadFile, uploadFile, archiveCoreEntity } from "./api.js";
import { h, button, icon, modal, field, input, textarea, select, emptyState, toast, errorMessage, validateControls, confirmAction, pageHeader } from "./ui.js";
import { viewContext } from "./focus-state.js";
import { titleOf, valueOf, dueOf, parentOf, assigneeOf, isMine, isFinished, normalize, dayKey, dateLabel, dueBucket, statusLabel, domainLabels, sectionForDomain, putValue } from "./focus-model.js";

const permissions={projects:"manageProjects",tasks:"manageTasks",missions:"manageMissions",events:"manageTasks",validations:"decideValidations",deliverables:"manageDeliverables",documents:"manageDocuments",resources:"manageOrganization",contracts:"manageContracts",clients:"manageClients"};
export const canEditRecord=domain=>Boolean(state.user?.permissions?.includes(permissions[domain]));
export const supportsRecord=domain=>Object.hasOwn(permissions,domain);
const list=key=>Array.isArray(state.workspace?.[key])?state.workspace[key]:[];
const memberName=member=>member?.name||`${member?.firstName||member?.first_name||""} ${member?.lastName||member?.last_name||""}`.trim()||member?.email||"Membre";
const statusOptions=(domain,record)=>{
  const fromCatalog=state.domainCatalog?.kinds?.find(k=>k.kind===domain)?.statuses;
  const existing=list(domain).map(item=>valueOf(item,"status")).filter(Boolean);
  const defaults=domain==="tasks"?["pending","active","completed"]:domain==="validations"?["pending","approved","rejected"]:["draft","active","completed"];
  return [...new Set([valueOf(record,"status"),...(Array.isArray(fromCatalog)&&fromCatalog.length?fromCatalog:[...defaults,...existing])].filter(Boolean))].map(value=>({value,label:statusLabel(value)}));
};
export function openRecord(domain,id) {
  const section=sectionForDomain(domain);
  if(!id||!canAccessSection(section,state.user))return;
  const subpage=state.route.section===section?state.route.subpage:(SECTIONS[section]?.subpages?.[0]?.id||"");
  setRoute(section,subpage,id);
}
function entityBody(original) {
  const body={title:titleOf(original),status:valueOf(original,"status")||"active",payload:{...(original.payload||{})}};
  if(original.id){body.id=original.id;body.version=original.version;}
  const parent=parentOf(original);if(parent)body.parentId=parent;
  // Keep top-level fields from the snapshot when the API already uses them.
  return body;
}
function choiceWithCurrent(value,options,label) {
  const all=[{value:"",label},...options];
  if(value&&!all.some(item=>String(item.value)===String(value)))all.push({value,label:"Valeur liée non chargée — conservée"});
  return select(value,all);
}
export function editRecord(domain,record=null,reload=async()=>{}) {
  if(!canEditRecord(domain)){toast("Cette modification n’est pas autorisée.","error");return;}
  const original=record||{},editing=Boolean(original.id),person=state.user?.id;
  if(editing&&!(Number(original.version)>0)){toast("Actualisez le détail avant de modifier cet élément.","error");return;}
  const title=input(record?titleOf(record):"",{required:true,maxLength:240,placeholder:domain==="tasks"?"Que faut-il faire ?":"Donnez un titre clair"});
  const status=select(valueOf(original,"status")||(domain==="tasks"?"pending":"draft"),statusOptions(domain,original));
  const description=textarea(valueOf(original,"description","detail","body")||"",{rows:4,maxLength:20000,placeholder:"Contexte, résultat attendu, informations utiles…"});
  const project=choiceWithCurrent(parentOf(original),list("projects").map(p=>({value:p.id,label:titleOf(p)})),"Aucun projet");
  const assignee=choiceWithCurrent(assigneeOf(original),list("team").map(m=>({value:m.id||m.memberId,label:memberName(m)})),"Non affecté");
  const oldDue=dueOf(original),date=input(dayKey(oldDue),{type:"date"});
  const priority=choiceWithCurrent(valueOf(original,"priority"),[{value:"low",label:"Basse"},{value:"normal",label:"Normale"},{value:"high",label:"Haute"},{value:"urgent",label:"Urgente"}],"Non définie");
  const controls=[title,status,description],content=h("form",{class:"form focus-editor"},field(domain==="tasks"?"Tâche":"Titre",title),field("Description",description));
  const metadata=h("div",{class:"form-row"},field("Statut",status));
  if(["tasks","missions","events","deliverables","documents","validations"].includes(domain)){metadata.append(field("Projet",project));controls.push(project);}
  if(["tasks","missions","events","projects","deliverables"].includes(domain)){
    content.append(h("div",{class:"form-row"},field("Responsable",assignee),field("Échéance",date,"Une date sans heure reste une date de calendrier.")));
    controls.push(assignee,date);
  }
  if(domain==="tasks"){metadata.append(field("Priorité",priority));controls.push(priority);}
  content.append(metadata);
  const error=h("p",{class:"focus-form-error",role:"alert",hidden:true});content.append(error);
  let dirty=false,busy=false;
  content.addEventListener("input",()=>dirty=true);content.addEventListener("change",()=>dirty=true);
  let dialog;
  const save=async close=>{
    if(busy||!validateControls(controls))return;
    if(!title.value.trim()){title.setCustomValidity("Saisissez un titre.");title.reportValidity();title.addEventListener("input",()=>title.setCustomValidity(""),{once:true});return;}
    if(!state.online){error.hidden=false;error.textContent="Connexion nécessaire pour enregistrer. La saisie reste dans cette fenêtre.";return;}
    busy=true;error.hidden=true;
    const body=entityBody(original);body.title=title.value.trim();body.status=status.value;
    putValue(body,["description","detail","body"],description.value);
    if(controls.includes(project)){
      body.parentId=project.value||null;
      if(Object.hasOwn(body,"parent_id"))body.parent_id=body.parentId;
      if(valueOf(original,"projectId","projectID","project_id"))putValue(body,["projectId","projectID","project_id"],body.parentId);
    }
    if(controls.includes(assignee))putValue(body,["assigneeId","assigneeID","assignedToId","assignedToID","assignedTo","responsibleId","ownerId"],assignee.value||null);
    // Do not erase an existing timestamp merely by opening and saving the form.
    if(controls.includes(date)&&date.value!==(dayKey(oldDue)))putValue(body,["dueAt","due_at","dueDate","deadline","startAt","start_at","startsAt"],date.value||null);
    if(controls.includes(priority))putValue(body,["priority"],priority.value||null);
    try {
      await saveCoreEntity(domain,body);
      if(state.user?.id!==person)return;
      dirty=false;close();toast(editing?"Modifications enregistrées":"Élément créé");
      try{await loadWorkspace();await reload();}catch{toast("Enregistrement confirmé. Actualisez la liste lorsque le réseau revient.","error");}
    }catch(e){if(state.user?.id===person){error.hidden=false;error.textContent=errorMessage(e);}}
    finally{busy=false;}
  };
  dialog=modal({title:`${editing?"Modifier":"Créer"} · ${domainLabels[domain]||domain}`,content,wide:true,className:"focus-editor-dialog",beforeClose:()=>!dirty||window.confirm("Abandonner les modifications non enregistrées ?"),actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:save}]});
  content.addEventListener("submit",e=>{e.preventDefault();void save(dialog.close);});
}
export async function finishTask(record,reload=async()=>{}) {
  if(!canEditRecord("tasks")||isFinished(record))return;
  try {
    const fresh=await getCoreEntity("tasks",encodeURIComponent(record.id));
    if(!fresh||fresh.id!==record.id||!(Number(fresh.version)>0))throw new Error("Impossible de vérifier la version de cette tâche.");
    if(isFinished(fresh)){toast("Cette tâche est déjà terminée.");await reload();return;}
    await saveCoreEntity("tasks",{...entityBody(fresh),status:"completed"});
    toast("Tâche terminée");await loadWorkspace();await reload();
  } catch(e){toast(errorMessage(e),"error");}
}
export function recordRow(domain,record,{onRefresh,compact=false}={}) {
  const project=list("projects").find(p=>p.id===parentOf(record));
  const member=list("team").find(m=>(m.id||m.memberId)===assigneeOf(record));
  const due=dueOf(record),metadata=[];
  if(project&&domain!=="projects")metadata.push(titleOf(project));
  if(member)metadata.push(memberName(member));
  if(due)metadata.push(dateLabel(due));
  const amount=valueOf(record,"amount","total","totalAmount");
  if(amount!==""&&Number.isFinite(Number(amount))){const currency=valueOf(record,"currency")||"EUR";try{metadata.push(new Intl.NumberFormat("fr-FR",{style:"currency",currency}).format(Number(amount)));}catch{metadata.push(String(amount));}}
  const text=h("button",{class:"focus-record-open",type:"button",onClick:()=>openRecord(domain,record.id),"aria-label":`Ouvrir ${titleOf(record)}`},h("strong",{text:titleOf(record)}),h("span",{class:"focus-record-meta",text:metadata.join(" · ")||domainLabels[domain]||domain}),h("span",{class:`focus-status ${dueBucket(record)==="overdue"&&!isFinished(record)?"is-late":""}`,text:statusLabel(valueOf(record,"status"))}));
  const row=h("article",{class:`focus-record ${compact?"compact":""}`,dataset:{recordId:record.id}},h("span",{class:"focus-record-icon","aria-hidden":"true"},icon(sectionForDomain(domain),20)),text);
  if(domain==="tasks"&&canEditRecord(domain)&&!isFinished(record))row.append(button("Terminer",{small:true,kind:"ghost",ariaLabel:`Terminer ${titleOf(record)}`,onClick:()=>finishTask(record,onRefresh)}));
  return row;
}
export function recordList(domain,items,reload,{writable=canEditRecord(domain)}={}) {
  const context=viewContext(`records:${state.route.section}:${state.route.subpage}:${domain}`,{query:"",status:"all",scope:"all",sort:"due",limit:30});
  const root=h("div",{class:"focus-collection"}),results=h("div",{class:"focus-record-list"}),summary=h("p",{class:"focus-summary",role:"status","aria-live":"polite"}),more=button("Afficher la suite",{kind:"ghost",onClick:()=>{context.limit+=30;draw();}});
  const search=h("input",{type:"search",class:"search-input",placeholder:`Rechercher dans ${domainLabels[domain]?.toLowerCase()||"la liste"}…`,value:context.query,"aria-label":"Rechercher dans la liste"});
  const states=[...new Set(items.map(item=>valueOf(item,"status")).filter(Boolean))];
  const status=select(context.status,[{value:"all",label:"Tous les statuts"},...states.map(value=>({value,label:statusLabel(value)}))]);status.setAttribute("aria-label","Filtrer par statut");
  const scope=select(context.scope,[{value:"all",label:"Périmètre visible"},{value:"mine",label:"Affecté à moi"},{value:"unassigned",label:"Non affecté"}]);scope.setAttribute("aria-label","Périmètre des éléments");
  const sort=select(context.sort,[{value:"due",label:"Échéances"},{value:"recent",label:"Plus récents"},{value:"title",label:"Titre A–Z"}]);sort.setAttribute("aria-label","Trier les éléments");
  const filters=h("details",{class:"focus-filters"},h("summary",{},icon("sliders",18),h("span",{text:"Filtres et tri"})),filterBody=h("div",{class:"focus-filter-body"},field("Statut",status),field("Périmètre",scope),field("Trier",sort));filters.append(filterBody);
  for(const [control,key] of [[status,"status"],[scope,"scope"],[sort,"sort"]])control.addEventListener("change",()=>{context[key]=control.value;context.limit=30;draw();});
  search.addEventListener("input",()=>{context.query=search.value;context.limit=30;draw();});
  const heading=h("div",{class:"focus-list-controls"},search,filters);
  if(writable)heading.append(button(domain==="tasks"?"Nouvelle tâche":"Nouveau",{kind:"primary",iconName:"add",onClick:()=>editRecord(domain,null,reload)}));
  root.append(heading,summary,results,more);
  function draw(){
    const term=normalize(context.query.trim());
    const visible=items.filter(item=>(context.status==="all"||valueOf(item,"status")===context.status)&&(context.scope==="all"||(context.scope==="mine"?isMine(item,state.user?.id):!assigneeOf(item)))&&normalize(`${titleOf(item)} ${valueOf(item,"description","detail")} ${statusLabel(valueOf(item,"status"))}`).includes(term));
    visible.sort((a,b)=>context.sort==="title"?titleOf(a).localeCompare(titleOf(b),"fr"):context.sort==="recent"?new Date(valueOf(b,"updatedAt","updated_at","createdAt")||0)-new Date(valueOf(a,"updatedAt","updated_at","createdAt")||0):String(dueOf(a)||"9999").localeCompare(String(dueOf(b)||"9999")));
    summary.textContent=`${visible.length} résultat${visible.length>1?"s":""} · ${context.scope==="mine"?"affectés à vous":context.scope==="unassigned"?"non affectés":"votre périmètre autorisé"}`;
    results.replaceChildren(...(visible.length?visible.slice(0,context.limit).map(item=>recordRow(domain,item,{onRefresh:reload})): [emptyState("Aucun élément à afficher",term||context.status!=="all"?"Modifiez vos filtres ou votre recherche.":"Les éléments accessibles apparaîtront ici.",sectionForDomain(domain))]));
    more.hidden=visible.length<=context.limit;
  }
  draw();return root;
}
export async function renderRecord(domain,id) {
  const section=sectionForDomain(domain),root=h("div",{class:"focus-detail"});
  const back=()=>setRoute(section,state.route.subpage);
  if(!canAccessSection(section,state.user))return emptyState("Accès indisponible","Cet élément n’est pas accessible à votre compte.","lock");
  let record;
  try{record=await getCoreEntity(domain,encodeURIComponent(id));if(!record||record.id!==id)throw new Error("Élément introuvable ou non accessible.");}
  catch(error){return h("div",{},button("Retour à la liste",{onClick:back}),emptyState("Élément indisponible",errorMessage(error),"lock"));}
  const redraw=async()=>{const next=await renderRecord(domain,id);if(root.isConnected)root.replaceWith(next);};
  const actions=[button("Retour à la liste",{iconName:"ArrowLeft",onClick:back})];
  if(canEditRecord(domain))actions.push(button("Modifier",{iconName:"edit",onClick:()=>editRecord(domain,record,redraw)}));
  root.append(pageHeader({eyebrow:domainLabels[domain],title:titleOf(record),subtitle:statusLabel(valueOf(record,"status")),actions}));
  const metadata=h("dl",{class:"focus-properties"});
  const property=(label,value)=>{if(value!==""&&value!==null&&value!==undefined)metadata.append(h("div",{},h("dt",{text:label}),h("dd",{text:value})));};
  property("Échéance",dueOf(record)?dateLabel(dueOf(record)):"Sans échéance");
  property("Responsable",memberName(list("team").find(m=>(m.id||m.memberId)===assigneeOf(record)))==="Membre"?"Non renseigné":memberName(list("team").find(m=>(m.id||m.memberId)===assigneeOf(record))));
  const project=list("projects").find(p=>p.id===parentOf(record));if(project)property("Projet",titleOf(project));
  const release=valueOf(record,"revision","revisionNumber","versionName","fileVersion");property(domain==="deliverables"?"Version du livrable":"Version de l’enregistrement",release||record.version||"Non renseignée");
  root.append(metadata,h("section",{class:"focus-brief"},h("h2",{text:"Description"}),h("p",{text:valueOf(record,"description","detail","body")||"Aucune description renseignée."})));
  if(domain==="tasks"&&!isFinished(record)&&canEditRecord(domain))root.append(button("Terminer la tâche",{kind:"primary",iconName:"check",onClick:()=>finishTask(record,redraw)}));
  if(domain==="projects"){
    for(const child of ["tasks","deliverables","documents"]){
      if(!canAccessSection(child,state.user))continue;
      const related=list(child).filter(item=>parentOf(item)===id);
      root.append(h("section",{class:"focus-related"},h("h2",{text:domainLabels[child]}),...(related.length?related.map(item=>recordRow(child,item)):[h("p",{class:"focus-summary",text:"Aucun élément lié dans les données chargées."})])));
    }
  }
  const fileId=valueOf(record,"fileId","fileID");
  if(typeof fileId==="string"&&fileId)root.append(button("Ouvrir le fichier",{iconName:"download",onClick:async()=>{try{await downloadFile(encodeURIComponent(fileId));}catch(e){toast(errorMessage(e),"error");}}}));
  if(domain==="validations"&&canEditRecord(domain)&&!isFinished(record)){
    const decide=approved=>{
      const feedback=textarea("",{required:!approved,rows:4,maxLength:4000,placeholder:"Expliquez votre retour…"});let busy=false;
      modal({title:approved?"Confirmer la validation":"Demander une modification",content:h("div",{class:"form"},h("p",{text:`${titleOf(record)} — version d’enregistrement ${record.version}. Cette décision concerne cet élément précis, pas une signature juridique.`}),field(approved?"Commentaire (facultatif)":"Modification demandée",feedback)),actions:[{label:"Annuler",kind:"ghost",onClick:close=>close()},{label:approved?"Confirmer":"Envoyer la demande",kind:"primary",onClick:async close=>{
        if(busy||!validateControls(feedback))return;
        if(!approved&&!feedback.value.trim())return;
        busy=true;
        try{
          const fresh=await getCoreEntity(domain,encodeURIComponent(id));
          if(fresh?.id!==id||fresh.version!==record.version||isFinished(fresh))throw new Error("La version ou l’état a changé. Fermez cette fenêtre et actualisez avant de décider.");
          // Generic core payload retains the decision comment without adding a server route.
          const body=entityBody(fresh);body.status=approved?"approved":"pending";
          const existing=valueOf(body,"description","detail","body");
          putValue(body,["description","detail","body"],`${existing?existing+"\n\n":""}${approved?"Validation":"Modification demandée"} (${new Date().toISOString()}) : ${feedback.value.trim()||"Sans commentaire"}`);
          await saveCoreEntity(domain,body);close();toast(approved?"Validation enregistrée":"Demande de modification enregistrée");await loadWorkspace();await redraw();
        }catch(e){toast(errorMessage(e),"error",7000);}finally{busy=false;}
      }}]});
    };
    root.append(h("div",{class:"focus-decision-actions"},button("Demander une modification",{onClick:()=>decide(false)}),button("Valider cet élément",{kind:"primary",iconName:"check",onClick:()=>decide(true)})));
  }
  if(canEditRecord(domain)){
    const secondary=h("details",{class:"focus-disclosure"},h("summary",{text:"Autres actions"}));
    const kind=({documents:"document",deliverables:"deliverable",contracts:"contract"})[domain];
    if(kind)secondary.append(button("Ajouter un fichier",{iconName:"upload",onClick:()=>{
      const picker=h("input",{type:"file","aria-label":"Fichier à joindre"}),notice=h("p",{class:"focus-summary",role:"status"});let uploading=false;
      modal({title:"Ajouter un fichier",content:h("div",{class:"form"},field("Fichier",picker),notice),beforeClose:()=>!uploading,actions:[{label:"Téléverser",kind:"primary",onClick:async close=>{
        const file=picker.files?.[0];if(!file||uploading)return;
        if(file.size>100*1024*1024){notice.textContent="Ce transfert web est limité à 100 Mo par fichier.";return;}
        uploading=true;notice.textContent="Préparation et transfert du fichier…";
        try{await uploadFile(file,kind,record.id);uploading=false;close();toast("Fichier ajouté");await loadWorkspace();await redraw();}
        catch(e){notice.textContent=errorMessage(e);}finally{uploading=false;}
      }}]});
    }}));
    secondary.append(button("Archiver",{kind:"danger",iconName:"archive",onClick:()=>confirmAction({title:"Archiver cet élément ?",message:titleOf(record),confirmLabel:"Archiver",danger:true,onConfirm:async()=>{await archiveCoreEntity(domain,record.id);await loadWorkspace();back();}})}));
    root.append(secondary);
  }
  return root;
}
