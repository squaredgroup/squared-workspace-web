import { request } from "../api.js";
import { h,pageHeader,card,row,errorMessage,emptyState,statCard,formatDate } from "../ui.js";
export async function renderNewsletter(){
  const root=h("div");root.append(pageHeader({eyebrow:"Marketing",title:"Newsletter",subtitle:"Abonnés et états de synchronisation de la newsletter Squared Group."}));
  try{
    const data=(await request("/v1/mailbox/newsletters/subscribers")).data,subscribers=data.subscribers||[],counts=Object.entries(data.counts||{}).slice(0,4);
    if(counts.length)root.append(h("div",{class:"grid stats"},...counts.map(([key,value])=>statCard(String(key).replaceAll("_"," "),value,"Newsletter","mail"))));
    root.append(card("Abonnés",`${subscribers.length} contact${subscribers.length>1?"s":""} synchronisé${subscribers.length>1?"s":""} avec Wix.`,subscribers.length?h("div",{class:"list"},...subscribers.slice(0,500).map(subscriber=>row({title:subscriber.email||subscriber.name||subscriber.id,subtitle:[subscriber.firstName,subscriber.source||"Wix"].filter(Boolean).join(" · "),status:subscriber.status,meta:subscriber.createdAt?formatDate(subscriber.createdAt,{dateOnly:true}):""}))):emptyState("Aucun abonné","La collection newsletter ne contient aucun abonné.","mail"),{iconName:"mail",className:counts.length?"section-gap":""}));
  }catch(error){root.append(emptyState("Newsletter indisponible",errorMessage(error),"warning"))}
  return root;
}
