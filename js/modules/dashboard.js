import { state } from "../store.js";
import { loadWorkspace, listCoreDomain, loadDomainCatalog, listSpecialized } from "../api.js";
import { h, pageHeader, card, row, badge, emptyState, number, formatDate } from "../ui.js";

const arrays=(workspace)=>({projects:workspace?.projects||[],missions:workspace?.missions||[],tasks:workspace?.tasks||[],validations:workspace?.validations||[],deliverables:workspace?.deliverables||[],notifications:workspace?.notifications||[]});
function active(values){return values.filter(v=>!/(completed|done|archived|closed|approved|rejected|cancel)/i.test(String(v.status||v.payload?.status||"")))}
function stat(label,value,meta){return h("div",{class:"card"},h("div",{class:"stat-value",text:number(value)}),h("div",{class:"stat-label",text:label}),meta?h("div",{class:"stat-meta",text:meta}):null)}

export async function renderDashboard(today=false){
  const root=h("div"); root.append(pageHeader({eyebrow:today?"Focus":"Squared Group",title:today?"Aujourd’hui":"Tableau de bord",subtitle:today?"Priorités, échéances et décisions qui demandent votre attention.":"Vue exécutive synchronisée avec l’ensemble de Squared Workspace."}));
  const workspace=await loadWorkspace(); const data=arrays(workspace);
  const tasks=active(data.tasks), projects=active(data.projects), validations=active(data.validations); const unread=data.notifications.filter(v=>!(v.isRead??v.payload?.isRead)).length;
  root.append(h("div",{class:"grid stats"},stat("Projets actifs",projects.length,"Portefeuille Workspace"),stat("Tâches ouvertes",tasks.length,"Exécution en cours"),stat("Décisions",validations.length,"Validations ouvertes"),stat("Notifications",unread,"Non lues")));
  const due=[...tasks,...active(data.missions),...validations].map(value=>({value,date:value.payload?.dueAt||value.payload?.due_at||value.due_at})).filter(x=>x.date).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,8);
  const recent=[...data.projects,...data.tasks,...data.deliverables].sort((a,b)=>new Date(b.updated_at||b.payload?.updatedAt||0)-new Date(a.updated_at||a.payload?.updatedAt||0)).slice(0,8);
  root.append(h("div",{class:"grid two",style:{marginTop:"14px"}},
    card(today?"À traiter":"Prochaines échéances",today?"Les éléments prioritaires de votre journée.":"Les échéances les plus proches.",due.length?h("div",{class:"list"},...due.map(({value,date})=>row({title:value.title||value.payload?.title||"Sans titre",subtitle:value.payload?.projectName||value.payload?.detail||"Workspace",status:value.status||value.payload?.status,meta:formatDate(date)}))):emptyState("Rien d’urgent","Aucune échéance datée ne nécessite d’attention immédiate.","check"),{iconName:"clock"}),
    card("Activité récente","Dernières données modifiées dans les domaines opérationnels.",recent.length?h("div",{class:"list"},...recent.map(value=>row({title:value.title||value.payload?.title||"Sans titre",subtitle:value.payload?.detail||"Workspace",status:value.status||value.payload?.status,meta:formatDate(value.updated_at||value.payload?.updatedAt)}))):emptyState("Aucune activité","Les dernières modifications apparaîtront ici."),{iconName:"trend"})
  ));
  try{
    if(!state.domainCatalog) await loadDomainCatalog();
    const overviewKinds=["invoices","opportunities","time-entries","service-incidents"].filter(k=>state.domainCatalog?.kinds?.some(v=>v.kind===k));
    if(overviewKinds.length){ const cards=[]; for(const kind of overviewKinds){const items=await listSpecialized(kind);cards.push(stat(kind.replaceAll("-"," "),items.length,items[0]?.updatedAt?`Mis à jour ${formatDate(items[0].updatedAt)}`:"Données métier"))} root.append(h("div",{class:"grid stats",style:{marginTop:"14px"}},...cards)); }
  }catch{/* dashboard remains usable */}
  return root;
}
