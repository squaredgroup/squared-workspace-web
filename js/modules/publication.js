import { listCoreDomain, getProjectPublication, saveProjectPublication, projectPublicationCommand } from "../api.js";
import { h,pageHeader,card,row,button,modal,field,input,textarea,toast,errorMessage,emptyState,badge } from "../ui.js";

function csv(value){return Array.isArray(value)?value.join(", "):""} function list(value){return value.split(",").map(x=>x.trim()).filter(Boolean)}
async function edit(project,publication,reload){
  const fields={slug:input(publication?.slug||project.title?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||""),excerpt:textarea(publication?.excerpt||"",{}),caseStudy:textarea(publication?.caseStudy||"",{}),projectType:input(publication?.projectType||""),tools:input(csv(publication?.tools)),tags:input(csv(publication?.tags)),websiteUrl:input(publication?.websiteUrl||"",{type:"url"}),imageUrl:input(publication?.imageUrl||"",{type:"url"}),seoTitle:input(publication?.seoTitle||""),seoDescription:textarea(publication?.seoDescription||"",{})};
  const featured=h("input",{type:"checkbox",checked:Boolean(publication?.featured)});
  const content=h("div",{class:"form"},field("Slug",fields.slug),field("Résumé",fields.excerpt),field("Étude de cas",fields.caseStudy),h("div",{class:"form-row"},field("Type de projet",fields.projectType),field("Outils",fields.tools)),field("Tags",fields.tags),h("div",{class:"form-row"},field("URL du projet",fields.websiteUrl),field("Image publique",fields.imageUrl)),field("Titre SEO",fields.seoTitle),field("Description SEO",fields.seoDescription),field("Mettre en avant",featured));
  modal({title:`Publication · ${project.title}`,content,wide:true,actions:[{label:"Enregistrer",kind:"primary",onClick:async close=>{try{await saveProjectPublication(project.id,{slug:fields.slug.value.trim(),excerpt:fields.excerpt.value.trim(),caseStudy:fields.caseStudy.value,projectType:fields.projectType.value.trim(),tools:list(fields.tools.value),tags:list(fields.tags.value),websiteUrl:fields.websiteUrl.value.trim()||null,imageUrl:fields.imageUrl.value.trim()||null,seoTitle:fields.seoTitle.value.trim(),seoDescription:fields.seoDescription.value.trim(),featured:featured.checked});toast("Publication enregistrée");close();reload()}catch(e){toast(errorMessage(e),"error",6000)}}}]});
}
export async function renderPublication(){
  const root=h("div");root.append(pageHeader({eyebrow:"Projets",title:"Publication",subtitle:"Préparez, publiez et resynchronisez les études de cas Squared Group avec Wix."}));
  const projects=await listCoreDomain("projects"); const listHost=h("div",{class:"list"}); root.append(card("Projets publiables",`${projects.length} projet${projects.length>1?"s":""} disponible${projects.length>1?"s":""}.`,listHost,{iconName:"globe"}));
  const reload=()=>renderPublication().then(next=>root.replaceWith(next));
  if(!projects.length){listHost.append(emptyState("Aucun projet","Créez d’abord un projet Workspace."));return root}
  for(const project of projects){
    let publication=null;try{publication=await getProjectPublication(project.id)}catch(e){if(e.status!==404) publication={state:"error",lastError:errorMessage(e)}}
    listHost.append(row({title:project.title,subtitle:publication?.publicUrl||publication?.lastError||"Publication non configurée",status:publication?.state||"draft",meta:publication?.lastSyncedAt?new Date(publication.lastSyncedAt).toLocaleString("fr-FR"):"",actions:[button("Éditer",{small:true,iconName:"edit",onClick:()=>edit(project,publication,reload)}),button(publication?.state==="published"?"Resync":"Publier",{small:true,kind:"primary",iconName:"globe",onClick:async()=>{try{await projectPublicationCommand(project.id,publication?.state==="published"?"resync":"publish");toast("Commande de publication envoyée");reload()}catch(e){toast(errorMessage(e),"error")}}}),publication?.state==="published"?button("Retirer",{small:true,kind:"ghost",onClick:async()=>{try{await projectPublicationCommand(project.id,"unpublish");toast("Projet retiré du site");reload()}catch(e){toast(errorMessage(e),"error")}}}):null].filter(Boolean)}));
  }
  return root;
}
