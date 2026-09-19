import { adminSecurityOverview,request } from "../api.js";
import { h,pageHeader,card,row,emptyState,errorMessage,statCard,advancedEditor,pretty,formatDate,badge } from "../ui.js";

function summaryCards(data){
  const entries=Object.entries(data||{}).filter(([,value])=>["string","number","boolean"].includes(typeof value)).slice(0,4);
  if(!entries.length)return[];
  return entries.map(([key,value])=>statCard(pretty(key),typeof value==="boolean"?(value?1:0):value,typeof value==="boolean"?(value?"Actif":"Inactif"):"Vue sécurité","shield"));
}
function arraySection(title,values,iconName){
  if(!Array.isArray(values)||!values.length)return null;
  return card(title,`${values.length} élément${values.length>1?"s":""} remonté${values.length>1?"s":""} par le backend.`,h("div",{class:"list"},...values.slice(0,100).map((value,index)=>row({
    title:value.name||value.title||value.device_name||value.host||value.id||`Élément ${index+1}`,
    subtitle:value.platform||value.description||value.detail||value.type||"",
    status:value.status||value.state||(value.healthy===true?"healthy":value.healthy===false?"failed":"active"),
    meta:formatDate(value.updatedAt||value.updated_at||value.last_seen_at||value.createdAt||value.created_at)
  }))),{iconName});
}
export async function renderSecurity(subpage="devices"){
  const root=h("div");
  root.append(pageHeader({eyebrow:"Administration",title:"Appareils & serveurs",subtitle:"État de sécurité et d’infrastructure exposé par le backend Squared Workspace."}));
  try{
    const data=await adminSecurityOverview(),stats=summaryCards(data);
    if(stats.length)root.append(h("div",{class:"grid stats"},...stats));
    const known=[
      ["Services",data.services||data.serviceHealth,"sync"],
      ["Serveurs",data.servers||data.infrastructure,"cloud"],
      ["Appareils",data.devices,"user"],
      ["Alertes",data.alerts||data.incidents,"warning"]
    ].map(args=>arraySection(...args)).filter(Boolean);
    if(known.length)root.append(h("div",{class:"grid two section-gap"},...known));
    if(subpage==="devices"){
      const sessions=(await request("/v1/sessions")).data||[];
      root.append(card("Mes sessions",`${sessions.length} session${sessions.length>1?"s":""} active${sessions.length>1?"s":""}.`,sessions.length?h("div",{class:"list"},...sessions.map(session=>row({title:session.device_name||"Appareil",subtitle:session.platform||"",status:session.id?"active":"session",meta:formatDate(session.last_seen_at||session.created_at)}))):emptyState("Aucune session","Aucune session active visible."),{iconName:"user",className:"section-gap"}));
    }
    root.append(advancedEditor("Données techniques de sécurité",h("pre",{class:"json-view",text:JSON.stringify(data,null,2)}),"Diagnostic réservé aux administrateurs techniques."));
  }catch(error){root.append(emptyState("Sécurité indisponible",errorMessage(error),"warning"))}
  return root;
}
