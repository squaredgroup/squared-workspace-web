import { state, setRoute } from "../store.js";
import { cmsStudioSites, cmsStudioWorkspace, cmsStudioEntries, saveCMSStudioEntry, cmsStudioEntryAction, cmsStudioEntryHistory, addCMSStudioComment, cmsStudioAssets, cmsStudioPreview, saveCMSStudioConfiguration, uploadFile, attachCMSStudioAsset, fetchCMSStudioAssetBlob } from "../api.js";
import { h, pageHeader, card, button, icon, field, input, textarea, select, badge, emptyState, modal, toast, errorMessage, validateControls } from "../ui.js";

const TABS = [
  ["overview", "Vue d’ensemble", "grid"], ["contents", "Contenus", "document"],
  ["pages", "Pages et navigation", "folder"], ["media", "Médias", "image"],
  ["publications", "Publications", "calendar"], ["settings", "Réglages", "settings"]
];
const PHASES = { CONNECTED:"Connecté", DRAFT:"Brouillon", REVIEW:"À relire", APPROVED:"Approuvé", SCHEDULED:"Programmé", PUBLISHING:"Publication en cours", PUBLISHED:"Publié", ARCHIVED:"Archivé", TRASH:"Corbeille", FAILED:"À reprendre" };
const PAGE_COLLECTIONS = new Set(["pages", "navigation", "BuildPageSections", "BuildSettings"]);
const valueText = value => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const entryTitle = (entry, collection) => [collection?.displayField,"title","name","projectName","question","email"].filter(Boolean).map(key=>valueText(entry?.data?.[key]).trim()).find(Boolean) || "Sans titre";
const statusBadge = phase => badge(PHASES[phase] || "Contenu connecté", ["FAILED","TRASH"].includes(phase) ? "danger" : ["REVIEW","SCHEDULED"].includes(phase) ? "warning" : phase === "PUBLISHED" ? "success" : "neutral");
const dateLabel = value => value ? new Date(value).toLocaleString("fr-FR", { dateStyle:"medium", timeStyle:"short" }) : "—";
const canEditField = meta => !meta.systemField && !meta.readOnly;

function tabBar(active){
  return h("nav",{class:"cms-studio-tabs","aria-label":"Studio de contenus"},...TABS.map(([id,title,iconName])=>h("button",{type:"button",class:active===id?"active":"","aria-current":active===id?"page":null,onClick:()=>setRoute("webContent",id)},icon(iconName,16),h("span",{text:title}))));
}

function collectionSelect(collections, selectedID, onChange){
  const control=select(selectedID,collections.map(item=>({value:item.id,label:`${item.displayName} · ${item.itemCount ?? 0}`})));
  control.addEventListener("change",()=>onChange(control.value));return control;
}

function fieldControl(meta, value){
  if(meta.type==="BOOLEAN")return h("input",{type:"checkbox",checked:Boolean(value)});
  if(["NUMBER","DECIMAL"].includes(meta.type))return input(value??"",{type:"number"});
  if(meta.type==="DATE")return input(valueText(value).slice(0,10),{type:"date"});
  if(meta.type==="DATETIME")return input(valueText(value).slice(0,16),{type:"datetime-local"});
  if(["RICH_TEXT","RICH_CONTENT","OBJECT","ADDRESS","MEDIA_GALLERY"].includes(meta.type)||valueText(value).length>120)return textarea(valueText(value));
  return input(Array.isArray(value)?value.join(", "):valueText(value),{type:meta.type==="URL"?"url":"text"});
}

function readControl(meta, control){
  if(meta.type==="BOOLEAN")return control.checked;
  if(["NUMBER","DECIMAL"].includes(meta.type))return control.value===""?null:Number(control.value);
  if(["ARRAY_STRING","MULTI_REFERENCE"].includes(meta.type))return control.value.split(",").map(item=>item.trim()).filter(Boolean);
  if(["OBJECT","ADDRESS","MEDIA_GALLERY","RICH_CONTENT"].includes(meta.type)){
    if(!control.value.trim())return meta.type==="OBJECT"||meta.type==="ADDRESS"?{}:[];
    try{return JSON.parse(control.value)}catch{throw new Error(`Le champ « ${meta.displayName} » doit contenir un JSON valide.`)}
  }
  return control.value;
}

function newEntry(site, collection, locale){
  const data={};for(const meta of collection.fields||[]){if(!canEditField(meta))continue;data[meta.key]=meta.type==="BOOLEAN"?meta.key==="visible":["NUMBER","DECIMAL"].includes(meta.type)?0:["ARRAY_STRING","MULTI_REFERENCE","MEDIA_GALLERY","RICH_CONTENT"].includes(meta.type)?[]:["OBJECT","ADDRESS"].includes(meta.type)?{}:""}
  if((collection.fields||[]).some(meta=>meta.key==="status"))data.status="DRAFT";
  return {id:crypto.randomUUID(),siteID:site.id,collectionID:collection.id,sourceID:null,baseToken:null,revision:0,phase:"DRAFT",data,references:{},ownerID:null,dueAt:null,scheduledAt:null,locale:locale||"fr"};
}

function editEntry(entry, collection, capabilities, reload){
  const draft=structuredClone(entry),controls=(collection.fields||[]).filter(canEditField).map(meta=>({meta,control:fieldControl(meta,draft.data?.[meta.key])}));
  for(const item of controls)if(item.meta.required)item.control.required=true;
  const locale=input(draft.locale||"fr",{required:true,maxLength:35}),due=input(draft.dueAt?.slice(0,16)||"",{type:"datetime-local"});
  const form=h("div",{class:"form cms-editor-form"},h("div",{class:"form-row"},field("Langue",locale),field("Échéance éditoriale",due)),...controls.map(({meta,control})=>field(meta.displayName||meta.key,control,`${meta.type}${meta.required?" · requis":""}`)));
  modal({title:`${draft.revision?"Modifier":"Créer"} · ${collection.displayName}`,content:form,wide:true,actions:[{label:"Enregistrer le brouillon",kind:"primary",icon:"check",onClick:async close=>{
    try{
      if(!validateControls(locale,...controls.map(item=>item.control)))return;
      for(const {meta,control} of controls){const value=readControl(meta,control);if(meta.type==="MULTI_REFERENCE")draft.references[meta.key]=value;else draft.data[meta.key]=value}
      draft.locale=locale.value.trim();draft.dueAt=due.value?new Date(due.value).toISOString():null;
      await saveCMSStudioEntry(draft);toast("Brouillon enregistré");close();await reload();
    }catch(error){toast(errorMessage(error),"error",7000)}
  }}]});
}

async function previewEntry(entry){
  try{
    const result=await cmsStudioPreview(entry),frame=h("iframe",{class:"cms-content-preview",title:`Aperçu de ${entryTitle(entry)}`,sandbox:"",srcdoc:result.previewHTML||""});
    modal({title:"Aperçu privé",content:h("div",{class:"stack"},h("p",{class:"page-subtitle",text:"Cet aperçu rend le contenu. L’habillage final dépend du site public connecté."}),frame),wide:true});
  }catch(error){toast(errorMessage(error),"error")}
}

async function historyDialog(entry){
  try{
    const result=await cmsStudioEntryHistory(entry.id),versions=result.versions||[],comments=result.comments||[];
    const note=textarea("",{placeholder:"Ajouter un commentaire éditorial…",maxLength:5000});
    const commentsHost=h("div",{class:"setting-list"},...comments.map(comment=>h("div",{class:"setting-row"},h("div",{},h("strong",{text:comment.author||"Membre"}),h("span",{text:`${comment.body} · ${dateLabel(comment.createdAt)}`})))));
    modal({title:`Historique · ${PHASES[entry.phase]||entry.phase}`,content:h("div",{class:"stack"},h("p",{class:"page-subtitle",text:`${versions.length} version(s) · ${comments.length} commentaire(s)`}),versions.length?h("div",{class:"setting-list"},...versions.map(version=>h("div",{class:"setting-row"},h("div",{},h("strong",{text:`Version ${version.revision} · ${version.action}`}),h("span",{text:`${version.author||"Membre"} · ${dateLabel(version.createdAt)}`}))))):emptyState("Aucun historique","Ce contenu ne possède pas encore de version."),commentsHost,field("Nouveau commentaire",note),button("Ajouter le commentaire",{kind:"primary",iconName:"send",onClick:async()=>{try{if(!note.value.trim())return;const response=await addCMSStudioComment(entry.id,note.value.trim());note.value="";commentsHost.replaceChildren(...(response.comments||[]).map(comment=>h("div",{class:"setting-row"},h("div",{},h("strong",{text:comment.author||"Membre"}),h("span",{text:`${comment.body} · ${dateLabel(comment.createdAt)}`})))));toast("Commentaire ajouté")}catch(error){toast(errorMessage(error),"error")}}}))});
  }catch(error){toast(errorMessage(error),"error")}
}

function contentRow(entry, collection, capabilities, reload){
  const actions=[button("Ouvrir",{small:true,iconName:"edit",onClick:()=>editEntry(entry,collection,capabilities,reload)}),button("Aperçu",{small:true,kind:"ghost",iconName:"eyeOff",onClick:()=>previewEntry(entry)})];
  if(entry.revision>0)actions.push(button("Historique",{small:true,kind:"ghost",iconName:"clock",onClick:()=>historyDialog(entry)}));
  if(capabilities.canPublish&&entry.revision>0&&!["PUBLISHED","PUBLISHING"].includes(entry.phase))actions.push(button("Publier",{small:true,kind:"primary",iconName:"external",onClick:async()=>{try{await cmsStudioEntryAction(entry,"publish");toast("Contenu publié");await reload()}catch(error){toast(errorMessage(error),"error",7000)}}}));
  return h("article",{class:"cms-content-row"},h("div",{class:"cms-content-main"},h("strong",{text:entryTitle(entry,collection)}),h("span",{text:`${collection.displayName} · ${entry.locale?.toUpperCase()||"FR"} · ${dateLabel(entry.updatedAt)}`})),statusBadge(entry.phase),h("div",{class:"row-actions"},...actions));
}

function metric(title,value,detail,kind="neutral"){
  return h("article",{class:`cms-metric ${kind}`},h("span",{text:title}),h("strong",{text:String(value??0)}),h("small",{text:detail}));
}

function assetPreview(asset){
  const host=h("div",{class:"cms-media-preview"},icon(asset.contentType?.includes("pdf")?"document":"image",28));
  if(asset.contentType?.startsWith("image/"))fetchCMSStudioAssetBlob(asset.id).then(blob=>{const url=URL.createObjectURL(blob),image=h("img",{src:url,alt:asset.alternativeText||"",loading:"lazy"});image.addEventListener("load",()=>URL.revokeObjectURL(url),{once:true});host.replaceChildren(image)}).catch(()=>{});
  return host;
}

async function renderMedia(site,capabilities,reload){
  const host=h("div",{class:"cms-media-grid"}),picker=h("input",{type:"file",accept:"image/*,video/*,audio/*,application/pdf",multiple:true,class:"sr-only"}),toolbar=h("div",{class:"cms-media-toolbar"},h("div",{},h("strong",{text:"Médiathèque du site"}),h("span",{text:"Aperçus privés et usages contrôlés par vos droits."})),capabilities.canEdit?button("Importer des médias",{kind:"primary",iconName:"upload",onClick:()=>picker.click()}):null,picker);
  picker.addEventListener("change",async()=>{const files=[...picker.files];if(!files.length)return;try{for(const file of files){const uploaded=await uploadFile(file,"cms_asset",crypto.randomUUID());await attachCMSStudioAsset(site.id,uploaded.id)}toast(`${files.length} média(s) importé(s)`);await reload()}catch(error){toast(errorMessage(error),"error",7000)}});
  try{
    const result=await cmsStudioAssets(site.id),assets=result.assets||[];
    if(!assets.length)return h("div",{class:"stack"},toolbar,emptyState("Aucun média","Importez un premier média dans la bibliothèque privée du site.","image"));
    host.append(...assets.filter(asset=>!asset.isArchived).map(asset=>h("article",{class:"cms-media-card"},assetPreview(asset),h("strong",{text:asset.name}),h("span",{text:[asset.folder,(asset.tags||[]).join(" · ")].filter(Boolean).join(" · ")||"Sans dossier"}),h("small",{text:`${Math.max(1,Math.round((asset.byteCount||0)/1024))} Ko · ${(asset.usages||[]).length} usage(s)`}))));
    return h("div",{class:"stack"},toolbar,host);
  }catch(error){return emptyState("Médias indisponibles",errorMessage(error),"warning")}
}

function settingsPanel(site,workspace,reload){
  const configuration=structuredClone(workspace.configuration||{}),title=input(configuration.title||site.title,{required:true}),url=input(configuration.publicURL||site.publicSiteURL||"",{type:"url",required:true}),preview=input(configuration.previewURL||"",{type:"url"}),locale=input(configuration.defaultLocale||"fr",{required:true}),locales=input((configuration.locales||["fr"]).join(", ")),
    analytics=h("input",{type:"checkbox",checked:Boolean(configuration.analyticsEnabled)});
  return card("Configuration du site","Langues, URLs, accès et mesure d’audience restent contrôlés par les permissions CMS.",h("div",{class:"form"},h("div",{class:"form-row"},field("Nom du site",title),field("Langue par défaut",locale)),field("URL publique",url),field("URL de prévisualisation",preview,"HTTPS uniquement"),field("Langues actives",locales,"Séparées par des virgules"),h("label",{class:"setting-row"},h("div",{},h("strong",{text:"Mesure d’audience agrégée"}),h("span",{text:"Aucun cookie, adresse réseau ou identifiant visiteur n’est conservé."})),analytics),button("Enregistrer les réglages",{kind:"primary",iconName:"check",onClick:async()=>{try{if(!validateControls(title,url,locale))return;const next={...configuration,siteID:site.id,title:title.value.trim(),publicURL:url.value.trim(),previewURL:preview.value.trim(),defaultLocale:locale.value.trim(),locales:locales.value.split(",").map(value=>value.trim()).filter(Boolean),analyticsEnabled:analytics.checked,archived:Boolean(configuration.archived),version:Number(configuration.version||0)};await saveCMSStudioConfiguration(site.id,next);toast("Réglages du site enregistrés");await reload()}catch(error){toast(errorMessage(error),"error",7000)}}}) ),{iconName:"settings"});
}

export async function renderCMSStudio(activeTab="overview"){
  const root=h("div",{class:"cms-studio-page"});
  root.append(pageHeader({eyebrow:"Mes sites",title:"Studio de contenus",subtitle:"Le même espace éditorial que l’app : collections, brouillons, médias, publication et réglages."}),tabBar(activeTab));
  let sitesResult;
  try{sitesResult=await cmsStudioSites()}catch(error){root.append(emptyState("Studio indisponible",errorMessage(error),"warning"));return root}
  const sites=sitesResult.sites||[];if(!sites.length){root.append(emptyState("Aucun site","Aucun site administrable n’est associé à votre compte.","globe"));return root}
  let selectedID=sessionStorage.getItem("sq-cms-site")||sites[0].id;
  if(!sites.some(site=>site.id===selectedID))selectedID=sites[0].id;
  const site=sites.find(value=>value.id===selectedID)||sites[0],picker=collectionSelect(sites.map(value=>({...value,displayName:value.title,itemCount:value.itemCount})),site.id,value=>{sessionStorage.setItem("sq-cms-site",value);setRoute("webContent",activeTab)});
  root.append(h("div",{class:"cms-sitebar"},field("Site",picker),h("div",{class:"cms-site-kind"},icon("globe",16),h("div",{},h("strong",{text:site.editorKind==="WIX_CMS"?"Wix CMS":"CMS Workspace"}),h("span",{text:site.publicSiteURL||"Site privé"})))));
  let workspace;
  try{workspace=await cmsStudioWorkspace(site.id)}catch(error){root.append(emptyState("Site indisponible",errorMessage(error),"warning"));return root}
  const collections=workspace.collections||[],capabilities={canEdit:Boolean(workspace.canEdit),canPublish:Boolean(workspace.canPublish),canAdminister:Boolean(workspace.canAdminister)};
  const reload=async()=>{const page=await renderCMSStudio(activeTab);root.replaceWith(page)};
  if(activeTab==="overview"){
    const entries=workspace.entries||[],metrics=workspace.metrics||{};
    root.append(h("div",{class:"cms-metrics"},metric("Brouillons",entries.filter(e=>e.phase==="DRAFT").length,"À poursuivre"),metric("À relire",entries.filter(e=>e.phase==="REVIEW").length,"Décision attendue","warning"),metric("Programmés",entries.filter(e=>e.phase==="SCHEDULED").length,"Publication future"),metric("À reprendre",entries.filter(e=>e.phase==="FAILED").length,"Action requise","danger")),h("div",{class:"grid two"},card("Reprendre le travail","Derniers dossiers éditoriaux modifiés.",entries.length?h("div",{class:"cms-content-list"},...entries.slice(0,8).map(entry=>contentRow(entry,collections.find(c=>c.id===entry.collectionID)||{displayName:entry.collectionID,fields:[]},capabilities,reload))):emptyState("Aucun brouillon","Créez un contenu depuis une collection."),{iconName:"edit"}),card("Audience sur 30 jours",metrics.collected?"Mesure agrégée, sans suivi individuel.":"La mesure d’audience est désactivée.",h("div",{class:"cms-audience"},metric("Pages vues",metrics.pageViews,"30 derniers jours"),metric("Téléchargements",metrics.downloads,"Contenus publics"),metric("Actions",metrics.actions,"Interactions")),{iconName:"chart"})));
    return root;
  }
  if(activeTab==="media"){root.append(await renderMedia(site,capabilities,reload));return root}
  if(activeTab==="settings"){root.append(settingsPanel(site,workspace,reload));return root}
  const filteredCollections=activeTab==="pages"?collections.filter(c=>PAGE_COLLECTIONS.has(c.id)):collections;
  if(!filteredCollections.length){root.append(emptyState(activeTab==="pages"?"Aucune collection de pages":"Aucune collection",site.editorKind==="WIX_CMS"?"La structure des pages est administrée dans Wix Studio.":"Créez la collection depuis l’app native.","folder"));return root}
  let collectionID=sessionStorage.getItem(`sq-cms-collection:${site.id}`)||filteredCollections[0].id;
  if(!filteredCollections.some(item=>item.id===collectionID))collectionID=filteredCollections[0].id;
  const collection=filteredCollections.find(item=>item.id===collectionID)||filteredCollections[0],controls=h("div",{class:"cms-library-controls"}),results=h("div");
  const collectionPicker=collectionSelect(filteredCollections,collection.id,value=>{sessionStorage.setItem(`sq-cms-collection:${site.id}`,value);setRoute("webContent",activeTab)}),search=input("",{type:"search",placeholder:"Rechercher dans toute la collection…","aria-label":"Rechercher dans la collection"}),phase=select(activeTab==="publications"?"DRAFT":"",[{value:"",label:"Tous les statuts"},...Object.entries(PHASES).filter(([key])=>key!=="CONNECTED").map(([value,label])=>({value,label}))]);
  let timer;
  const load=async()=>{
    results.replaceChildren(h("div",{class:"skeleton",style:{height:"180px"}}));
    try{const response=await cmsStudioEntries(site.id,collection.id,{query:search.value.trim(),phase:phase.value}),entries=response.entries||[];results.replaceChildren(response.searchComplete===false?h("div",{class:"network-banner",role:"status"},icon("warning",15),h("span",{text:"La source connectée a atteint sa limite de lecture. Affinez la recherche."})):h("span"),entries.length?h("div",{class:"cms-content-list"},...entries.map(entry=>contentRow(entry,collection,capabilities,load))):emptyState("Aucun contenu",search.value?"Aucun résultat pour ces critères.":"Cette collection est prête à recevoir un brouillon.","document"),h("p",{class:"muted",text:`${entries.length} affiché(s) sur ${response.totalCount??entries.length}`}));}catch(error){results.replaceChildren(emptyState("Chargement impossible",errorMessage(error),"warning"))}
  };
  search.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(load,250)});phase.addEventListener("change",load);
  controls.append(field("Collection",collectionPicker),search,phase,capabilities.canEdit&&collection.isWritable!==false?button("Nouveau contenu",{kind:"primary",iconName:"add",onClick:()=>editEntry(newEntry(site,collection,workspace.configuration?.defaultLocale),collection,capabilities,load)}):null);
  root.append(controls,results);await load();return root;
}
