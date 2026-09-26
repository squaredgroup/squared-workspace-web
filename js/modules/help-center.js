import { h,pageHeader,card,button,emptyState } from "../ui.js";
import { request } from "../session.js";

const HELP_URL="https://docs.squaredgroup.studio";
const tabs={
  overview:{title:"Vue d’ensemble",description:"Pilotez la connaissance et ouvrez les outils opérationnels du Help Center."},
  articles:{title:"Articles",description:"Rédigez, révisez et publiez les contenus administrables."},
  community:{title:"Communauté",description:"Suivez les discussions et transformez une solution en connaissance durable."},
  support:{title:"Support",description:"Accédez aux demandes privées et aux opérations d’assistance."},
  health:{title:"Knowledge Health",description:"Repérez les recherches sans réponse, contenus à revoir et retours négatifs."}
};
const open=(label,path,kind="ghost")=>button(label,{kind,iconName:"external",onClick:()=>window.open(HELP_URL+path,"_blank","noopener,noreferrer")});
async function snapshot(){
  try{return (await request("/v1/help-center/summary")).data||null}catch{return null}
}
function metric(value,label){return h("div",{class:"metric-card"},h("strong",{text:String(value??"—")}),h("span",{text:label}))}
export async function renderHelpCenter(view="overview"){
  const meta=tabs[view]||tabs.overview,root=h("div");
  root.append(pageHeader({eyebrow:"Squared Help",title:meta.title,subtitle:meta.description}));
  const data=await snapshot();
  if(view==="overview"){
    root.append(h("div",{class:"metric-grid"},metric(data?.publishedArticles,"Articles publiés"),metric(data?.openTickets,"Demandes actives"),metric(data?.openTopics,"Discussions ouvertes"),metric(data?.activeIncidents,"Incidents actifs")));
    root.append(card("Control Center","Le Help Center conserve sa propre authentification et ses règles d’accès. Workspace sert ici de console d’orchestration et n’expose pas de secret ni de contenu privé sans API autorisée.",
      h("div",{class:"button-row"},open("Ouvrir l’admin Help Center","/admin.html","primary"),open("Tester la recherche","/search.html"),open("Voir le statut","/status.html")),{iconName:"cloud"}));
  }else if(view==="articles"){
    root.append(card("Knowledge","Créez un brouillon, révisez les contenus administrables et consultez les sources versionnées.",
      h("div",{class:"button-row"},open("Créer un article","/editorial.html","primary"),open("Admin · Knowledge","/admin.html#knowledge"),open("Recherche publique","/search.html")),{iconName:"document"}));
  }else if(view==="community"){
    root.append(card("Forum → connaissance","Une réponse communautaire validée peut servir de source à un brouillon ; la publication reste une action humaine explicite.",
      h("div",{class:"button-row"},open("Ouvrir la communauté","/forum.html","primary"),open("Admin · Community","/admin.html#community")),{iconName:"users"}));
  }else if(view==="support"){
    root.append(card("Assistance privée","Les tickets restent dans le système Help Center. Workspace ne copie pas leur contenu dans le navigateur.",
      h("div",{class:"button-row"},open("Admin · Support","/admin.html#support","primary"),open("État des services","/server-status.html")),{iconName:"phone"}));
  }else if(view==="health"){
    root.append(h("div",{class:"metric-grid"},metric(data?.zeroResultSearches,"Recherches sans résultat"),metric(data?.reviewDue,"Contenus à revoir"),metric(data?.negativeFeedback,"Retours négatifs"),metric(data?.unplannedReviews,"Revues non planifiées")));
    root.append(card("Knowledge Health","Utilisez ces signaux pour prioriser le travail éditorial plutôt qu’un score décoratif.",
      h("div",{class:"button-row"},open("Ouvrir Knowledge Health","/admin.html#knowledge","primary"),open("Analytics","/admin.html#analytics")),{iconName:"trend"}));
  }
  if(!data)root.append(emptyState("Résumé live non connecté","Les raccourcis sont opérationnels. Les métriques apparaîtront lorsque l’API Workspace exposera /v1/help-center/summary avec les permissions requises.","warning"));
  return root;
}
