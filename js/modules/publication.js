import { listCoreDomain,getProjectPublication,saveProjectPublication,projectPublicationCommand } from "../api.js";
import { h,pageHeader,card,row,button,modal,field,input,textarea,toast,errorMessage,emptyState,confirmAction } from "../ui.js";

const csv=value=>Array.isArray(value)?value.join(", "):"";
const list=value=>value.split(",").map(x=>x.trim()).filter(Boolean);
async function edit(project,publication,reload){
  const fields={
    slug:input(publication?.slug||project.title?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||""),
    excerpt:textarea(publication?.excerpt||"",{}),caseStudy:textarea(publication?.caseStudy||"",{}),projectType:input(publication?.projectType||""),
    tools:input(csv(publication?.tools)),tags:input(csv(publication?.tags)),websiteUrl:input(publication?.websiteUrl||"",{type:"url"}),imageUrl:input(publication?.imageUrl||"",{type:"url"}),
    seoTitle:input(publication?.seoTitle||""),seoDescription:textarea(publication?.seoDescription||"",{})
  };
  const featured=h("input",{type:"checkbox",checked:Boolean(publication?.featured)});
  const content=h("div",{class:"form"},
    field("Slug",fields.slug,"Identifiant public de l’étude de cas."),
    field("Résumé",fields.excerpt),field("Étude de cas",fields.caseStudy),
    h("div",{class:"form-row"},field("Type de projet",fields.projectType),field("Outils",fields.tools,"Séparez les valeurs par des virgules.")),
    field("Tags",fields.tags,"Séparez les valeurs par des virgules."),
    h("div",{class:"form-row"},field("URL du projet",fields.websiteUrl),field("Image publique",fields.imageUrl)),
    field("Titre SEO",fields.seoTitle),field("Description SEO",fields.seoDescription),field("Mettre en avant",featured)
  );
  modal({title:`Publication · ${project.title}`,content,wide:true,actions:[{label:"Enregistrer",kind:"primary",icon:"check",onClick:async close=>{
    try{
      await saveProjectPublication(project.id,{slug:fields.slug.value.trim(),excerpt:fields.excerpt.value.trim(),caseStudy:fields.caseStudy.value,projectType:fields.projectType.value.trim(),tools:list(fields.tools.value),tags:list(fields.tags.value),websiteUrl:fields.websiteUrl.value.trim()||null,imageUrl:fields.imageUrl.value.trim()||null,seoTitle:fields.seoTitle.value.trim(),seoDescription:fields.seoDescription.value.trim(),featured:featured.checked});
      toast("Publication enregistrée");close();await reload();
    }catch(error){toast(errorMessage(error),"error",6000)}
  }}]});
}
export async function renderPublication(){
  const root=h("div");root.append(pageHeader({eyebrow:"Projets",title:"Publication",subtitle:"Préparez et synchronisez les études de cas Squared Group avec le site public."}));
  const projects=await listCoreDomain("projects"),listHost=h("div",{class:"list"});
  root.append(card("Projets publiables",`${projects.length} projet${projects.length>1?"s":""} disponible${projects.length>1?"s":""}.`,listHost,{iconName:"globe"}));
  const reload=async()=>{const next=await renderPublication();root.replaceWith(next)};
  if(!projects.length){listHost.append(emptyState("Aucun projet","Créez d’abord un projet Workspace."));return root}
  for(const project of projects){
    let publication=null;try{publication=await getProjectPublication(project.id)}catch(error){if(error.status!==404)publication={state:"error",lastError:errorMessage(error)}}
    const published=publication?.state==="published";
    listHost.append(row({
      title:project.title,
      subtitle:publication?.publicUrl||publication?.lastError||"Publication non configurée",
      status:publication?.state||"draft",
      meta:publication?.lastSyncedAt?new Date(publication.lastSyncedAt).toLocaleString("fr-FR"):"",
      actions:[
        button("Éditer",{small:true,iconName:"edit",onClick:()=>edit(project,publication,reload)}),
        button(published?"Resynchroniser":"Publier",{small:true,kind:"primary",iconName:"globe",onClick:async()=>{try{await projectPublicationCommand(project.id,published?"resync":"publish");toast(published?"Resynchronisation lancée":"Publication lancée");await reload()}catch(error){toast(errorMessage(error),"error")}}}),
        published?button("Retirer",{small:true,kind:"ghost",iconName:"archive",onClick:()=>confirmAction({title:"Retirer ce projet du site ?",message:"Le projet restera dans Workspace mais ne sera plus publié sur le site public.",confirmLabel:"Retirer",danger:true,onConfirm:async()=>{try{await projectPublicationCommand(project.id,"unpublish");toast("Projet retiré du site");await reload()}catch(error){toast(errorMessage(error),"error")}}})}):null
      ].filter(Boolean)
    }));
  }
  return root;
}
