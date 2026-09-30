const API_BASE="https://workspace.squaredgroup.studio/v1/public/web-content/workspace-web";
const COLLECTIONS=["announcements","onboarding","resources","downloads","releases","faqs"];
let contentPromise=null;

const normalized=item=>({id:item?.id||"",...(item?.data||{})});

async function siteSettings(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(`${API_BASE}/settings`,{cache:"no-store",headers:{Accept:"application/json"},signal:controller.signal});
    if(!response.ok)return null;
    const payload=await response.json();
    return payload?.version>0?payload.settings:null;
  }finally{clearTimeout(timer)}
}

function applySiteSettings(settings){
  if(!settings)return;
  const root=document.documentElement;
  if(/^#[0-9a-f]{6}$/i.test(settings.accentColor||"")){
    const rgb=settings.accentColor.slice(1).match(/.{2}/g).map(value=>parseInt(value,16));
    root.style.setProperty("--sq-accent",settings.accentColor);
    root.style.setProperty("--sq-accent-rgb",rgb.join(","));
    root.style.setProperty("--sq-on-accent",(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000<145?"#FFFFFF":"#0A1207");
  }
  root.style.setProperty("--sq-font",settings.fontFamily==="INTER"?"Inter,system-ui,sans-serif":settings.fontFamily==="SYSTEM"?"system-ui,sans-serif":"'Space Grotesk',system-ui,sans-serif");
  if(settings.seoTitle)document.title=settings.seoTitle;
  const applicationName=document.querySelector('meta[name="application-name"]');
  if(applicationName&&settings.siteName)applicationName.content=settings.siteName;
  const description=document.querySelector('meta[name="description"]');
  if(description&&settings.seoDescription)description.content=settings.seoDescription;
  if(/^https:\/\//.test(settings.faviconURL||"")){
    const icon=document.querySelector('link[rel="icon"]');
    if(icon)icon.href=settings.faviconURL;
  }
  if(/^https:\/\//.test(settings.socialImageURL||"")){
    let image=document.querySelector('meta[property="og:image"]');
    if(!image){image=document.createElement('meta');image.setAttribute('property','og:image');document.head.append(image)}
    image.content=settings.socialImageURL;
  }
}

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
  if(!contentPromise)contentPromise=Promise.allSettled([...COLLECTIONS.map(collection),siteSettings()]).then(results=>{
    const content=Object.fromEntries(COLLECTIONS.map((key,index)=>[key,results[index].status==="fulfilled"?results[index].value:[]]));
    const settings=results[COLLECTIONS.length].status==="fulfilled"?results[COLLECTIONS.length].value:null;
    applySiteSettings(settings);
    if(settings?.announcementText)content.announcements.unshift({
      id:"workspace-site-announcement",title:settings.announcementText,summary:settings.announcementText,
      url:safePublicURL(settings.announcementURL),featured:true
    });
    return content;
  });
  return contentPromise;
}

export function safePublicURL(value){
  if(!value)return "";
  try{const url=new URL(String(value),location.origin);return ["http:","https:"].includes(url.protocol)?url.href:""}catch{return ""}
}

const blocksOf=item=>Array.isArray(item?.contentBlocks)?item.contentBlocks.filter(block=>block&&typeof block==="object"):[];
const node=(tag,className="")=>{const value=document.createElement(tag);if(className)value.className=className;return value};
const blockClass=block=>[
  "managed-rich-block",
  `is-${String(block.kind||"paragraph").toLowerCase().replaceAll("_","-")}`,
  `tone-${String(block.tone||"neutral").toLowerCase()}`,
  `presentation-${String(block.presentation||"plain").toLowerCase()}`,
  `align-${String(block.alignment||"leading").toLowerCase()}`,
  `width-${String(block.width||"standard").toLowerCase()}`,
  `size-${String(block.size||"medium").toLowerCase()}`
].join(" ");

function appendInlineText(target,source){
  const value=String(source||""),pattern=/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;let cursor=0;
  for(const match of value.matchAll(pattern)){
    if(match.index>cursor)target.append(document.createTextNode(value.slice(cursor,match.index)));
    const token=match[0];
    if(token.startsWith("**")){const strong=node("strong");strong.textContent=token.slice(2,-2);target.append(strong)}
    else if(token.startsWith("_")){const emphasis=node("em");emphasis.textContent=token.slice(1,-1);target.append(emphasis)}
    else{const parts=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/),href=safePublicURL(parts?.[2]);if(href){const link=node("a");link.href=href;link.textContent=parts[1];if(!href.startsWith(location.origin)){link.target="_blank";link.rel="noopener noreferrer"}target.append(link)}else target.append(document.createTextNode(parts?.[1]||token))}
    cursor=match.index+token.length;
  }
  if(cursor<value.length)target.append(document.createTextNode(value.slice(cursor)));
}

function appendStyledText(target,source,rawMarks){
  const value=String(source||""),marks=Array.isArray(rawMarks)?rawMarks.map(mark=>({style:String(mark?.style||"").toUpperCase(),location:Math.max(0,Number(mark?.location)||0),length:Math.max(0,Number(mark?.length)||0),url:String(mark?.url||"")})).filter(mark=>mark.length>0&&mark.location<value.length):[];
  if(!marks.length){appendInlineText(target,value);return}
  const boundaries=[...new Set([0,value.length,...marks.flatMap(mark=>[mark.location,Math.min(value.length,mark.location+mark.length)])])].sort((a,b)=>a-b);
  for(let index=0;index<boundaries.length-1;index+=1){const start=boundaries[index],end=boundaries[index+1];if(end<=start)continue;const active=marks.filter(mark=>mark.location<=start&&mark.location+mark.length>=end);let content=document.createTextNode(value.slice(start,end));for(const style of ["BOLD","ITALIC","UNDERLINE","STRIKETHROUGH","LINK"]){const mark=active.find(candidate=>candidate.style===style);if(!mark)continue;const wrapper=node(style==="BOLD"?"strong":style==="ITALIC"?"em":style==="UNDERLINE"?"u":style==="STRIKETHROUGH"?"s":"a");if(style==="LINK"){const href=safePublicURL(mark.url);if(!href)continue;wrapper.href=href;if(!href.startsWith(location.origin)){wrapper.target="_blank";wrapper.rel="noopener noreferrer"}}wrapper.append(content);content=wrapper}target.append(content)}
}

function renderBlock(block){
  const kind=String(block.kind||"PARAGRAPH").toUpperCase(),wrapper=node("div",blockClass(block));
  if(kind==="DIVIDER")return node("hr",blockClass(block));
  if(kind==="SPACER")return wrapper;
  if(kind==="IMAGE"){
    const figure=node("figure",blockClass(block)),src=safePublicURL(block.url);
    if(src){const image=node("img");image.src=src;image.alt=block.alternativeText||"";image.loading="lazy";figure.append(image)}
    if(block.caption){const caption=node("figcaption");caption.textContent=block.caption;figure.append(caption)}return figure;
  }
  if(kind==="BUTTON"){
    const href=safePublicURL(block.url);if(!href)return wrapper;const link=node("a",`${blockClass(block)} managed-rich-action`);link.href=href;link.textContent=block.text||"En savoir plus";if(!href.startsWith(location.origin)){link.target="_blank";link.rel="noopener noreferrer"}return link;
  }
  if(["BULLETED_LIST","NUMBERED_LIST"].includes(kind)){
    const list=node(kind==="NUMBERED_LIST"?"ol":"ul");String(block.text||"").split("\n").map(value=>value.trim()).filter(Boolean).forEach(value=>{const item=node("li");appendInlineText(item,value);list.append(item)});wrapper.append(list);return wrapper;
  }
  const copy=node(kind==="HEADING"?"h3":kind==="QUOTE"?"blockquote":"p");appendStyledText(copy,block.text||"",block.marks);if(kind==="CALLOUT"){const mark=node("span","managed-rich-callout-mark");mark.textContent="!";wrapper.append(mark)}wrapper.append(copy);return wrapper;
}

export function richContentNode(item,fallback=""){
  const host=node("div","managed-rich-content"),blocks=blocksOf(item);
  if(blocks.length)blocks.forEach(block=>host.append(renderBlock(block)));
  else{const paragraph=node("p");paragraph.textContent=fallback;host.append(paragraph)}
  return host;
}

export function activeAnnouncement(item,now=new Date()){
  const reference=now instanceof Date&&Number.isFinite(now.getTime())?now:new Date();
  const start=item?.startsAt?new Date(item.startsAt):null,end=item?.endsAt?new Date(item.endsAt):null,time=reference.getTime();
  if(start&&!Number.isNaN(start.getTime())&&start.getTime()>time)return false;
  if(end&&!Number.isNaN(end.getTime())&&end.getTime()<time)return false;
  return true;
}
