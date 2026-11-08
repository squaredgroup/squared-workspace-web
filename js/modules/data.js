import { buildField,contracts,openOperation,renderWorkflowGroup,groupAllowed } from '../native/workflows.js';
import { dataTable,displayValue,labelFor,statusDot,confirmDialog } from '../native/components.js';
import { mediaEditor } from '../native/media.js';
import { CORE_DOMAIN_BY_SECTION,SPECIALIZED_BY_SECTION,SUBPAGE_DOMAIN_HINTS,SECTIONS,SECTION_DESCRIPTIONS } from "../config.js";
import { editRecord, recordList, supportsRecord } from "../focus-records.js";
import { strictObject, domainLabels } from "../focus-model.js";
import { collectionInsights } from "../data-insights.js";
import { viewContext } from "../focus-state.js";
import { businessUnitList } from "./business-units.js";
import { state } from "../store.js";
import { listCoreDomain,saveCoreEntity,archiveCoreEntity,listSpecialized,saveSpecialized,archiveSpecialized,uploadFile,loadWorkspace,loadDomainCatalog } from "../api.js";
import { h,pageHeader,row,button,modal,field,input,textarea,select,jsonEditor,validateControls,emptyState,skeletonPage,toast,errorMessage,card,pretty,formatDate,relativeDate,advancedEditor,confirmAction,statePanel } from "../ui.js";

function routeKinds(sectionKey,subpage){
  const hinted=SUBPAGE_DOMAIN_HINTS[`${sectionKey}:${subpage}`];
  return hinted?.length?hinted:(SPECIALIZED_BY_SECTION[sectionKey]||[]);
}
function catalogKind(kind){return state.domainCatalog?.kinds?.find(value=>value.kind===kind)}
function fileKind(domain){return({documents:"document",deliverables:"deliverable",contracts:"contract"})[domain]||null}
const coreWritePermission={projects:"manageProjects",missions:"manageMissions",tasks:"manageTasks",validations:"decideValidations",deliverables:"manageDeliverables",contracts:"manageContracts",documents:"manageDocuments",resources:"manageOrganization",clients:"manageClients",events:"manageTasks",notifications:"readWorkspace"};
function canWriteCore(domain){const permission=coreWritePermission[domain];return Boolean(permission&&state.user?.permissions?.includes(permission))}
function statusOptions(kind,fallback="active"){
  const values=catalogKind(kind)?.statuses||[];
  return values.length?values:[fallback,"active","draft","pending","completed","archived"];
}
function subpageDescription(sectionKey,subpage){
  return SECTIONS[sectionKey]?.subpages?.find(value=>value.id===subpage)?.summary||SECTION_DESCRIPTIONS[sectionKey]||"Données synchronisées avec Squared Workspace.";
}
function coreForm(domain,entity,reload){
  if(supportsRecord(domain))return editRecord(domain,entity,reload);
  const isEdit=Boolean(entity?.id);
  const title=input(entity?.title||"",{required:true,placeholder:"Titre"});
  const status=input(entity?.status||"active",{required:true,placeholder:"Statut"});
  const parent=input(entity?.parent_id||entity?.parentId||"",{placeholder:"Identifiant parent (optionnel)"});
  const payload=jsonEditor(entity?.payload||{},"payload");
  const content=h("div",{class:"form"},
    field("Titre",title),
    h("div",{class:"form-row"},field("Statut",status),field("Parent",parent,"À utiliser uniquement si cet élément dépend d’un autre objet Workspace.")),
    advancedEditor("Champs avancés",payload)
  );
  modal({title:`${isEdit?"Modifier":"Créer"} · ${pretty(domain)}`,content,wide:true,actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{
    try{
      if(!validateControls(title,status))return;
      await saveCoreEntity(domain,{...(isEdit?{id:entity.id,version:entity.version}:{}),title:title.value.trim(),status:status.value.trim(),parentId:parent.value.trim()||null,payload:strictObject(payload.value)});
      toast("Enregistré dans Workspace");close();await loadWorkspace();await reload();
    }catch(error){toast(errorMessage(error),"error",5500)}
  }}]});
}
function catalogFields(definition){
  const schema=definition?.schema?.properties||{};
  const declared=Array.isArray(definition?.fields)?definition.fields:Object.entries(definition?.fields||schema).map(([key,value])=>typeof value==="string"?{key,type:value}:{key,...(value||{})});
  const required=new Set(definition?.required||definition?.schema?.required||[]),known=new Set();
  const fields=[];
  for(const raw of declared){
    const meta=typeof raw==="string"?{key:raw}:{...raw};meta.key=meta.key||meta.name||meta.id;
    if(!meta.key||known.has(meta.key)||["title","name","status","state","lifecycle"].includes(meta.key)||meta.readOnly)continue;
    const format=String(meta.format||"").toLowerCase(),type=({"date-time":"datetime",uri:"url"})[format]||(["date","email","url","tel"].includes(format)?format:String(meta.type||"text").toLowerCase());
    if(["object","array","json"].includes(type))continue;
    known.add(meta.key);fields.push({...meta,type,required:Boolean(meta.required||required.has(meta.key))});
  }
  for(const key of required)if(!known.has(key)&&!["title","name","status","state","lifecycle"].includes(key))fields.push({key,type:"text",required:true});
  return fields;
}
function catalogControl(meta,value){
  const options=meta.options||meta.enum||meta.values;
  if(Array.isArray(options)&&options.length){
    const normalized=options.map(option=>typeof option==="object"?{value:option.value??option.id,label:option.label||option.name||pretty(option.value??option.id)}:{value:option,label:pretty(option)});
    if(!meta.required)normalized.unshift({value:"",label:"Non défini"});
    return select(value??"",normalized);
  }
  if(["boolean","bool"].includes(meta.type))return h("input",{type:"checkbox",checked:Boolean(value)});
  if(["number","integer","decimal","currency","percent"].includes(meta.type))return input(value??"",{type:"number",step:meta.type==="integer"?"1":"any",required:meta.required,min:meta.minimum??meta.min,max:meta.maximum??meta.max});
  if(["date"].includes(meta.type))return input(value?String(value).slice(0,10):"",{type:"date",required:meta.required});
  if(["datetime","date-time"].includes(meta.type))return input(value?String(value).slice(0,16):"",{type:"datetime-local",required:meta.required});
  if(["email","url","tel"].includes(meta.type))return input(value??"",{type:meta.type,required:meta.required,maxLength:meta.maxLength});
  if(["textarea","multiline","longtext","richtext"].includes(meta.type))return textarea(value??"",{required:meta.required,rows:4,maxLength:meta.maxLength});
  return input(value??"",{required:meta.required,maxLength:meta.maxLength});
}
function catalogValue(meta,control){
  if(["boolean","bool"].includes(meta.type))return control.checked;
  if(["number","integer","decimal","currency","percent"].includes(meta.type))return control.value===""?null:Number(control.value);
  return control.value.trim()===""?null:control.value.trim();
}
function valueSchema(key,value){
 if(Array.isArray(value))return{type:'array',items:value.length?valueSchema('item',value[0]):{type:'string'}};
 if(value&&typeof value==='object')return{type:'object',properties:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,valueSchema(k,v)]))};
 if(typeof value==='number')return{type:'number'};if(typeof value==='boolean')return{type:'boolean'};
 if(/ID$|Id$/.test(key))return{type:'string',format:'uuid'};if(/At$|Date$/.test(key))return{type:'string',format:typeof value==='string'&&value.includes('T')?'date-time':'date'};
 return{type:'string',...(typeof value==='string'&&value.length>250?{maxLength:20000}:{}),...(value===null?{anyOf:[{type:'string'},{type:'null'}]}:{})};
}
export function specializedForm(kind,entity,reload){
 const definition=catalogKind(kind);if(!definition?.writable||definition.genericUpdate===false&&entity||definition.genericCreate===false&&!entity){toast('Utilisez le circuit métier de cette fiche.','error');return;}
 let savedEntity=entity;const media=mediaEditor('domain:'+kind,entity?.id),data=entity?.data||{},title=input(entity?.title||'',{required:true,maxLength:300}),status=select(entity?.status||definition.statuses?.[0]||'draft',statusOptions(kind).map(value=>({value,label:labelFor(value)}))),reserved=new Set(['title','name','legalName','subject','state','status','lifecycle']),keys=[...new Set([...Object.keys(data),...(definition.required||[])])].filter(k=>!reserved.has(k));
 const schema={type:'object',properties:Object.fromEntries(keys.map(key=>[key,valueSchema(key,data[key])])),required:(definition.required||[]).filter(k=>!reserved.has(k))},structured=buildField(schema,'Informations',data,{context:{...data,...entity}}),content=h('div',{class:'form'},media.node,field('Titre',title),field('Statut',status),structured.node);
 modal({title:(entity?'Modifier':'Créer')+' · '+pretty(kind),content,wide:true,className:'sq-specialized-editor',onClose:media.dispose,actions:[{label:'Enregistrer',kind:'primary',icon:'check',onClick:async close=>{if(!title.reportValidity())return;const finalData={...data,...structured.read()};for(const key of ['title','name','legalName','subject'])if(key in data||(definition.required||[]).includes(key))finalData[key]=title.value.trim();for(const key of ['state','status','lifecycle'])if(key in data||(definition.required||[]).includes(key))finalData[key]=status.value;
 savedEntity=await saveSpecialized(kind,{...(savedEntity?{id:savedEntity.id,version:savedEntity.version}:{}),title:title.value.trim(),status:status.value,data:finalData});await media.save(savedEntity.id);close();toast('Donnée métier enregistrée');await reload();}}]});
}
async function attachFile(domain,entity){
  const kind=fileKind(domain);if(!kind)return;
  const picker=h("input",{type:"file",class:"sr-only"});document.body.append(picker);
  const cleanup=()=>picker.remove();
  picker.addEventListener("change",async()=>{
    const file=picker.files?.[0];if(!file){cleanup();return}
    try{toast(`Téléversement de « ${file.name} »…`);await uploadFile(file,kind,entity.id);toast("Fichier ajouté et contrôlé")}
    catch(error){toast(errorMessage(error),"error",6000)}
    finally{cleanup()}
  },{once:true});
  picker.click();
}
function archiveAction({kind,item,specialized,reload}){
  confirmAction({
    title:"Archiver cet élément ?",
    message:`« ${item.title||"Sans titre"} » restera traçable mais ne fera plus partie des éléments actifs.`,
    confirmLabel:"Archiver",
    danger:true,
    onConfirm:async()=>{
      try{
        specialized?await archiveSpecialized(kind,item.id,item.version):await archiveCoreEntity(kind,item.id);
        toast("Élément archivé");await reload();
      }catch(error){toast(errorMessage(error),"error")}
    }
  });
}
function renderDomainList({kind,items,writable,reload,specialized=false}){
  if(specialized&&kind==="business-units")return businessUnitList({items,writable,reload,onEdit:item=>specializedForm(kind,item,reload)});
  if(!specialized&&supportsRecord(kind))return recordList(kind,items,reload,{writable});
  const definition=catalogKind(kind),host=h('div',{class:'sq-pane'}),dedicated=definition?.workflowRequired||definition?.genericUpdate===false;
  const workflow=async item=>{const catalog=await contracts(),ops=catalog.operations.filter(o=>o.path.split('/').includes(kind)&&groupAllowed(o.group,!o.readOnly)&&(!item||Object.keys(o.params?.properties||{}).length));if(!ops.length)throw new Error('Le circuit de cette fiche n’est pas disponible pour vos droits.');const menu=h('div',{class:'stack'});for(const op of ops)menu.append(button(({GET:'Consulter',POST:'Continuer',PUT:'Modifier',PATCH:'Modifier',DELETE:'Supprimer'})[op.method]+' · '+labelFor(op.path.split('/').at(-1).replace(':','')),{onClick:()=>openOperation(op,{context:item||{},onComplete:reload})}));modal({title:'Circuit · '+pretty(kind),content:menu,wide:true});};
  const canModify=item=>writable&&!dedicated&&!item?.data?.workflowManaged&&!(kind==='fiscal-periods'&&['closed','audited'].includes(item.status))&&!(kind==='supplier-bills'&&item.status!=='draft');
  const edit=item=>specialized?specializedForm(kind,item,reload):coreForm(kind,item,reload);
  const actions=item=>[{label:'Informations',icon:'document',group:'Consulter',run:()=>modal({title:item.title||pretty(kind),content:displayValue(item),wide:true})},...(canModify(item)?[{label:'Modifier',icon:'edit',group:'Gérer',run:()=>edit(item)}]:[]),...(dedicated||item.data?.workflowManaged?[{label:'Ouvrir le circuit métier',icon:'sync',group:'Parcours',run:()=>workflow(item)}]:[]),...(canModify(item)&&definition?.genericArchive!==false?[{label:'Archiver',icon:'archive',group:'Conserver',run:()=>archiveAction({kind,item,specialized,reload})}]:[])];
  if(writable)host.append(button(dedicated?'Circuit de création':'Nouveau',{kind:'primary',iconName:'add',onClick:()=>dedicated?workflow(null):edit(null)}));
  host.append(dataTable({rows:items,columns:[{id:'title',label:'Titre'},{id:'status',label:'Statut',render:r=>statusDot(r.status,labelFor(r.status)),value:r=>labelFor(r.status)},{id:'updatedAt',label:'Modifié le',value:r=>formatDate(r.updatedAt||r.updated_at)}],onOpen:item=>actions(item)[0].run(),actions,name:kind,selectionActions:selected=>[{label:'Informations de la sélection',icon:'document',group:'Consulter',run:()=>modal({title:selected.length+' élément(s)',content:displayValue(selected),wide:true})},...(specialized&&writable&&!dedicated&&definition?.genericArchive!==false?[{label:'Archiver la sélection',icon:'archive',group:'Conserver',run:async()=>{if(!await confirmDialog({title:'Archiver la sélection ?',message:selected.length+' élément(s) concernés.',label:'Archiver'}))return;for(const item of selected){if(!canModify(item))throw new Error('Une fiche demande son circuit dédié.');await archiveSpecialized(kind,item.id,item.version);}await reload();}}]:[])]}));return host;
}

function snapshotView(value){
  if(value==null)return emptyState("Module prêt","Ce module est disponible mais ne contient encore aucune donnée dans votre périmètre.");
  if(Array.isArray(value)){
    if(!value.length)return emptyState("Aucune donnée","Aucun élément n’est actuellement disponible.");
    return h("div",{class:"list"},...value.slice(0,100).map((item,index)=>row({
      title:item?.title||item?.name||item?.label||`Élément ${index+1}`,
      subtitle:item?.detail||item?.description||"",
      status:item?.status||item?.state,
      meta:formatDate(item?.updatedAt||item?.updated_at||item?.createdAt||item?.created_at)
    })));
  }
  if(typeof value==="object"){
    const entries=Object.entries(value);
    const summaryCards=entries.slice(0,8).map(([key,val])=>{
      const display=Array.isArray(val)?String(val.length):(val&&typeof val==="object"?"Disponible":String(val??"—"));
      return card(pretty(key),"",h("div",{class:"stat-value",text:display}));
    });
    return h(
      "div",
      {class:"stack"},
      h("div",{class:"grid two"},...summaryCards),
      advancedEditor("Voir les données techniques",h("pre",{class:"json-view",text:JSON.stringify(value,null,2)}))
    );
  }
  return h("div",{class:"card-title",text:String(value)});
}
function dataOverview(collections,errors){
  const reports=collections.map(value=>collectionInsights(value.items));
  const total=reports.reduce((sum,value)=>sum+value.total,0),active=reports.reduce((sum,value)=>sum+value.active,0),overdue=reports.reduce((sum,value)=>sum+value.overdue,0);
  const freshness=state.lastSyncAt?relativeDate(state.lastSyncAt):"à confirmer";
  return h("section",{class:`data-overview ${errors?"has-errors":""}`},
    h("div",{class:"data-overview-copy"},h("span",{class:"data-overview-kicker",text:"Activité"}),h("h2",{text:"Vue d’ensemble"}),h("p",{text:"Suivez les éléments actifs et les échéances de cette rubrique."})),
    h("div",{class:"data-overview-metrics"},
      h("div",{},h("strong",{text:String(total)}),h("span",{text:"éléments"})),
      h("div",{},h("strong",{text:String(active)}),h("span",{text:"actifs"})),
      h("div",{},h("strong",{text:String(overdue)}),h("span",{text:"en retard"})),
      h("div",{},h("strong",{text:String(collections.length)}),h("span",{text:"collections"}))
    ),
    h("div",{class:"data-overview-sync"},h("i"),h("span",{text:`Synchronisé ${freshness}`}),errors?h("strong",{text:`${errors} domaine${errors>1?"s":""} à relancer`}):null)
  );
}
async function loadCollections(jobs,limit=4){
  const output=new Array(jobs.length);let cursor=0;
  const worker=async()=>{while(cursor<jobs.length){const index=cursor++,job=jobs[index];try{output[index]={...job,items:await job.load(),error:null}}catch(error){output[index]={...job,items:[],error}}}};
  await Promise.all(Array.from({length:Math.min(limit,jobs.length)},worker));return output;
}
export async function renderDataSection(sectionKey,subpage=""){
  const section=SECTIONS[sectionKey],root=h("div");
  root.append(pageHeader({eyebrow:section?.group||"Workspace",title:section?.title||pretty(sectionKey),subtitle:subpageDescription(sectionKey,subpage)}),skeletonPage());
  try{
    if(!state.workspace)await loadWorkspace();
    if(!state.domainCatalog)await loadDomainCatalog().catch(()=>null);
    const core=CORE_DOMAIN_BY_SECTION[sectionKey];
    const kinds=routeKinds(sectionKey,subpage).filter(kind=>catalogKind(kind));
    const body=h("div",{class:"grid"});root.lastChild.remove();
    const jobs=[];
    if(core)jobs.push({kind:core,specialized:false,definition:null,load:()=>listCoreDomain(core)});
    for(const kind of kinds)jobs.push({kind,specialized:true,definition:catalogKind(kind),load:()=>listSpecialized(kind)});
    const loaded=await loadCollections(jobs);
    const retryAll=async()=>{const next=await renderDataSection(sectionKey,subpage);if(root.isConnected)root.replaceWith(next)};
    const successful=loaded.filter(value=>!value.error),errorCount=loaded.length-successful.length;
    if(loaded.length)root.append(dataOverview(successful,errorCount));

    for(const source of loaded){
      const {kind,specialized,definition,items,error}=source;
      if(error){
        body.append(card(pretty(kind),"Ce domaine n’empêche pas les autres données de rester disponibles.",statePanel({tone:"danger",title:"Chargement interrompu",copy:errorMessage(error),action:button("Réessayer",{small:true,kind:"ghost",iconName:"sync",onClick:retryAll})}),{iconName:"warning"}));
        continue;
      }
      const writable=specialized?Boolean(definition?.writable):canWriteCore(kind);let panel;
      const reload=async()=>{const next=specialized?await listSpecialized(kind):await listCoreDomain(kind);panel.querySelector(".domain-slot")?.replaceChildren(renderDomainList({kind,items:next,writable,reload,specialized}))};
      const slot=h("div",{class:"domain-slot"},renderDomainList({kind,items,writable,reload,specialized}));
      const title=specialized?({"business-units":"Pôles","legal-entities":"Entités juridiques","establishments":"Établissements","cost-centers":"Centres de coûts","memberships":"Rattachements","service-level-agreements":"Engagements de service","service-incidents":"Incidents","problems":"Problèmes","service-changes":"Changements"}[kind]||pretty(kind)):"Liste · "+(domainLabels[kind]||pretty(kind));
      const subtitle=specialized?`${items.length} enregistrement${items.length>1?"s":""} · ${writable?"modifiable":"lecture seule"}.`:`${items.length} élément${items.length>1?"s":""} synchronisé${items.length>1?"s":""} avec Workspace.`;
      panel=card(title,subtitle,slot,{iconName:specialized?"grid":sectionKey});body.append(panel);
    }

    if(!core&&!kinds.length){
      const workspaceValue=state.workspace?.[sectionKey]??state.workspace?.enterprise?.[sectionKey]??state.workspace?.intelligence?.[sectionKey];
      body.append(card(section?.title||pretty(sectionKey),"Vue synchronisée du snapshot Workspace.",snapshotView(workspaceValue),{iconName:sectionKey}));
    }
    root.append(body);
  }catch(error){
    root.replaceChildren(pageHeader({eyebrow:"Erreur",title:section?.title||pretty(sectionKey),subtitle:"Le module n’a pas pu être chargé correctement."}),emptyState("Impossible de charger ce module",errorMessage(error),"warning"));
  }
  return root;
}
