import { state } from "../store.js";
import { h,pageHeader,card,row,formatDate,icon } from "../ui.js";
import { activeAnnouncement,loadWorkspaceWebContent,richContentNode,safePublicURL } from "../public-content.js";

function managedLink(item,label="Ouvrir"){
  const href=safePublicURL(item.downloadURL||item.url);
  return href?h("a",{class:"button ghost small",href,target:"_blank",rel:"noopener noreferrer"},icon(item.downloadURL?"download":"external",14),h("span",{text:label})):null;
}
function managedContent(content){
  const role=String(state.user?.role||"").toLowerCase();
  const announcements=content.announcements.filter(item=>activeAnnouncement(item));
  const onboarding=content.onboarding.filter(item=>!item.audience||String(item.audience).toLowerCase().split(/[,;]+/).map(value=>value.trim()).some(value=>!value||value==="tous"||role.includes(value)));
  const resources=[...content.resources,...content.downloads];
  const releases=content.releases;
  const faqs=content.faqs;
  if(!announcements.length&&!onboarding.length&&!resources.length&&!releases.length&&!faqs.length)return null;

  const blocks=[];
  if(announcements.length)blocks.push(h("section",{class:"managed-announcements","aria-label":"Annonces Workspace"},...announcements.slice(0,3).map(item=>
    h("article",{class:`managed-announcement ${item.featured?"featured":""}`},
      h("div",{class:"managed-kicker"},icon("notification",14),h("span",{text:"Annonce Workspace"})),
      h("strong",{text:item.title}),
      richContentNode(item,item.body||item.summary||"Une information vient d’être publiée."),
      managedLink(item,"En savoir plus")
    )
  )));

  if(onboarding.length||resources.length)blocks.push(h("section",{class:"managed-content-grid","aria-label":"Ressources publiées depuis Workspace"},
    ...onboarding.slice(0,3).map(item=>h("article",{class:"managed-content-card onboarding"},
      h("div",{class:"managed-card-icon"},icon("sparkles",17)),
      h("div",{},h("small",{text:item.audience?`Parcours · ${item.audience}`:"Parcours d’accueil"}),h("strong",{text:item.title}),h("p",{text:item.summary||item.body||"Étape recommandée pour bien démarrer."})),
      managedLink(item,"Commencer")
    )),
    ...resources.slice(0,5).map(item=>h("article",{class:"managed-content-card"},
      h("div",{class:"managed-card-icon"},icon(item.downloadURL?"download":"document",17)),
      h("div",{},h("small",{text:item.platform||"Ressource"}),h("strong",{text:item.title}),h("p",{text:item.summary||"Ressource publiée par Squared Group."})),
      managedLink(item,item.downloadURL?"Télécharger":"Consulter")
    ))
  ));

  if(releases.length||faqs.length)blocks.push(h("div",{class:"grid two managed-support-grid"},
    releases.length?card("Versions & nouveautés","Les dernières évolutions publiées par l’équipe.",h("div",{class:"list"},...releases.slice(0,5).map(item=>row({title:item.title,subtitle:item.summary||item.body||"Note de version",status:item.version||"Nouveau",meta:item._updatedDate?formatDate(item._updatedDate):"Publié"}))),{iconName:"sparkles"}):null,
    faqs.length?card("Questions fréquentes","Réponses pilotées depuis les données du site.",h("div",{class:"managed-faq-list"},...faqs.slice(0,6).map(item=>h("details",{class:"managed-faq"},h("summary",{text:item.question||item.title}),richContentNode(item,item.body||item.summary||"Réponse disponible prochainement.")))),{iconName:"support"}):null
  ));
  return h("div",{class:"managed-site-content section-gap"},h("div",{class:"managed-section-heading"},h("div",{},h("span",{text:"Contenus du site"}),h("h2",{text:"Actualités & ressources"})),h("div",{class:"managed-sync"},h("i"),h("span",{text:"Piloté depuis Workspace"}))),...blocks);
}

export async function renderDashboard(today=false){
  const {renderFocusHome}=await import("../focus-home.js");
  if(matchMedia("(max-width: 880px)").matches)return renderFocusHome(today);
  const managedContentPromise=loadWorkspaceWebContent().catch(()=>null);
  const root=h("div",{class:"studio-dashboard"});
  root.append(pageHeader({eyebrow:"Squared Workspace",title:today?"Aujourd’hui":"Tableau de bord",subtitle:today?"Ce qui doit avancer aujourd’hui.":"Une vue claire sur le travail, les décisions et les échanges de votre équipe."}));
  root.append(await renderFocusHome(today,{embedded:true}));
  const content=await managedContentPromise;
  const managed=content?managedContent(content):null;if(managed)root.append(managed);
  return root;
}
