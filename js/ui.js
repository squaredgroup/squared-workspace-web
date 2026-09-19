import { iconPath } from "./config.js";

export function h(tag,attrs={},...children){
  const el=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs||{})){
    if(value==null||value===false) continue;
    if(key==="class") el.className=value;
    else if(key==="text") el.textContent=value;
    else if(key==="html") el.innerHTML=value;
    else if(key==="style"&&typeof value==="object") Object.assign(el.style,value);
    else if(key.startsWith("on")&&typeof value==="function") el.addEventListener(key.slice(2).toLowerCase(),value);
    else if(key==="dataset") Object.assign(el.dataset,value);
    else if(["checked","disabled","selected","open","required"].includes(key)) el[key]=Boolean(value);
    else if(key==="value"&&"value" in el) el.value=value;
    else el.setAttribute(key,String(value));
  }
  for(const child of children.flat(Infinity)){
    if(child==null||child===false) continue;
    el.append(child instanceof Node?child:document.createTextNode(String(child)));
  }
  return el;
}
export function icon(name,size=17,fill=false){return h("img",{class:"icon",src:iconPath(name,fill),alt:"",width:size,height:size,style:{width:`${size}px`,height:`${size}px`}})}
export function button(label,{iconName,kind="",small=false,onClick,type="button",disabled=false,title=""}={}){return h("button",{class:`button ${kind} ${small?"small":""}`.trim(),type,disabled,onClick,title},iconName?icon(iconName,14):null,h("span",{text:label}))}
export function iconButton(iconName,label,onClick){return h("button",{class:"icon-button",type:"button","aria-label":label,title:label,onClick},icon(iconName,17))}
export function pretty(value){if(value==null||value==="")return"—";const raw=String(value).replace(/[_-]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2");return raw.charAt(0).toUpperCase()+raw.slice(1)}
export function badge(value){const normalized=String(value||"—").toLowerCase().replace(/[^a-z]+/g,"-");let tone="";if(/active|published|completed|approved|paid|ready|healthy|online|won|settled|accepted/.test(normalized))tone="active";else if(/pending|review|overdue|waiting|planned|draft|paused|degraded|expired/.test(normalized))tone="warning";else if(/failed|rejected|offline|lost|cancelled|error|void|breached|revoked|locked/.test(normalized))tone="danger";return h("span",{class:`badge ${tone} ${normalized}`,text:pretty(value)})}
export function formatDate(value,{dateOnly=false}={}){if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.valueOf()))return String(value);return new Intl.DateTimeFormat("fr-FR",dateOnly?{dateStyle:"medium"}:{dateStyle:"medium",timeStyle:"short"}).format(d)}
export function relativeDate(value){if(!value)return"—";const d=new Date(value),delta=d.getTime()-Date.now(),abs=Math.abs(delta);if(!Number.isFinite(delta))return"—";const rtf=new Intl.RelativeTimeFormat("fr",{numeric:"auto"});if(abs<60e3)return"à l’instant";if(abs<3600e3)return rtf.format(Math.round(delta/60e3),"minute");if(abs<86400e3)return rtf.format(Math.round(delta/3600e3),"hour");return rtf.format(Math.round(delta/86400e3),"day")}
export function number(value,options={}){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("fr-FR",options).format(n):"—"}
export function field(label,control,hint=""){return h("label",{class:"field"},h("span",{text:label}),control,hint?h("small",{class:"muted",text:hint}):null)}
export function input(value="",opts={}){return h("input",{value,type:opts.type||"text",placeholder:opts.placeholder||"",name:opts.name||"",required:opts.required||false,autocomplete:opts.autocomplete||"off",min:opts.min,max:opts.max,step:opts.step})}
export function textarea(value="",opts={}){return h("textarea",{name:opts.name||"",placeholder:opts.placeholder||"",text:value,required:opts.required||false})}
export function select(value,options=[],name=""){const el=h("select",{name});for(const option of options){const v=typeof option==="string"?option:option.value;const label=typeof option==="string"?pretty(option):option.label;el.append(h("option",{value:v,selected:String(v)===String(value),text:label}))}return el}
export function card(title,subtitle,content,{accent=false,iconName,className=""}={}){return h("section",{class:`card ${accent?"accent":""} ${className}`.trim()},h("div",{class:"card-head"},h("div",{},h("div",{class:"card-title",text:title}),subtitle?h("div",{class:"card-subtitle",text:subtitle}):null),iconName?icon(iconName,18):null),content)}
export function statCard(label,value,meta="",iconName="trend"){return h("section",{class:"card stat-card"},h("div",{class:"stat-top"},h("div",{},h("div",{class:"stat-value",text:number(value)}),h("div",{class:"stat-label",text:label})),h("div",{class:"stat-icon"},icon(iconName,16))),meta?h("div",{class:"stat-meta",text:meta}):h("div"))}
export function emptyState(title,copy,iconName="folder"){return h("div",{class:"empty"},h("div",{},icon(iconName,31),h("strong",{text:title}),h("p",{text:copy})))}
export function skeletonPage(){return h("div",{class:"grid two"},...Array.from({length:6},()=>h("div",{class:"card"},h("div",{class:"skeleton",style:{height:"18px",width:"42%"}}),h("div",{class:"skeleton",style:{height:"88px",marginTop:"18px"}}))))}
export function modal({title,content,actions=[],wide=false,onClose}){
  const overlay=h("div",{class:"overlay"});const close=()=>{overlay.remove();onClose?.()};
  overlay.addEventListener("mousedown",e=>{if(e.target===overlay)close()});
  const panel=h("div",{class:`modal ${wide?"wide":""}`,role:"dialog","aria-modal":"true","aria-label":title},
    h("div",{class:"modal-head"},h("h3",{text:title}),iconButton("close","Fermer",close)),
    h("div",{class:"modal-body"},content),
    actions.length?h("div",{class:"modal-actions"},...actions.map(action=>button(action.label,{kind:action.kind,iconName:action.icon,onClick:()=>action.onClick?.(close),disabled:action.disabled}))):null
  );
  overlay.append(panel);(document.querySelector("#portal-root")||document.body).append(overlay);setTimeout(()=>panel.querySelector("input,textarea,select,button")?.focus(),20);return{close,overlay,panel};
}
export function confirmAction({title="Confirmer",message,confirmLabel="Confirmer",danger=false,onConfirm}){
  modal({title,content:h("p",{class:"page-subtitle",text:message}),actions:[{label:"Annuler",kind:"ghost",onClick:close=>close()},{label:confirmLabel,kind:danger?"danger":"primary",icon:"check",onClick:async close=>{await onConfirm?.();close()}}]});
}
let toastRoot;
export function toast(message,type="success",timeout=3600){if(!toastRoot){toastRoot=h("div",{class:"toast-stack"});document.body.append(toastRoot)}const item=h("div",{class:`toast ${type}`,text:message,role:"status"});toastRoot.append(item);setTimeout(()=>item.remove(),timeout);return item}
export function errorMessage(error){return error?.payload?.message||error?.message||"Une erreur est survenue."}
export function pageHeader({eyebrow,title,subtitle,actions=[]}){return h("div",{class:"page-head"},h("div",{class:"page-head-main"},h("div",{class:"eyebrow",text:eyebrow}),h("h1",{class:"page-title",text:title}),h("div",{class:"page-subtitle",text:subtitle||""})),actions.length?h("div",{class:"page-actions"},...actions):null)}
export function toolbar(search,onSearch,actions=[]){const i=h("input",{class:"search-input",type:"search",placeholder:"Rechercher…",value:search||"",onInput:e=>onSearch?.(e.target.value)});return h("div",{class:"toolbar"},i,h("div",{class:"spacer"}),...actions)}
export function row({title,subtitle,status,meta,actions=[]}){return h("div",{class:"row"},h("div",{},h("div",{class:"row-title",text:title||"Sans titre"}),subtitle?h("div",{class:"row-sub",text:subtitle}):null),h("div",{class:"row-cell optional"},status?badge(status):""),h("div",{class:"row-cell optional",text:meta||""}),h("div",{class:"row-actions"},...actions))}
export function jsonEditor(value,name="json"){return textarea(JSON.stringify(value||{},null,2),{name})}
export function safeJSON(raw,fallback={}){try{return JSON.parse(raw||"{}")}catch{return fallback}}
export function advancedEditor(label,editor,copy="Réservé aux champs métier qui ne disposent pas encore d’un contrôle dédié."){return h("details",{class:"advanced-panel"},h("summary",{text:label}),h("div",{class:"advanced-panel-body"},h("p",{class:"muted",text:copy}),editor))}
