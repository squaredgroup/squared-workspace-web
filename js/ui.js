import { iconPath } from "./config.js";

let uid=0;
const nextId=prefix=>prefix+"-"+(++uid);
const focusableSelector='a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),details>summary,[tabindex]:not([tabindex="-1"])';

export function h(tag,attrs={},...children){
  const el=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs||{})){
    if(value==null||value===false) continue;
    if(key==="class") el.className=value;
    else if(key==="text") el.textContent=value;
    else if(key==="style"&&typeof value==="object") Object.assign(el.style,value);
    else if(key.startsWith("on")&&typeof value==="function") el.addEventListener(key.slice(2).toLowerCase(),value);
    else if(key==="dataset") Object.assign(el.dataset,value);
    else if(["checked","disabled","selected","open","required","hidden","readonly","multiple","inert"].includes(key)) el[key]=Boolean(value);
    else if(key==="value"&&"value" in el) el.value=value;
    else el.setAttribute(key,String(value));
  }
  for(const child of children.flat(Infinity)){
    if(child==null||child===false) continue;
    el.append(child instanceof Node?child:document.createTextNode(String(child)));
  }
  return el;
}
export function icon(name,size=17,fill=false){return h("img",{class:"icon",src:iconPath(name,fill),alt:"",width:size,height:size,decoding:"async",draggable:"false",style:{width:`${size}px`,height:`${size}px`}})}
export function avatarInitials(person={}){
  const value=typeof person==="string"?person:(person.name||`${person.firstName||person.first_name||""} ${person.lastName||person.last_name||""}`.trim()||person.email||"");
  return String(value).trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"SQ";
}
export function avatarDataURL(value){
  if(typeof value!=="string"||!value)return"";
  if(value.length>14_000_000)return"";
  if(/^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i.test(value))return value;
  if(!/^[A-Za-z0-9+/=]+$/.test(value))return"";
  const mime=value.startsWith("iVBORw0KGgo")?"image/png":value.startsWith("/9j/")?"image/jpeg":"";
  return mime?`data:${mime};base64,${value}`:"";
}
export function profileAvatar(person={}, {className="avatar",size=36,label="",ariaHidden=false}={}){
  const name=typeof person==="string"?person:(person.name||`${person.firstName||person.first_name||""} ${person.lastName||person.last_name||""}`.trim()||person.email||"Membre");
  const source=avatarDataURL(typeof person==="object"?(person.avatarData||person.avatar_data):"");
  const wrapper=h("span",{class:`profile-avatar ${className}`.trim(),style:{width:`${size}px`,height:`${size}px`,flexBasis:`${size}px`},role:ariaHidden?null:"img","aria-label":ariaHidden?null:(label||`Photo de profil de ${name}`),"aria-hidden":ariaHidden?"true":null},h("span",{class:"profile-avatar-initials",text:avatarInitials(person)}));
  if(source)wrapper.append(h("img",{class:"profile-avatar-image",src:source,alt:"",decoding:"async",draggable:"false",onError:event=>event.currentTarget.remove()}));
  return wrapper;
}
export function button(label,{iconName,kind="",small=false,onClick,type="button",disabled=false,title="",ariaLabel="",pressed=null,className=""}={}){
  const node=h("button",{class:`button ${kind} ${small?"small":""} ${className}`.trim(),type,disabled,title,"aria-label":ariaLabel||null,"aria-pressed":pressed==null?null:String(pressed)},iconName?icon(iconName,14):null,h("span",{text:label}));
  if(onClick)node.addEventListener("click",event=>{const result=onClick(event);if(result&&typeof result.finally==="function"){node.disabled=true;node.setAttribute("aria-busy","true");result.finally(()=>{if(node.isConnected){node.disabled=false;node.removeAttribute("aria-busy")}})}});
  return node;
}
export function iconButton(iconName,label,onClick){return h("button",{class:"icon-button",type:"button","aria-label":label,title:label,onClick},icon(iconName,17))}
export function pretty(value){if(value==null||value==="")return"—";const raw=String(value).replace(/[_-]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2");return raw.charAt(0).toUpperCase()+raw.slice(1)}
export function badge(value){const normalized=String(value||"—").toLowerCase().replace(/[^a-z]+/g,"-");let tone="";if(/active|published|completed|approved|paid|ready|healthy|online|won|settled|accepted/.test(normalized))tone="active";else if(/pending|review|overdue|waiting|planned|draft|paused|degraded|expired/.test(normalized))tone="warning";else if(/failed|rejected|offline|lost|cancelled|error|void|breached|revoked|locked/.test(normalized))tone="danger";return h("span",{class:`badge ${tone} ${normalized}`,text:pretty(value)})}
export function formatDate(value,{dateOnly=false}={}){if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.valueOf()))return String(value);return new Intl.DateTimeFormat("fr-FR",dateOnly?{dateStyle:"medium"}:{dateStyle:"medium",timeStyle:"short"}).format(d)}
export function relativeDate(value){if(!value)return"—";const d=new Date(value),delta=d.getTime()-Date.now(),abs=Math.abs(delta);if(!Number.isFinite(delta))return"—";const rtf=new Intl.RelativeTimeFormat("fr",{numeric:"auto"});if(abs<60e3)return"à l’instant";if(abs<3600e3)return rtf.format(Math.round(delta/60e3),"minute");if(abs<86400e3)return rtf.format(Math.round(delta/3600e3),"hour");return rtf.format(Math.round(delta/86400e3),"day")}
export function number(value,options={}){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("fr-FR",options).format(n):"—"}
export function field(label,control,hint=""){const hintId=hint?nextId("field-hint"):"";if(hintId)control.setAttribute("aria-describedby",hintId);return h("label",{class:`field ${control.required?"required":""}`.trim()},h("span",{text:label}),control,hint?h("small",{id:hintId,class:"muted",text:hint}):null)}
export function input(value="",opts={}){return h("input",{value,type:opts.type||"text",placeholder:opts.placeholder||"",name:opts.name||"",required:opts.required||false,autocomplete:opts.autocomplete||"off",min:opts.min,max:opts.max,step:opts.step,minlength:opts.minLength,maxlength:opts.maxLength,pattern:opts.pattern,inputmode:opts.inputMode})}
export function textarea(value="",opts={}){const el=h("textarea",{name:opts.name||"",placeholder:opts.placeholder||"",required:opts.required||false,rows:opts.rows||null,spellcheck:opts.spellcheck??true,minlength:opts.minLength,maxlength:opts.maxLength});el.value=value??"";return el}
export function select(value,options=[],name=""){const el=h("select",{name});for(const option of options){const v=typeof option==="string"?option:option.value;const label=typeof option==="string"?pretty(option):option.label;el.append(h("option",{value:v,selected:String(v)===String(value),text:label}))}return el}
export function card(title,subtitle,content,{accent=false,iconName,className=""}={}){return h("section",{class:`card ${accent?"accent":""} ${className}`.trim()},h("div",{class:"card-head"},h("div",{},h("h2",{class:"card-title",text:title}),subtitle?h("div",{class:"card-subtitle",text:subtitle}):null),iconName?icon(iconName,18):null),content)}
export function statCard(label,value,meta="",iconName="trend"){return h("section",{class:"card stat-card"},h("div",{class:"stat-top"},h("div",{},h("div",{class:"stat-value",text:number(value)}),h("div",{class:"stat-label",text:label})),h("div",{class:"stat-icon"},icon(iconName,16))),meta?h("div",{class:"stat-meta",text:meta}):h("div"))}
export function progressBar(value,label="Progression"){
  const normalized=Math.max(0,Math.min(100,Number(value)||0));
  return h("div",{class:"progress-block"},h("div",{class:"progress-copy"},h("span",{text:label}),h("strong",{text:`${Math.round(normalized)} %`})),h("div",{class:"progress-track",role:"progressbar","aria-label":label,"aria-valuemin":"0","aria-valuemax":"100","aria-valuenow":String(Math.round(normalized))},h("i",{style:{width:`${normalized}%`}})));
}
export function segmentedControl({label,options,value,onChange}){
  return h("div",{class:"segmented",role:"group","aria-label":label},...options.map(option=>h("button",{type:"button",class:String(option.value)===String(value)?"active":"","aria-pressed":String(String(option.value)===String(value)),title:option.label,onClick:()=>onChange?.(option.value)},option.icon?icon(option.icon,14):null,h("span",{text:option.label}))));
}
export function statePanel({tone="neutral",title,copy,action}){
  return h("div",{class:`state-panel ${tone}`,role:tone==="danger"?"alert":"status"},h("div",{class:"state-panel-copy"},h("strong",{text:title}),h("span",{text:copy})),action||null);
}
export function emptyState(title,copy,iconName="folder"){return h("div",{class:"empty"},h("div",{},icon(iconName,31),h("strong",{text:title}),h("p",{text:copy})))}
export function skeletonPage(){return h("div",{class:"grid two"},...Array.from({length:6},()=>h("div",{class:"card"},h("div",{class:"skeleton",style:{height:"18px",width:"42%"}}),h("div",{class:"skeleton",style:{height:"88px",marginTop:"18px"}}))))}
function refreshModalLayers(){
  const app=document.querySelector("#app");
  const overlays=[...document.querySelectorAll("#portal-root > .overlay")];
  if(app)app.inert=overlays.length>0;
  overlays.forEach((overlay,index)=>{const top=index===overlays.length-1;overlay.inert=!top;if(top)overlay.removeAttribute("aria-hidden");else overlay.setAttribute("aria-hidden","true");});
}
function visibleFocusable(panel){return [...panel.querySelectorAll(focusableSelector)].filter(el=>!el.hidden&&el.getAttribute("aria-hidden")!=="true"&&el.getClientRects().length>0)}
export function modal({title,content,actions=[],wide=false,onClose,role="dialog",className="",initialFocus="",closeOnBackdrop=true}){
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overlay=h("div",{class:"overlay"}),titleId=nextId("dialog-title");let closed=false;
  const close=()=>{if(closed)return;closed=true;overlay.remove();refreshModalLayers();onClose?.();const remaining=[...document.querySelectorAll("#portal-root > .overlay")].at(-1);if(remaining){(visibleFocusable(remaining)[0]||remaining.querySelector(".modal"))?.focus?.();}else if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};
  const panel=h("div",{class:`modal ${wide?"wide":""} ${className}`.trim(),role,"aria-modal":"true","aria-labelledby":titleId,tabindex:"-1"},h("div",{class:"modal-head"},h("h3",{id:titleId,text:title}),iconButton("close","Fermer",close)),h("div",{class:"modal-body"},content),actions.length?h("div",{class:"modal-actions"},...actions.map(action=>button(action.label,{kind:action.kind,iconName:action.icon,onClick:()=>action.onClick?.(close),disabled:action.disabled}))):null);
  overlay.append(panel);overlay.addEventListener("mousedown",event=>{if(closeOnBackdrop&&event.target===overlay)close()});
  panel.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return}if(event.key!=="Tab")return;const nodes=visibleFocusable(panel);if(!nodes.length){event.preventDefault();panel.focus();return}const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
  (document.querySelector("#portal-root")||document.body).append(overlay);refreshModalLayers();
  requestAnimationFrame(()=>{const target=(initialFocus?panel.querySelector(initialFocus):null)||panel.querySelector(".modal-body input,.modal-body textarea,.modal-body select,.modal-actions button:not([disabled])")||visibleFocusable(panel)[0]||panel;target.focus({preventScroll:true});});
  return{close,overlay,panel};
}
export function confirmAction({title="Confirmer",message,confirmLabel="Confirmer",danger=false,onConfirm}){
  return modal({title,role:"alertdialog",initialFocus:".modal-actions .button",content:h("p",{class:"page-subtitle",text:message}),actions:[{label:"Annuler",kind:"ghost",onClick:close=>close()},{label:confirmLabel,kind:danger?"danger":"primary",icon:"check",onClick:async close=>{await onConfirm?.();close()}}]});
}
let toastRoot;
export function toast(message,type="success",timeout=3600){if(!toastRoot){toastRoot=h("div",{class:"toast-stack","aria-live":"polite","aria-atomic":"false"});document.body.append(toastRoot)}const item=h("div",{class:`toast ${type}`,text:message,role:type==="error"?"alert":"status"});toastRoot.append(item);setTimeout(()=>item.remove(),timeout);return item}
export function announce(message){const region=document.querySelector("#announcer");if(!region)return;region.textContent="";requestAnimationFrame(()=>{region.textContent=message})}
export function errorMessage(error){return error?.payload?.message||error?.message||"Une erreur est survenue."}
export function pageHeader({eyebrow,title,subtitle,actions=[]}){return h("div",{class:"page-head"},h("div",{class:"page-head-main"},h("div",{class:"eyebrow",text:eyebrow}),h("h1",{class:"page-title",text:title}),h("div",{class:"page-subtitle",text:subtitle||""})),actions.length?h("div",{class:"page-actions"},...actions):null)}
export function toolbar(search,onSearch,actions=[],label="Rechercher dans la liste"){const i=h("input",{class:"search-input",type:"search",placeholder:"Rechercher…",value:search||"","aria-label":label,onInput:e=>onSearch?.(e.target.value)});return h("div",{class:"toolbar"},i,h("div",{class:"spacer"}),...actions)}
export function row({title,subtitle,status,meta,actions=[],leading=null}){return h("div",{class:"row"},h("div",{class:"row-identity"},leading,h("div",{class:"row-copy"},h("div",{class:"row-title",text:title||"Sans titre"}),subtitle?h("div",{class:"row-sub",text:subtitle}):null)),h("div",{class:"row-cell optional"},status?badge(status):""),h("div",{class:"row-cell optional",text:meta||""}),h("div",{class:"row-actions"},...actions))}
export function jsonEditor(value,name="json"){return textarea(JSON.stringify(value||{},null,2),{name})}
export function safeJSON(raw,fallback={}){try{return JSON.parse(raw||"{}")}catch{return fallback}}
export function validateControls(...controls){
  const invalid=controls.flat().filter(control=>control&&typeof control.checkValidity==="function"&&!control.checkValidity());
  if(!invalid.length)return true;
  invalid[0].focus({preventScroll:false});invalid[0].reportValidity?.();return false;
}
export function advancedEditor(label,editor,copy="Réservé aux champs métier qui ne disposent pas encore d’un contrôle dédié."){return h("details",{class:"advanced-panel"},h("summary",{text:label}),h("div",{class:"advanced-panel-body"},h("p",{class:"muted",text:copy}),editor))}
