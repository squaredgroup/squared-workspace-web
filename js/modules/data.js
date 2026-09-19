import { CORE_DOMAIN_BY_SECTION,SPECIALIZED_BY_SECTION,SUBPAGE_DOMAIN_HINTS,SECTIONS,SECTION_DESCRIPTIONS } from "../config.js";
import { state } from "../store.js";
import { listCoreDomain,saveCoreEntity,archiveCoreEntity,listSpecialized,saveSpecialized,archiveSpecialized,uploadFile,loadWorkspace,loadDomainCatalog } from "../api.js";
import { h,pageHeader,toolbar,row,button,modal,field,input,select,jsonEditor,safeJSON,emptyState,skeletonPage,toast,errorMessage,card,pretty,formatDate,advancedEditor,confirmAction,badge } from "../ui.js";

function routeKinds(sectionKey,subpage){
  const hinted=SUBPAGE_DOMAIN_HINTS[`${sectionKey}:${subpage}`];
  return hinted?.length?hinted:(SPECIALIZED_BY_SECTION[sectionKey]||[]);
}
function catalogKind(kind){return state.domainCatalog?.kinds?.find(value=>value.kind===kind)}
function fileKind(domain){return({documents:"document",deliverables:"deliverable",contracts:"contract"})[domain]||null}
function statusOptions(kind,fallback="active"){
  const values=catalogKind(kind)?.statuses||[];
  return values.length?values:[fallback,"active","draft","pending","completed","archived"];
}
function subpageDescription(sectionKey,subpage){
  return SECTIONS[sectionKey]?.subpages?.find(value=>value.id===subpage)?.summary||SECTION_DESCRIPTIONS[sectionKey]||"Données synchronisées avec Squared Workspace.";
}
function coreForm(domain,entity,reload){
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
      await saveCoreEntity(domain,{...(isEdit?{id:entity.id,version:entity.version}:{}),title:title.value.trim(),status:status.value.trim(),parentId:parent.value.trim()||null,payload:safeJSON(payload.value,{})});
      toast("Enregistré dans Workspace");close();await loadWorkspace();await reload();
    }catch(error){toast(errorMessage(error),"error",5500)}
  }}]});
}
function specializedForm(kind,entity,reload){
  const definition=catalogKind(kind)||{};
  const isEdit=Boolean(entity?.id);
  const title=input(entity?.title||"",{required:true,placeholder:"Titre"});
  const status=select(entity?.status||definition.statuses?.[0]||"active",statusOptions(kind));
  const data={...(entity?.data||{})};
  const requiredInputs=(definition.required||[]).map(key=>{
    const existing=data[key];
    const control=input(existing==null?"":String(existing),{placeholder:pretty(key),required:true});
    return{key,control,node:field(pretty(key),control,"Champ requis par ce domaine métier.")};
  });
  const advanced=jsonEditor(data,"data");
  const content=h("div",{class:"form"},field("Titre",title),field("Statut",status),...requiredInputs.map(item=>item.node),advancedEditor("Champs métier avancés",advanced));
  modal({title:`${isEdit?"Modifier":"Créer"} · ${pretty(kind)}`,content,wide:true,actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{
    try{
      const finalData=safeJSON(advanced.value,{});
      for(const {key,control} of requiredInputs){const raw=control.value.trim();if(raw)finalData[key]=raw}
      for(const key of ["title","name","legalName","subject"])if(key in finalData)finalData[key]=title.value.trim();
      for(const key of ["state","lifecycle","status"])if(key in finalData)finalData[key]=status.value;
      await saveSpecialized(kind,{...(isEdit?{id:entity.id,version:entity.version}:{}),title:title.value.trim(),status:status.value,data:finalData});
      toast("Donnée métier enregistrée");close();await reload();
    }catch(error){toast(errorMessage(error),"error",5500)}
  }}]});
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
  let query="";
  const host=h("div");
  const redraw=()=>{
    const q=query.trim().toLowerCase();
    const filtered=items.filter(value=>`${value.title||""} ${value.status||""} ${JSON.stringify(value.data||value.payload||{})}`.toLowerCase().includes(q));
    host.replaceChildren(
      toolbar(query,value=>{query=value;redraw()},writable?[button("Nouveau",{kind:"primary",iconName:"add",onClick:()=>specialized?specializedForm(kind,null,reload):coreForm(kind,null,reload)})]:[]),
      filtered.length?h("div",{class:"list"},...filtered.map(item=>row({
        title:item.title||"Sans titre",
        subtitle:`${pretty(kind)} · v${item.version||1}`,
        status:item.status,
        meta:formatDate(item.updatedAt||item.updated_at),
        actions:[
          writable?button("Modifier",{small:true,iconName:"edit",onClick:()=>specialized?specializedForm(kind,item,reload):coreForm(kind,item,reload)}):null,
          !specialized&&fileKind(kind)?button("Fichier",{small:true,iconName:"upload",onClick:()=>attachFile(kind,item)}):null,
          writable?button("Archiver",{small:true,kind:"ghost",iconName:"archive",onClick:()=>archiveAction({kind,item,specialized,reload})}):null
        ].filter(Boolean)
      }))):emptyState(q?"Aucun résultat":"Aucun élément",q?"Aucun élément ne correspond à cette recherche.":`Aucune donnée n’est disponible pour ${pretty(kind)}.`)
    );
  };
  redraw();return host;
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
    return h("div",{class:"stack"},
      h("div",{class:"grid two"},...entries.slice(0,8).map(([key,val])=>card(pretty(key),"",h("div",{class:"stat-value",text:Array.isArray(val)?String(val.length):(typeof val==="object"?"Disponible":String(val??"—"))}))),
      advancedEditor("Voir les données techniques",h("pre",{class:"json-view",text:JSON.stringify(value,null,2)}))
    );
  }
  return h("div",{class:"card-title",text:String(value)});
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

    if(core){
      const items=await listCoreDomain(core);let panel;
      const reload=async()=>{const next=await listCoreDomain(core);panel.querySelector(".domain-slot")?.replaceChildren(renderDomainList({kind:core,items:next,writable:true,reload,specialized:false}))};
      const slot=h("div",{class:"domain-slot"},renderDomainList({kind:core,items,writable:true,reload,specialized:false}));
      panel=card(pretty(core),`${items.length} élément${items.length>1?"s":""} synchronisé${items.length>1?"s":""} avec Workspace.`,slot,{iconName:sectionKey});body.append(panel);
    }

    for(const kind of kinds){
      const definition=catalogKind(kind),items=await listSpecialized(kind);let panel;
      const reload=async()=>{const next=await listSpecialized(kind);panel.querySelector(".domain-slot")?.replaceChildren(renderDomainList({kind,items:next,writable:Boolean(definition?.writable),reload,specialized:true}))};
      const slot=h("div",{class:"domain-slot"},renderDomainList({kind,items,writable:Boolean(definition?.writable),reload,specialized:true}));
      panel=card(pretty(kind),`${items.length} enregistrement${items.length>1?"s":""} · ${definition?.writable?"modifiable":"lecture seule"}.`,slot,{iconName:"grid"});body.append(panel);
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
