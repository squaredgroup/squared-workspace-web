const API_BASE="https://workspace.squaredgroup.studio/v1/public/web-content/workspace-web";
const COLLECTIONS=["announcements","onboarding","resources","downloads","releases","faqs"];
let contentPromise=null;

const normalized=item=>({id:item?.id||"",...(item?.data||{})});

async function collection(key){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(`${API_BASE}/${key}`,{headers:{Accept:"application/json"},signal:controller.signal});
    if(!response.ok)throw new Error(`Flux ${key} indisponible`);
    const payload=await response.json();
    return Array.isArray(payload?.items)?payload.items.map(normalized):[];
  }finally{clearTimeout(timer)}
}

export function loadWorkspaceWebContent(){
  if(!contentPromise)contentPromise=Promise.allSettled(COLLECTIONS.map(collection)).then(results=>Object.fromEntries(
    COLLECTIONS.map((key,index)=>[key,results[index].status==="fulfilled"?results[index].value:[]])
  ));
  return contentPromise;
}

export function safePublicURL(value){
  if(!value)return "";
  try{const url=new URL(String(value),location.origin);return ["http:","https:"].includes(url.protocol)?url.href:""}catch{return ""}
}

export function activeAnnouncement(item,now=new Date()){
  const reference=now instanceof Date&&Number.isFinite(now.getTime())?now:new Date();
  const start=item?.startsAt?new Date(item.startsAt):null,end=item?.endsAt?new Date(item.endsAt):null,time=reference.getTime();
  if(start&&!Number.isNaN(start.getTime())&&start.getTime()>time)return false;
  if(end&&!Number.isNaN(end.getTime())&&end.getTime()<time)return false;
  return true;
}
