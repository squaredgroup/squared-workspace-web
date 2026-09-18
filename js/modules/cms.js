import { cmsCollections, cmsItems, saveCMSItem, deleteCMSItem } from "../api.js";
import { h,pageHeader,card,row,button,toolbar,modal,field,input,textarea,select,toast,errorMessage,emptyState,pretty } from "../ui.js";
import { SECTIONS, SECTION_DESCRIPTIONS } from "../config.js";

const sectionHints={siteServices:["service"],siteProducts:["product","produit"],siteReferences:["reference","référence","project"],siteReleases:["release","version","product"],siteTraining:["training","course","lesson","module","program","build"],sitePublications:["publication","blog","news","article"],siteMedia:["media","image","asset"],siteHelp:["help","faq","support","article"],siteInbox:["inbox","request","contact","lead"],siteSystem:[]};
function valueLabel(item){const d=item.data||{};return d.title||d.name||d.label||d.slug||d.email||item.id}
function fieldInput(meta,value){
  if(meta.type==="BOOLEAN") return h("input",{type:"checkbox",checked:Boolean(value)});
  if(["NUMBER","DECIMAL"].includes(meta.type)) return input(value??"",{type:"number"});
  if(["RICH_TEXT","TEXT","URL","DATE","DATETIME"].includes(meta.type)&&String(value??"").length>120) return textarea(value??"");
  return input(Array.isArray(value)?value.join(", "):(value??""),{type:meta.type==="URL"?"url":"text"});
}
function readValue(meta,el){if(meta.type==="BOOLEAN")return el.checked;if(["NUMBER","DECIMAL"].includes(meta.type))return el.value===""?null:Number(el.value);if(meta.type==="MULTI_REFERENCE")return el.value.split(",").map(v=>v.trim()).filter(Boolean);return el.value}
function editor(collection,item,reload){
  const writable=collection.collectionType==="NATIVE";
  const fields=collection.fields.filter(x=>!x.systemField&&!x.readOnly);
  const controls=fields.map(meta=>({meta,el:fieldInput(meta,item?.data?.[meta.key])}));
  const content=h("div",{class:"form"},...controls.map(({meta,el})=>field(`${meta.displayName||pretty(meta.key)} · ${meta.type}`,el)));
  modal({title:`${item?"Modifier":"Créer"} · ${collection.displayName}`,content,wide:true,actions:writable?[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{try{const data={},references={};for(const {meta,el} of controls){const value=readValue(meta,el);if(meta.type==="MULTI_REFERENCE")references[meta.key]=value;else data[meta.key]=value}await saveCMSItem(collection.id,item?.id||null,{data,references});toast("Wix CMS synchronisé");close();reload()}catch(e){toast(errorMessage(e),"error",6000)}}}]:[]});
}

export async function renderCMS(sectionKey){
  const section=SECTIONS[sectionKey];const root=h("div");root.append(pageHeader({eyebrow:"Wix CMS",title:section.title,subtitle:SECTION_DESCRIPTIONS[sectionKey]||"Éditeur CMS synchronisé avec le site Squared Group."}));
  let data;try{data=await cmsCollections()}catch(e){root.append(emptyState("CMS indisponible",errorMessage(e),"warning"));return root}
  const hints=sectionHints[sectionKey]||[];let collections=data.collections||[];
  const matched=hints.length?collections.filter(c=>hints.some(h=>`${c.displayName} ${c.id}`.toLowerCase().includes(h))):collections;
  if(matched.length) collections=matched;
  if(!collections.length){root.append(emptyState("Aucune collection","Aucune collection Wix correspondante n’est disponible."));return root}
  const picker=select(collections[0].id,collections.map(c=>({value:c.id,label:`${c.displayName} · ${c.itemCount??0}`})));
  const host=h("div"); root.append(card("Collection",`${collections.length} collection${collections.length>1?"s":""} accessible${collections.length>1?"s":""}.`,h("div",{class:"form-row"},field("Collection Wix",picker),h("div",{})),{iconName:"grid"}),host);
  const render=async()=>{
    const collection=collections.find(c=>c.id===picker.value)||collections[0];host.replaceChildren(h("div",{class:"skeleton",style:{height:"180px"}}));
    try{let offset=0,items=[],page;do{page=await cmsItems(collection.id,100,offset);items.push(...(page.items||[]));offset+=page.items?.length||0}while(page?.hasNext&&offset<5000);
      let query="";const slot=h("div");const redraw=()=>{const filtered=items.filter(x=>JSON.stringify(x.data||{}).toLowerCase().includes(query.toLowerCase()));slot.replaceChildren(toolbar(query,v=>{query=v;redraw()},collection.collectionType==="NATIVE"?[button("Nouvel élément",{kind:"primary",iconName:"add",onClick:()=>editor(collection,null,render)})]:[]),filtered.length?h("div",{class:"list"},...filtered.map(item=>row({title:valueLabel(item),subtitle:item.id,status:collection.collectionType==="NATIVE"?"modifiable":"lecture seule",meta:Object.keys(item.data||{}).length+" champs",actions:[button("Ouvrir",{small:true,iconName:"edit",onClick:()=>editor(collection,item,render)}),collection.collectionType==="NATIVE"?button("Supprimer",{small:true,kind:"ghost",iconName:"trash",onClick:async()=>{if(!confirm("Supprimer cet élément Wix ?"))return;try{await deleteCMSItem(collection.id,item.id);toast("Élément supprimé");render()}catch(e){toast(errorMessage(e),"error")}}}):null].filter(Boolean)}))):emptyState("Collection vide","Aucun élément dans cette collection."));};redraw();host.replaceChildren(card(collection.displayName,`${page?.totalCount??items.length} élément${items.length>1?"s":""} · ${collection.collectionType}.`,slot,{iconName:"document"}));
    }catch(e){host.replaceChildren(emptyState("Impossible de charger la collection",errorMessage(e),"warning"))}
  };
  picker.addEventListener("change",render);await render();return root;
}
