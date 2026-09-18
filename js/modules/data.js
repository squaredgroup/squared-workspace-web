import { CORE_DOMAIN_BY_SECTION, SPECIALIZED_BY_SECTION, SUBPAGE_DOMAIN_HINTS, SECTIONS, SECTION_DESCRIPTIONS } from "../config.js";
import { state } from "../store.js";
import { listCoreDomain, saveCoreEntity, archiveCoreEntity, listSpecialized, saveSpecialized, archiveSpecialized, uploadFile, loadWorkspace, loadDomainCatalog } from "../api.js";
import { h, pageHeader, toolbar, row, button, modal, field, input, select, jsonEditor, safeJSON, emptyState, skeletonPage, toast, errorMessage, card, pretty, formatDate } from "../ui.js";

function routeKinds(sectionKey, subpage) {
  const hinted = SUBPAGE_DOMAIN_HINTS[`${sectionKey}:${subpage}`];
  if (hinted?.length) return hinted;
  return SPECIALIZED_BY_SECTION[sectionKey] || [];
}

function catalogKind(kind) { return state.domainCatalog?.kinds?.find(value => value.kind === kind); }
function fileKind(domain) { return ({documents:"document",deliverables:"deliverable",contracts:"contract"})[domain] || null; }
function statusOptions(kind, fallback="active") {
  const values = catalogKind(kind)?.statuses || [];
  return values.length ? values : [fallback,"active","draft","pending","completed","archived"];
}

function coreForm(domain, entity, reload) {
  const isEdit = Boolean(entity?.id);
  const title = input(entity?.title || "", { required:true, placeholder:"Titre" });
  const status = input(entity?.status || "active", { required:true, placeholder:"Statut" });
  const parent = input(entity?.parent_id || entity?.parentId || "", { placeholder:"UUID parent (optionnel)" });
  const payload = jsonEditor(entity?.payload || {}, "payload");
  const content = h("div",{class:"form"}, field("Titre",title), h("div",{class:"form-row"},field("Statut",status),field("Parent",parent)), field("Données métier (JSON)",payload));
  modal({title:`${isEdit?"Modifier":"Créer"} · ${pretty(domain)}`,content,actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{
    try {
      await saveCoreEntity(domain,{...(isEdit?{id:entity.id,version:entity.version}:{}),title:title.value.trim(),status:status.value.trim(),parentId:parent.value.trim()||null,payload:safeJSON(payload.value,{})});
      toast("Enregistré dans Workspace"); close(); await loadWorkspace(); await reload();
    } catch(error){ toast(errorMessage(error),"error",5500); }
  }}]});
}

function specializedForm(kind, entity, reload) {
  const definition = catalogKind(kind) || {};
  const isEdit = Boolean(entity?.id);
  const title = input(entity?.title || "",{required:true});
  const status = select(entity?.status || definition.statuses?.[0] || "active", statusOptions(kind));
  const data = {...(entity?.data||{})};
  const requiredInputs = (definition.required||[]).map(key=>{
    const existing=data[key];
    const element=input(existing==null?"":String(existing),{placeholder:key});
    return {key,element,node:field(`${pretty(key)} · requis`,element)};
  });
  const advanced = jsonEditor(data,"data");
  const content=h("div",{class:"form"},field("Titre",title),field("Statut",status),...requiredInputs.map(x=>x.node),field("Données métier complètes (JSON)",advanced));
  modal({title:`${isEdit?"Modifier":"Créer"} · ${pretty(kind)}`,content,wide:true,actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{
    try{
      const finalData=safeJSON(advanced.value,{});
      for(const {key,element} of requiredInputs){
        const raw=element.value.trim(); if(raw) finalData[key]=raw;
      }
      for(const key of ["title","name","legalName","subject"]){ if(key in finalData) finalData[key]=title.value.trim(); }
      for(const key of ["state","lifecycle","status"]){ if(key in finalData) finalData[key]=status.value; }
      await saveSpecialized(kind,{...(isEdit?{id:entity.id,version:entity.version}:{}),title:title.value.trim(),status:status.value,data:finalData});
      toast("Donnée métier enregistrée"); close(); await reload();
    }catch(error){toast(errorMessage(error),"error",5500)}
  }}]});
}

async function attachFile(domain, entity) {
  const kind=fileKind(domain); if(!kind) return;
  const picker=h("input",{type:"file"}); picker.click();
  picker.addEventListener("change",async()=>{
    const file=picker.files?.[0]; if(!file)return;
    try{toast("Téléversement et analyse antivirus…"); await uploadFile(file,kind,entity.id); toast("Fichier ajouté");}
    catch(error){toast(errorMessage(error),"error",6000)}
  },{once:true});
}

function renderDomainList({kind,items,writable,reload,specialized=false}) {
  let query="";
  const host=h("div");
  const redraw=()=>{
    const filtered=items.filter(value=>`${value.title||""} ${value.status||""}`.toLowerCase().includes(query.toLowerCase()));
    host.replaceChildren(
      toolbar(query,value=>{query=value;redraw()},writable?[button("Nouveau",{kind:"primary",iconName:"add",onClick:()=>specialized?specializedForm(kind,null,reload):coreForm(kind,null,reload)})]:[]),
      filtered.length?h("div",{class:"list"},...filtered.map(item=>row({title:item.title,subtitle:specialized?`${pretty(kind)} · v${item.version}`:`${pretty(kind)} · v${item.version}`,status:item.status,meta:formatDate(item.updatedAt||item.updated_at),actions:[
        writable?button("Modifier",{small:true,iconName:"edit",onClick:()=>specialized?specializedForm(kind,item,reload):coreForm(kind,item,reload)}):null,
        !specialized&&fileKind(kind)?button("Fichier",{small:true,iconName:"upload",onClick:()=>attachFile(kind,item)}):null,
        writable?button("Archiver",{small:true,kind:"ghost",iconName:"archive",onClick:async()=>{if(!confirm(`Archiver « ${item.title} » ?`))return;try{specialized?await archiveSpecialized(kind,item.id,item.version):await archiveCoreEntity(kind,item.id);toast("Élément archivé");await reload()}catch(error){toast(errorMessage(error),"error")}}}):null
      ].filter(Boolean)}))):emptyState("Aucun élément",`Aucune donnée n’est disponible pour ${pretty(kind)}.`)
    );
  }; redraw(); return host;
}

export async function renderDataSection(sectionKey, subpage="") {
  const section=SECTIONS[sectionKey]; const root=h("div");
  root.append(pageHeader({eyebrow:section?.group||"Workspace",title:section?.title||pretty(sectionKey),subtitle:SECTION_DESCRIPTIONS[sectionKey]||"Données synchronisées avec Squared Workspace."}),skeletonPage());
  try{
    if(!state.workspace) await loadWorkspace();
    if(!state.domainCatalog) await loadDomainCatalog().catch(()=>null);
    const core=CORE_DOMAIN_BY_SECTION[sectionKey];
    const kinds=routeKinds(sectionKey,subpage).filter(kind=>catalogKind(kind));
    const body=h("div",{class:"grid"});
    root.lastChild.remove();
    const renderCore=async()=>{
      const items=await listCoreDomain(core);
      const reload=async()=>{const next=await listCoreDomain(core); panel.replaceChildren(renderDomainList({kind:core,items:next,writable:true,reload,specialized:false}))};
      const panel=card(pretty(core),`${items.length} élément${items.length>1?"s":""} synchronisé${items.length>1?"s":""}.`,renderDomainList({kind:core,items,writable:true,reload,specialized:false}),{iconName:"folder"});
      body.append(panel);
    };
    if(core) await renderCore();
    for(const kind of kinds){
      const definition=catalogKind(kind); const items=await listSpecialized(kind);
      let panel;
      const reload=async()=>{const next=await listSpecialized(kind);panel.querySelector(".domain-slot")?.replaceChildren(renderDomainList({kind,items:next,writable:definition?.writable,reload,specialized:true}))};
      const slot=h("div",{class:"domain-slot"},renderDomainList({kind,items,writable:definition?.writable,reload,specialized:true}));
      panel=card(pretty(kind),`${items.length} enregistrement${items.length>1?"s":""} · ${definition?.writable?"lecture/écriture":"lecture seule"}.`,slot,{iconName:"grid"});body.append(panel);
    }
    if(!core&&!kinds.length){
      const workspaceValue=state.workspace?.[sectionKey] ?? state.workspace?.enterprise?.[sectionKey] ?? state.workspace?.intelligence?.[sectionKey];
      body.append(card(section?.title||pretty(sectionKey),"Données présentes dans le snapshot Workspace.",workspaceValue?h("pre",{class:"json-view",text:JSON.stringify(workspaceValue,null,2)}):emptyState("Module prêt", "Cette zone utilise des données ou intégrations spécifiques qui ne sont pas exposées comme domaine générique."),{iconName:sectionKey}));
    }
    root.append(body);
  }catch(error){root.replaceChildren(pageHeader({eyebrow:"Erreur",title:section?.title||pretty(sectionKey),subtitle:errorMessage(error)}),emptyState("Impossible de charger ce module",errorMessage(error),"warning"));}
  return root;
}
