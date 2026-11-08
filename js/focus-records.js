import { entryPresentation } from './native/entry-presentation.js';
import { buildField } from './native/workflows.js';
import { mediaEditor,recordMedia } from './native/media.js';
import { dataTable,actionMenu,statusDot,confirmDialog,downloadBlob } from './native/components.js';
import { state, setRoute } from "./store.js";
import { canAccessSection, SECTIONS } from "./config.js";
import { getCoreEntity, saveCoreEntity, loadWorkspace, downloadFile, uploadFile, archiveCoreEntity } from "./api.js";
import { h, button, icon, modal, field, input, textarea, select, emptyState, toast, errorMessage, validateControls, confirmAction, pageHeader } from "./ui.js";
import { viewContext } from "./focus-state.js";
import { titleOf, valueOf, dueOf, parentOf, assigneeOf, isMine, isFinished, normalize, dayKey, dateLabel, dueBucket, statusLabel, domainLabels, sectionForDomain, putValue } from "./focus-model.js";
import { formatMoney } from "./money.js";

const permissions={projects:"manageProjects",tasks:"manageTasks",missions:"manageMissions",events:"manageTasks",validations:"decideValidations",deliverables:"manageDeliverables",documents:"manageDocuments",resources:"manageOrganization",contracts:"manageContracts",clients:"manageClients"};
export const canEditRecord=domain=>Boolean(state.user?.permissions?.includes(permissions[domain]));
export const supportsRecord=domain=>Object.hasOwn(permissions,domain);
const list=key=>Array.isArray(state.workspace?.[key])?state.workspace[key]:[];
const memberName=member=>member?.name||`${member?.firstName||member?.first_name||""} ${member?.lastName||member?.last_name||""}`.trim()||member?.email||"Membre";
const statusOptions=(domain,record)=>{
  const fromCatalog=state.domainCatalog?.kinds?.find(k=>k.kind===domain)?.statuses;
  const existing=list(domain).map(item=>valueOf(item,"status")).filter(Boolean);
  const defaults=domain==="validations"?["pending","approved","rejected"]:["active","production","review","validation","pending","planned","tentative","postponed","cancelled","completed","approved","rejected","blocked","urgent","delivered","signature"];
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
export function editRecord(domain,record=null,reload=async()=>{},defaults={}) {
  if(!canEditRecord(domain)){toast("Cette modification n’est pas autorisée.","error");return;}
  const original=record||defaults,editing=Boolean(original.id),person=state.user?.id;let savedRecord=record;const media=mediaEditor(domain,record?.id);
  if(editing&&!(Number(original.version)>0)){toast("Actualisez le détail avant de modifier cet élément.","error");return;}
  const title=input(record?titleOf(record):"",{required:true,maxLength:240,placeholder:domain==="tasks"?"Que faut-il faire ?":"Donnez un titre clair"});
  const status=select(valueOf(original,"status")||(domain==="tasks"?"pending":["projects","missions"].includes(domain)?"planned":"active"),statusOptions(domain,original));
  if(domain==="validations")status.disabled=true;
  const description=textarea(valueOf(original,...(["missions","projects"].includes(domain)?["summary","description","detail","body"]:domain==="contracts"?["scope","description","detail","body"]:["description","detail","body"]))||"",{rows:4,maxLength:20000,placeholder:"Contexte, résultat attendu, informations utiles…"});
  const project=choiceWithCurrent(parentOf(original),list("projects").map(p=>({value:p.id,label:titleOf(p)})),"Aucun projet");
  const assignee=choiceWithCurrent(assigneeOf(original),list("team").map(m=>({value:m.id||m.memberId,label:memberName(m)})),"Non affecté");
  const oldDue=dueOf(original),date=input(dayKey(oldDue),{type:"date"});
  const canonicalPriority=valueOf(original,"priorityLevel")||(domain==="tasks"?valueOf(original,"priority"):(["urgent","blocked"].includes(valueOf(original,"priority"))?"critical":"normal"));
  const priority=choiceWithCurrent(canonicalPriority,[{value:"low",label:"Basse"},{value:"normal",label:"Normale"},{value:"high",label:"Haute"},{value:"critical",label:"Critique"}],"Non définie");
  const controls=[title,status,description],content=h("form",{class:"form focus-editor"},field(domain==="tasks"?"Tâche":"Titre",title),field(domain==="missions"?"Résumé":domain==="contracts"?"Périmètre du contrat":"Description",description));
  const remuneration=domain==="missions"?input(valueOf(original,"remuneration")||"",{placeholder:"Ex. 1 250,00 ou modalités convenues",maxLength:240}):null;
  const client=domain==="contracts"?input(valueOf(original,"client")||"",{placeholder:"Partie contractante",required:true,maxLength:240}):null;
  const amount=domain==="contracts"?input(valueOf(original,"amount")||"",{placeholder:"Montant du contrat",required:true,maxLength:120}):null;
  const currency=["missions","contracts"].includes(domain)?input(valueOf(original,"currency")||"EUR",{placeholder:"EUR",required:true,maxLength:3}):null;
  const metadata=h("div",{class:"form-row"},field("Statut",status));
  if(["tasks","missions","events","deliverables","documents","validations"].includes(domain)){metadata.append(field("Projet",project));controls.push(project);}
  if(["tasks","missions","events","projects","deliverables"].includes(domain)){
    content.append(h("div",{class:"form-row"},field("Responsable",assignee),field("Échéance",date,"Une date sans heure reste une date de calendrier.")));
    controls.push(assignee,date);
  }
  if(["projects","missions","tasks"].includes(domain)){metadata.append(field("Priorité",priority));controls.push(priority);}
  if(remuneration&&currency){content.append(h("div",{class:"form-row"},field("Rémunération",remuneration,"Facultative ; elle sera affichée dans la proposition envoyée."),field("Devise",currency)));controls.push(remuneration,currency);}
  if(client&&amount&&currency){content.append(h("div",{class:"form-row"},field("Partie contractante",client),field("Montant",amount)),field("Devise",currency));controls.push(client,amount,currency);}
  content.append(metadata);
  const optional=(type,extra={})=>({type,anyOf:[{type,...extra},{type:'null'}]});
  const properties=domain==='projects'?{clientID:optional('string',{format:'uuid'}),budgetAmount:optional('number',{minimum:0,maximum:1e12}),currency:{type:'string',pattern:'^[A-Z]{3}$'},startsAt:optional('string',{format:'date-time'}),objectives:{type:'string',maxLength:20000},successCriteria:{type:'string',maxLength:20000},objectiveDetails:{type:'array',maxItems:50,items:{type:'object',properties:{id:{type:'string',format:'uuid'},title:{type:'string',minLength:1},criterion:{type:'string'},target:{type:'string'},unit:{type:'string'},dueAt:optional('string',{format:'date-time'})},required:['id','title']}}}:domain==='missions'?{startsAt:optional('string',{format:'date-time'}),estimateHours:optional('number',{minimum:0,maximum:100000}),acceptanceCriteria:{type:'string',maxLength:20000}}:domain==='clients'?{contact:{type:'string'},email:{type:'string',format:'email'},phone:{type:'string'},address:{type:'string'},sector:{type:'string'}}:domain==='events'?{startsAt:optional('string',{format:'date-time'}),endsAt:optional('string',{format:'date-time'}),location:{type:'string'},meetingURL:{type:'string',format:'uri'}}:{};
  for(const key of Object.keys(properties)){const current=valueOf(original,key);if(properties[key].type==='string'&&current&&typeof current==='object')delete properties[key];}
  const initial=Object.fromEntries(Object.keys(properties).map(key=>[key,valueOf(original,key)||(['objectiveDetails'].includes(key)?[]:key==='currency'?'EUR':undefined)]));
  if(domain==='projects'){const budget=valueOf(original,'budgetAmount');initial.budgetAmount=budget===''?null:budget;}
  const extra=Object.keys(properties).length?buildField({type:'object',properties},'Informations',initial,{context:original}):null;if(extra)content.append(extra.node);
  const teamChoices=[];
  if(domain==='projects'){
   const selected=new Set(valueOf(original,'memberIDs')||[]),members=h('div',{class:'sq-member-options'}),search=input('',{type:'search',placeholder:'Rechercher un collaborateur…'});for(const member of list('team')){const id=member.id||member.memberId,choice=h('input',{type:'checkbox',checked:selected.has(id),value:id}),name=memberName(member),line=h('label',{class:'sq-check-row'},choice,h('span',{text:name}));teamChoices.push(choice);members.append(line);search.addEventListener('input',()=>line.hidden=!name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));}content.append(field('Collaborateurs',h('div',{class:'stack'},search,members)));
  }
  const tags=['projects','missions','documents','resources'].includes(domain)?input((valueOf(original,'tags')||[]).join?.(', ')||valueOf(original,'tags')||'',{placeholder:'Étiquettes séparées par des virgules'}):null;if(tags)content.append(field('Étiquettes',tags));
  content.prepend(media.node);
  const presentation=entryPresentation(content,{domain,title,status,description,priority,assignee,date,project,client,amount,currency,remuneration,extra,propertyKeys:Object.keys(properties),media:media.node,tags});
  const error=h("p",{class:"focus-form-error",role:"alert",hidden:true});content.append(error);
  let dirty=false,busy=false;
  content.addEventListener("input",()=>dirty=true);content.addEventListener("change",()=>dirty=true);
  let dialog;
  const save=async close=>{
    if(busy||!validateControls(controls))return;
    if(!title.value.trim()){title.setCustomValidity("Saisissez un titre.");title.reportValidity();title.addEventListener("input",()=>title.setCustomValidity(""),{once:true});return;}
    if(!state.online){error.hidden=false;error.textContent="Connexion nécessaire pour enregistrer. La saisie reste dans cette fenêtre.";return;}
    busy=true;error.hidden=true;
    const body=entityBody(savedRecord||original);body.title=title.value.trim();body.status=status.value;
    putValue(body,["missions","projects"].includes(domain)?["summary","description","detail","body"]:domain==="contracts"?["scope","description","detail","body"]:["description","detail","body"],description.value);
    if(controls.includes(project)){
      body.parentId=project.value||null;
      if(Object.hasOwn(body,"parent_id"))body.parent_id=body.parentId;
      if(valueOf(original,"projectId","projectID","project_id"))putValue(body,["projectId","projectID","project_id"],body.parentId);
    }
    if(controls.includes(assignee))putValue(body,domain==="projects"?["leadID","assigneeId","ownerId"]:domain==="missions"?["ownerID","assigneeId","ownerId"]:["assigneeID","assigneeId","assignedToId","assignedToID","assignedTo","responsibleId","ownerId"],assignee.value||null);
    // Do not erase an existing timestamp merely by opening and saving the form.
    if(controls.includes(date)&&date.value!==(dayKey(oldDue)))putValue(body,["dueAt","due_at","dueDate","deadline","startAt","start_at","startsAt"],date.value||null);
    if(controls.includes(priority))putValue(body,[domain==="tasks"?"priority":"priorityLevel"],priority.value||null);
    if(remuneration&&currency){putValue(body,["remuneration"],remuneration.value.trim()||null);putValue(body,["currency"],remuneration.value.trim()?currency.value.trim().toUpperCase():null);}
    if(client&&amount&&currency){putValue(body,["client"],client.value.trim());putValue(body,["amount"],amount.value.trim());putValue(body,["currency"],currency.value.trim().toUpperCase());}
    try {
      if(extra){const values=extra.read();if(domain==='projects'&&values.objectiveDetails)values.objectiveDetails=values.objectiveDetails.map(v=>({id:v.id,title:v.title||'',criterion:v.criterion||'',target:v.target||'',unit:v.unit||'',dueAt:v.dueAt||null}));for(const[key,value]of Object.entries(values))if(value!==undefined)putValue(body,[key],value);}
      if(domain==='projects'){const ids=teamChoices.filter(c=>c.checked).map(c=>c.value);if(assignee.value&&!ids.includes(assignee.value))ids.push(assignee.value);putValue(body,['memberIDs'],ids);const lead=list('team').find(m=>(m.id||m.memberId)===assignee.value);if(lead)putValue(body,['lead'],memberName(lead));const clientID=valueOf(body,'clientID'),clientItem=list('clients').find(c=>c.id===clientID);if(clientItem)putValue(body,['client'],titleOf(clientItem));}
      if(tags)putValue(body,['tags'],[...new Set(tags.value.split(',').map(v=>v.trim()).filter(Boolean))]);
      savedRecord=await saveCoreEntity(domain,body);
      if(state.user?.id!==person)return;
      await media.save(savedRecord.id);
      dirty=false;busy=false;close();toast(editing?"Modifications enregistrées":"Élément créé");
      try{await loadWorkspace();await reload();}catch{toast("Enregistrement confirmé. Actualisez la liste lorsque le réseau revient.","error");}
    }catch(e){if(state.user?.id===person){error.hidden=false;error.textContent=errorMessage(e);}}
    finally{busy=false;}
  };
  dialog=modal({title:presentation.title(editing),initialFocus:"#"+title.id,content,wide:true,className:"focus-editor-dialog",onClose:media.dispose,beforeClose:()=>!busy&&(!dirty||window.confirm("Abandonner les modifications non enregistrées ?")),actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:save}]});
  presentation.attach(dialog.panel);
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
  const amount=domain==="missions"?valueOf(record,"remuneration"):valueOf(record,"amount","amountValue","total","totalAmount");
  if(amount!==""&&amount!==null&&amount!==undefined)metadata.push(formatMoney(amount,valueOf(record,"currency")||(domain==="missions"?"":"EUR")));
  const text=h("button",{class:"focus-record-open",type:"button",onClick:()=>openRecord(domain,record.id),"aria-label":`Ouvrir ${titleOf(record)}`},h("strong",{text:titleOf(record)}),h("span",{class:"focus-record-meta",text:metadata.join(" · ")||domainLabels[domain]||domain}),h("span",{class:`focus-status ${dueBucket(record)==="overdue"&&!isFinished(record)?"is-late":""}`,text:statusLabel(valueOf(record,"status"))}));
  const row=h("article",{class:`focus-record ${compact?"compact":""}`,dataset:{recordId:record.id}},h("span",{class:"focus-record-icon","aria-hidden":"true"},icon(sectionForDomain(domain),20)),text);
  if(domain==="tasks"&&canEditRecord(domain)&&!isFinished(record))row.append(button("Terminer",{small:true,kind:"ghost",ariaLabel:`Terminer ${titleOf(record)}`,onClick:()=>finishTask(record,onRefresh)}));
  return row;
}
export function recordList(domain,items,reload,{writable=canEditRecord(domain)}={}){
 const root=h('div',{class:'sq-pane'}),archived=new Set(state.workspace?.intelligence?.archivedEntityIDs||[]),visible=items.filter(r=>!archived.has(r.id));
 const open=r=>openRecord(domain,r.id),share=async rows=>{const{shareRecords}=await import('./native/records.js');return shareRecords(domain,rows);},archive=async(rows,archived=false)=>{const{archiveRecords}=await import('./native/trash.js');const kind=({projects:'project',missions:'mission',tasks:'task',events:'event',documents:'document',contracts:'contract',clients:'client',validations:'validation',deliverables:'deliverable',resources:'resource'})[domain];await archiveRecords(rows,kind,{archived});await loadWorkspace();await reload();};
 const actions=r=>[{label:'Ouvrir',icon:'Show',group:'Consulter',run:()=>open(r)},...(writable?[{label:'Modifier',icon:'edit',group:'Gérer',run:()=>editRecord(domain,r,reload)}]:[]),...(state.user?.permissions?.includes('sendMessages')?[{label:'Partager dans une conversation',icon:'share',group:'Diffuser',run:()=>share([r])}]:[]),...(writable?[{label:'Archiver',icon:'archive',group:'Conserver',run:()=>archive([r],true)},{label:'Mettre à la corbeille',icon:'trash',danger:true,group:'Supprimer',run:()=>archive([r])}]:[])];
 if(writable)root.append(h('div',{class:'sq-viewer-toolbar'},button('Nouveau',{kind:'primary',iconName:'add',onClick:()=>editRecord(domain,null,reload)})));
 root.append(dataTable({rows:visible,name:domain,onOpen:open,columns:[{id:'title',label:domainLabels[domain]||'Titre',value:titleOf},{id:'status',label:'Statut',value:r=>statusLabel(valueOf(r,'status')),render:r=>statusDot(valueOf(r,'status'),statusLabel(valueOf(r,'status')))},{id:'responsible',label:'Responsable',value:r=>memberName(list('team').find(m=>m.id===assigneeOf(r)))},{id:'due',label:'Échéance',value:r=>dueOf(r)?dateLabel(dueOf(r)):'Sans échéance'},{id:'project',label:'Projet',value:r=>titleOf(list('projects').find(p=>p.id===parentOf(r))||{})}],actions,selectionActions:rows=>[...(state.user?.permissions?.includes('sendMessages')?[{label:'Partager la sélection',icon:'share',group:'Diffuser',run:()=>share(rows)}]:[]),...(writable?[{label:'Archiver la sélection',icon:'archive',group:'Conserver',run:()=>archive(rows,true)},{label:'Mettre à la corbeille',icon:'trash',danger:true,group:'Supprimer',run:()=>archive(rows)}]:[])]}));return root;
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
  if(["missions","contracts"].includes(domain)&&canEditRecord(domain)&&state.user?.permissions?.includes("sendMessages"))actions.push(button("Proposer dans une conversation",{iconName:"messages",kind:"primary",onClick:async()=>{const {openRecordProposal}=await import("./message-proposals.js");openRecordProposal(domain,record,redraw);}}));
  root.append(pageHeader({eyebrow:domainLabels[domain],title:titleOf(record),subtitle:statusLabel(valueOf(record,"status")),actions}));
  try{root.append(await recordMedia(domain,id));}catch{}
  const metadata=h("dl",{class:"focus-properties"});
  const property=(label,value)=>{if(value!==""&&value!==null&&value!==undefined)metadata.append(h("div",{},h("dt",{text:label}),value instanceof Node?h("dd",{},value):h("dd",{text:value})));};
  property("Échéance",dueOf(record)?dateLabel(dueOf(record)):"Sans échéance");
  if(domain==="missions")property("Rémunération",formatMoney(valueOf(record,"remuneration"),valueOf(record,"currency")||"","Non renseignée"));
  if(domain==="contracts"){property("Partie contractante",valueOf(record,"client"));property("Montant",formatMoney(valueOf(record,"amount")||valueOf(record,"amountValue"),valueOf(record,"currency")||"EUR"));property("Devise",valueOf(record,"currency"));}
  property("Responsable",memberName(list("team").find(m=>(m.id||m.memberId)===assigneeOf(record)))==="Membre"?"Non renseigné":memberName(list("team").find(m=>(m.id||m.memberId)===assigneeOf(record))));
  const project=list("projects").find(p=>p.id===parentOf(record));if(project&&canAccessSection("projects",state.user))property("Projet",button(titleOf(project),{small:true,kind:"ghost",iconName:"folder",onClick:()=>openRecord("projects",project.id)}));
  const release=valueOf(record,"revision","revisionNumber","versionName","fileVersion");property(domain==="deliverables"?"Version du livrable":"Version de l’enregistrement",release||record.version||"Non renseignée");
  property("Dernière mise à jour",valueOf(record,"updatedAt","updated_at")?dateLabel(valueOf(record,"updatedAt","updated_at")):null);
  root.append(h("div",{class:"studio-record-layout"},h("div",{class:"studio-record-main"},h("section",{class:"focus-brief"},h("h2",{text:domain==="missions"?"Résumé":domain==="contracts"?"Périmètre du contrat":"Description"}),h("p",{text:valueOf(record,...(["missions","projects"].includes(domain)?["summary","description","detail","body"]:domain==="contracts"?["scope","description","detail","body"]:["description","detail","body"]))||"Aucune description renseignée."}))),metadata));
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
