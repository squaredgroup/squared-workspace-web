import { cmsCollections,cmsItems,saveCMSItem,deleteCMSItem } from "../api.js";
import { h,pageHeader,card,row,button,toolbar,modal,field,input,textarea,validateControls,toast,errorMessage,emptyState,pretty,confirmAction } from "../ui.js";
import { SECTIONS,SECTION_DESCRIPTIONS } from "../config.js";

const sectionHints={siteServices:["service"],siteProducts:["product","produit"],siteReferences:["reference","référence","project"],siteReleases:["release","version","product"],siteTraining:["training","course","lesson","module","program","build"],sitePublications:["publication","blog","news","article"],siteMedia:["media","image","asset"],siteHelp:["help","faq","support","article"],siteInbox:["inbox","request","contact","lead"],siteSystem:[]};
function valueLabel(item){const d=item.data||{};return d.title||d.name||d.label||d.slug||d.email||item.id}
function fieldInput(meta,value){
  if(meta.type==="BOOLEAN")return h("input",{type:"checkbox",checked:Boolean(value)});
  if(["NUMBER","DECIMAL"].includes(meta.type))return input(value??"",{type:"number"});
  if(["RICH_TEXT","TEXT"].includes(meta.type)&&String(value??"").length>120)return textarea(value??"");
  return input(Array.isArray(value)?value.join(", "):(value??""),{type:meta.type==="URL"?"url":meta.type==="DATE"?"date":"text"});
}
function readValue(meta,element){if(meta.type==="BOOLEAN")return element.checked;if(["NUMBER","DECIMAL"].includes(meta.type))return element.value===""?null:Number(element.value);if(meta.type==="MULTI_REFERENCE")return element.value.split(",").map(v=>v.trim()).filter(Boolean);return element.value}
function editor(collection,item,reload){
  const writable=collection.collectionType==="NATIVE",fields=collection.fields.filter(field=>!field.systemField&&!field.readOnly);
  const controls=fields.map(meta=>{const el=fieldInput(meta,item?.data?.[meta.key]);if(meta.required)el.required=true;return{meta,el}});
  const content=h("div",{class:"form"},...controls.map(({meta,el})=>field(meta.displayName||pretty(meta.key),el,`${meta.type}${meta.required?" · requis":""}`)));
  modal({title:`${item?"Modifier":"Créer"} · ${collection.displayName}`,content,wide:true,actions:writable?[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{
    try{
      if(!validateControls(...controls.map(value=>value.el)))return;
      const data={},references={};
      for(const {meta,el} of controls){const value=readValue(meta,el);if(meta.type==="MULTI_REFERENCE")references[meta.key]=value;else data[meta.key]=value}
      await saveCMSItem(collection.id,item?.id||null,{data,references});toast("Wix CMS synchronisé");close();await reload();
    }catch(error){toast(errorMessage(error),"error",6000)}
  }}]:[]});
}
export async function renderCMS(sectionKey){
  const section=SECTIONS[sectionKey],root=h("div");
  root.append(pageHeader({eyebrow:"Wix CMS",title:section.title,subtitle:SECTION_DESCRIPTIONS[sectionKey]||"Contenu synchronisé avec le site Squared Group."}));
  let data;try{data=await cmsCollections()}catch(error){root.append(emptyState("CMS indisponible",errorMessage(error),"warning"));return root}
  const hints=sectionHints[sectionKey]||[];let collections=data.collections||[];
  const matched=hints.length?collections.filter(collection=>hints.some(hint=>`${collection.displayName} ${collection.id}`.toLowerCase().includes(hint))):collections;if(matched.length)collections=matched;
  if(!collections.length){root.append(emptyState("Aucune collection","Aucune collection Wix correspondante n’est disponible."));return root}
  const picker=document.createElement("select");for(const collection of collections)picker.append(h("option",{value:collection.id,text:`${collection.displayName} · ${collection.itemCount??0}`}));
  const host=h("div");
  root.append(card("Source Wix CMS",`${collections.length} collection${collections.length>1?"s":""} accessible${collections.length>1?"s":""}.`,field("Collection",picker),{iconName:"grid"}),host);
  const render=async()=>{
    const collection=collections.find(c=>c.id===picker.value)||collections[0];host.replaceChildren(h("div",{class:"skeleton",style:{height:"180px"}}));
    try{
      let offset=0,items=[],page;
      do{page=await cmsItems(collection.id,100,offset);items.push(...(page.items||[]));offset+=page.items?.length||0}while(page?.hasNext&&offset<5000);
      let query="";const slot=h("div");
      const redraw=()=>{
        const filtered=items.filter(item=>JSON.stringify(item.data||{}).toLowerCase().includes(query.toLowerCase()));
        slot.replaceChildren(
          toolbar(query,value=>{query=value;redraw()},collection.collectionType==="NATIVE"?[button("Nouvel élément",{kind:"primary",iconName:"add",onClick:()=>editor(collection,null,render)})]:[]),
          filtered.length?h("div",{class:"list"},...filtered.map(item=>row({
            title:valueLabel(item),
            subtitle:collection.displayName,
            status:collection.collectionType==="NATIVE"?"modifiable":"lecture seule",
            meta:`${Object.keys(item.data||{}).length} champs`,
            actions:[
              button(collection.collectionType==="NATIVE"?"Modifier":"Consulter",{small:true,iconName:collection.collectionType==="NATIVE"?"edit":"document",onClick:()=>editor(collection,item,render)}),
              collection.collectionType==="NATIVE"?button("Supprimer",{small:true,kind:"ghost",iconName:"trash",onClick:()=>confirmAction({title:"Supprimer cet élément Wix ?",message:`« ${valueLabel(item)} » sera supprimé de la collection ${collection.displayName}.`,confirmLabel:"Supprimer",danger:true,onConfirm:async()=>{try{await deleteCMSItem(collection.id,item.id);toast("Élément supprimé");await render()}catch(error){toast(errorMessage(error),"error")}}})}):null
            ].filter(Boolean)
          }))):emptyState(query?"Aucun résultat":"Collection vide",query?"Aucun contenu ne correspond à cette recherche.":"Aucun élément dans cette collection.")
        );
      };
      redraw();host.replaceChildren(card(collection.displayName,`${page?.totalCount??items.length} élément${items.length>1?"s":""} · ${collection.collectionType==="NATIVE"?"modifiable":"lecture seule"}.`,slot,{iconName:"document"}));
    }catch(error){host.replaceChildren(emptyState("Impossible de charger la collection",errorMessage(error),"warning"))}
  };
  picker.addEventListener("change",render);await render();return root;
}
