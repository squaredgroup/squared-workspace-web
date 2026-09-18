import { state,setState,setRoute,setOpenGroup,subscribe,setAppearance } from "./store.js";
import { SECTIONS,NAV_GROUPS,SECTION_DESCRIPTIONS,canAccessSection,canAccessSubpage,iconPath,realtimeURL } from "./config.js";
import { refreshSession,loadMe,loadWorkspace,loadDomainCatalog,logout } from "./api.js";
import { renderAuth } from "./modules/auth.js";
import { renderDashboard } from "./modules/dashboard.js";
import { renderDataSection } from "./modules/data.js";
import { renderPublication } from "./modules/publication.js";
import { renderCMS } from "./modules/cms.js";
import { renderMailbox } from "./modules/mailbox.js";
import { renderMessages } from "./modules/messages.js";
import { renderTraining } from "./modules/training.js";
import { renderProfile,renderSettings } from "./modules/profile.js";
import { renderPeople } from "./modules/people.js";
import { renderNewsletter } from "./modules/newsletter.js";
import { renderSecurity } from "./modules/security.js";
import { renderTeam } from "./modules/team.js";
import { h,icon,iconButton,button,emptyState,skeletonPage,toast,errorMessage } from "./ui.js";

let refs={};let renderGeneration=0;let realtimeRefreshTimer=null;let uiReady=false;let uiSignature="";
const app=document.querySelector("#app");

function accessibleSections(){return Object.keys(SECTIONS).filter(key=>canAccessSection(key,state.user));}
function safeRoute(){
  const accessible=accessibleSections();
  if(!accessible.includes(state.route.section)){setRoute(accessible.includes("dashboard")?"dashboard":accessible[0]||"profile");return false}
  const section=SECTIONS[state.route.section];
  if(state.route.subpage&&section?.subpages&&!section.subpages.some(p=>p.id===state.route.subpage&&canAccessSubpage(p,state.user))){setRoute(state.route.section,section.subpages.find(p=>canAccessSubpage(p,state.user))?.id||"");return false}
  return true;
}
function initials(user){return `${user?.firstName||user?.first_name||""} ${user?.lastName||user?.last_name||""}`.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase()||"SQ"}
function displayName(user){return `${user?.firstName||user?.first_name||""} ${user?.lastName||user?.last_name||""}`.trim()||user?.email||"Membre"}

function navGroup(group){
  const visible=group.sections.filter(key=>canAccessSection(key,state.user));if(!visible.length)return null;const open=state.openGroup===group.name;
  const container=h("div",{class:`nav-group ${open?"open":""}`});
  container.append(h("button",{class:"nav-group-head",type:"button",onClick:()=>setOpenGroup(open?"":group.name)},h("span",{text:group.name}),h("span",{text:"⌄"})));
  const items=h("div",{class:"nav-items"});
  for(const key of visible){const s=SECTIONS[key];items.append(h("button",{class:`nav-item ${state.route.section===key?"active":""}`,type:"button",onClick:()=>{if(state.openGroup!==group.name)setOpenGroup(group.name);setRoute(key,s.subpages?.find(p=>canAccessSubpage(p,state.user))?.id||"")}},h("img",{class:"nav-icon",src:iconPath(key),alt:""}),h("span",{class:"nav-label",text:s.title})));}
  container.append(items);return container;
}

function sidebar(){const u=state.user;const nav=h("nav",{});for(const group of NAV_GROUPS){const node=navGroup(group);if(node)nav.append(node)}return h("aside",{class:"sidebar"},h("div",{class:"brand"},h("img",{class:"brand-logo",src:"/assets/squaredgroup-logo.png",alt:"Squared Group"}),h("div",{class:"brand-copy"},h("strong",{text:"Squared Workspace"}),h("span",{text:"Executive operating system"}))),h("button",{class:"sidebar-search",type:"button",onClick:openCommand},icon("search",16),h("span",{text:"Rechercher"}),h("span",{class:"shortcut",text:"⌘ K"})),nav,h("div",{class:"sidebar-footer"},h("button",{class:"account-card",type:"button",onClick:()=>setRoute("profile")},h("div",{class:"avatar",text:initials(u)}),h("div",{class:"account-meta"},h("strong",{text:displayName(u)}),h("span",{text:u?.role||"Workspace"})))))}

function mobileTabs(){const keys=["dashboard","projects","tasks","messages","profile"].filter(k=>canAccessSection(k,state.user));return h("div",{class:"mobile-tabs"},...keys.map(key=>h("button",{class:state.route.section===key?"active":"",type:"button","aria-label":SECTIONS[key].title,onClick:()=>setRoute(key)},h("img",{class:"icon",src:iconPath(key),alt:""}))))}
function topbar(){const s=SECTIONS[state.route.section]||{};return h("header",{class:"topbar"},iconButton("grid","Ouvrir le menu",()=>setState({sidebarOpen:!state.sidebarOpen})),h("div",{class:"breadcrumbs"},h("div",{class:"eyebrow",text:s.group||"Workspace"}),h("div",{class:"top-title",text:s.title||"Squared Workspace"})),h("div",{class:"top-actions"},h("span",{class:"badge",text:state.online?"En ligne":"Hors ligne"}),iconButton(state.appearance.mode==="light"?"moon":"sun","Changer de thème",()=>setAppearance({mode:state.appearance.mode==="light"?"dark":"light"})),iconButton("search","Recherche",openCommand),iconButton("logout","Déconnexion",async()=>{await logout();renderAuth(authenticated)})))}

function subnav(){const s=SECTIONS[state.route.section];if(!s?.subpages?.length)return null;const pages=s.subpages.filter(p=>canAccessSubpage(p,state.user));return h("div",{class:"subnav"},...pages.map(page=>h("button",{class:state.route.subpage===page.id?"active":"",type:"button",onClick:()=>setRoute(state.route.section,page.id),text:page.title}))}

function buildShell(){if(!safeRoute())return;app.replaceChildren();const content=h("main",{class:"content"},skeletonPage());const main=h("div",{class:"main"},topbar(),content);const shell=h("div",{class:`workspace ${state.sidebarOpen?"sidebar-open":""}`},sidebar(),main,mobileTabs());app.append(shell);refs={shell,content,main};renderCurrent();}
function refreshChrome(){if(!refs.shell)return;const nextSide=sidebar();refs.shell.querySelector(".sidebar")?.replaceWith(nextSide);const nextTop=topbar();refs.shell.querySelector(".topbar")?.replaceWith(nextTop);refs.shell.querySelector(".mobile-tabs")?.replaceWith(mobileTabs());refs.shell.classList.toggle("sidebar-open",state.sidebarOpen)}

async function renderCurrent(){if(!refs.content||!safeRoute())return;const generation=++renderGeneration;refs.content.replaceChildren(skeletonPage());const section=state.route.section,sub=state.route.subpage;try{let page;
  if(section==="dashboard")page=await renderDashboard(false);else if(section==="today")page=await renderDashboard(true);else if(section==="projects"&&sub==="publication")page=await renderPublication();else if(SECTIONS[section]?.cms)page=await renderCMS(section);else if(section==="mailbox")page=await renderMailbox(sub||"mailbox");else if(section==="messages")page=await renderMessages();else if(section==="training")page=await renderTraining();else if(section==="profile")page=await renderProfile();else if(section==="settings")page=await renderSettings();else if(section==="people")page=await renderPeople(sub);else if(section==="siteNewsletter")page=await renderNewsletter();else if(section==="securityOperations")page=await renderSecurity(sub);else if(section==="team"&&sub==="members")page=await renderTeam(sub);else page=await renderDataSection(section,sub);
  if(generation!==renderGeneration)return;refs.content.replaceChildren(page);const sn=subnav();if(sn)page.insertBefore(sn,page.children[1]||null);document.title=`${SECTIONS[section]?.title||"Workspace"} — Squared Workspace`;
 }catch(error){if(generation!==renderGeneration)return;refs.content.replaceChildren(emptyState("Impossible de charger la page",errorMessage(error),"warning"))}}

function openCommand(){
  if(document.querySelector(".command"))return;const overlay=h("div",{class:"overlay"});const panel=h("div",{class:"modal command"});const query=h("input",{class:"command-input",placeholder:"Rechercher une page, un outil, une fonction…",autocomplete:"off"});const results=h("div",{class:"command-results"});panel.append(query,results);overlay.append(panel);document.querySelector("#portal-root").append(overlay);const close=()=>overlay.remove();overlay.addEventListener("mousedown",e=>{if(e.target===overlay)close()});
  const draw=()=>{const q=query.value.toLowerCase();const values=accessibleSections().filter(k=>`${SECTIONS[k].title} ${SECTIONS[k].group} ${SECTION_DESCRIPTIONS[k]||""}`.toLowerCase().includes(q));results.replaceChildren(...values.map(key=>h("button",{class:"command-result",type:"button",onClick:()=>{close();setRoute(key,SECTIONS[key].subpages?.find(p=>canAccessSubpage(p,state.user))?.id||"")}},h("img",{class:"icon",src:iconPath(key),alt:""}),h("span",{},SECTIONS[key].title,h("small",{text:SECTIONS[key].group})))));if(!values.length)results.append(emptyState("Aucun résultat","Essayez un autre terme.","search"))};query.addEventListener("input",draw);draw();setTimeout(()=>query.focus(),20);
}

async function connectRealtime(){try{state.realtime?.close();if(!state.accessToken)return;const wsURL=realtimeURL();wsURL.searchParams.set("accessToken",state.accessToken);const socket=new WebSocket(wsURL);setState({realtime:socket});socket.addEventListener("message",event=>{let message;try{message=JSON.parse(event.data)}catch{return}if(message.type==="connected")return;clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(async()=>{try{await loadWorkspace();if(["dashboard","today","messages","notifications","activity"].includes(state.route.section))renderCurrent()}catch{/* next request retries */}},500)});socket.addEventListener("close",()=>{if(state.accessToken)setTimeout(connectRealtime,5000)});}catch{/* realtime is additive; HTTP remains authoritative */}}

async function authenticated(){try{await Promise.all([loadMe(),loadWorkspace(),loadDomainCatalog().catch(()=>null)]);uiReady=true;buildShell();uiSignature=signature();connectRealtime()}catch(error){uiReady=false;toast(errorMessage(error),"error");renderAuth(authenticated)}}
async function bootstrap(){
  if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").then(reg=>reg.update()).catch(()=>{});
  const params=new URLSearchParams(location.search);
  const publicAuthAction=params.has("auth") || location.pathname==="/reinitialisation" || location.pathname==="/verification-email";
  renderAuth(authenticated);
  if(publicAuthAction)return;
  try{await refreshSession();await authenticated()}catch{/* login is already visible */}
}

window.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommand()}if(e.key==="Escape")document.querySelector(".overlay")?.remove()});
function signature(){return JSON.stringify({route:state.route,openGroup:state.openGroup,sidebarOpen:state.sidebarOpen,appearance:state.appearance,online:state.online,user:[state.user?.firstName,state.user?.first_name,state.user?.lastName,state.user?.last_name,state.user?.email,state.user?.role]})}
subscribe(()=>{
  if(!uiReady||!state.user)return;
  const before=uiSignature?JSON.parse(uiSignature):{};const next=signature();if(next===uiSignature)return;const after=JSON.parse(next);uiSignature=next;
  if(!refs.shell){buildShell();return}
  const routeChanged=JSON.stringify(before.route)!==JSON.stringify(after.route);
  refreshChrome();if(routeChanged)renderCurrent();
});
bootstrap();
