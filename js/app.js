import { focusTabs, focusHeader, renderSpaces } from "./focus-navigation.js";
import { configureMobile, openTools } from "./mobile.js";
import { openFocusSearch } from "./focus-search.js";
import { viewContext } from "./focus-state.js";
import { supportsRecord, renderRecord } from "./focus-records.js";
import { CORE_DOMAIN_BY_SECTION } from "./config.js";
import { authContext } from "./auth-flow.js";
import { state,setState,setRoute,subscribe,setAppearance } from "./store.js";
import { SECTIONS,NAV_AREAS,canAccessSection,canAccessSubpage,iconPath,realtimeURL,navigationAreaForSection,navigationAreaDestination } from "./config.js";
import { refreshSession,loadMe,loadWorkspace,loadDomainCatalog,hasStoredSession } from "./api.js";
import { renderAuth } from "./modules/auth.js";
import { h,icon,iconButton,emptyState,skeletonPage,toast,errorMessage,relativeDate,modal,announce,profileAvatar,roleLabel } from "./ui.js";

let refs={};let renderGeneration=0;let realtimeRefreshTimer=null;let uiReady=false;let uiSignature="";let swRegistration=null;let navigationPrefix=false;
const app=document.querySelector("#app");

function accessibleSections(){return Object.keys(SECTIONS).filter(key=>canAccessSection(key,state.user))}
function safeRoute(){
  const accessible=accessibleSections();
  if(!accessible.includes(state.route.section)){setRoute(accessible.includes("dashboard")?"dashboard":accessible[0]||"profile");return false}
  const section=SECTIONS[state.route.section];
  if(state.route.subpage&&section?.subpages&&!section.subpages.some(p=>p.id===state.route.subpage&&canAccessSubpage(p,state.user))){setRoute(state.route.section,section.subpages.find(p=>canAccessSubpage(p,state.user))?.id||"");return false}
  return true;
}
function displayName(user){return `${user?.firstName||user?.first_name||""} ${user?.lastName||user?.last_name||""}`.trim()||user?.email||"Membre"}
function navigationAreaItem(area){
  const active=area.sections.includes(state.route.section),destination=navigationAreaDestination(area,state.user);
  if(!destination||!canAccessSection(destination,state.user))return null;
  const section=SECTIONS[destination];
  return h("button",{class:`nav-item nav-area-item ${active?"active":""}`,type:"button","aria-current":active?"page":null,onClick:()=>setRoute(destination,section?.subpages?.find(page=>canAccessSubpage(page,state.user))?.id||"")},h("img",{class:"nav-icon",src:iconPath(area.icon,active),alt:"",width:19,height:19,decoding:"async"}),h("span",{class:"nav-label",text:area.title}));
}
function sidebarShortcut(label,section,iconName,subpage=""){
  if(!canAccessSection(section,state.user))return null;
  return h("button",{class:"sidebar-shortcut",type:"button","aria-label":`Ouvrir ${label}`,onClick:()=>setRoute(section,subpage)},icon(iconName,15),h("span",{text:label}));
}
function sidebarTeam(){
  if(!canAccessSection("team",state.user))return null;
  const members=(state.workspace?.team||[]).filter(Boolean).slice(0,4);
  if(!members.length)return null;
  return h("section",{class:"sidebar-team","aria-label":"Mon équipe"},
    h("div",{class:"studio-nav-heading"},h("span",{text:"Mon équipe"}),h("button",{type:"button","aria-label":"Ouvrir les membres de l’équipe",onClick:()=>setRoute("team","members")},icon("users",14))),
    ...members.map(member=>h("button",{class:"sidebar-person",type:"button","aria-label":`Ouvrir l’équipe · ${displayName(member)}`,onClick:()=>setRoute("team","members")},profileAvatar(member,{className:"sidebar-person-avatar",size:24,ariaHidden:true}),h("span",{text:displayName(member)}),h("i",{class:`presence-dot ${member.isActive===false?"offline":""}`})))
  );
}
function sidebar(){
  const u=state.user;const nav=h("nav",{"aria-label":"Navigation principale"});
  const canCreate=["OWNER","ADMIN"].includes(u?.role)||(u?.permissions||[]).some(permission=>/^(manage|create|sendMail)/.test(permission));
  nav.append(
    h("div",{class:"studio-nav-section native-nav-areas"},h("span",{class:"studio-nav-heading",text:"Workspace"}),...NAV_AREAS.map(navigationAreaItem).filter(Boolean)),
    h("section",{class:"studio-nav-section sidebar-files","aria-label":"Dossiers"},h("span",{class:"studio-nav-heading",text:"Dossiers"}),
      sidebarShortcut("Bibliothèque générale","resources","folder"),
      sidebarShortcut("Documents","documents","documents"),
      sidebarShortcut("Squared Docs","documents","document"),
      canAccessSection("documents",state.user)?h("button",{class:"sidebar-shortcut sidebar-create",type:"button",onClick:()=>setRoute("documents")},icon("add",14),h("span",{text:"Créer un dossier"})):null
    ),
    sidebarTeam()
  );
  return h("aside",{class:"sidebar"},
    h("div",{class:"brand"},h("img",{class:"brand-logo",src:"/assets/squaredgroup-logo.png",alt:"Squared Group",width:36,height:36,decoding:"async"}),h("div",{class:"brand-copy"},h("strong",{text:"Squared Workspace"}),h("span",{text:"v1.0.0"}))),
    h("div",{class:`sidebar-quick-actions ${canCreate?"":"no-create"}`},canCreate?h("button",{class:"sidebar-new",type:"button",onClick:openTools},icon("add",15),h("span",{text:"Nouveau"})):null,h("button",{class:"sidebar-quick-icon",type:"button","aria-label":"Rechercher dans Workspace",onClick:openCommand},icon("search",15)),notificationButton("Ouvrir les notifications"),h("button",{class:"sidebar-quick-icon",type:"button","aria-label":"Synchroniser le Workspace",onClick:event=>refreshWorkspace(event.currentTarget)},icon("sync",15))),
    nav,
    h("div",{class:"sidebar-footer"},h("button",{class:"sidebar-settings",type:"button",onClick:()=>setRoute("settings")},icon("settings",16),h("span",{text:"Paramètres"})),h("button",{class:"account-card",type:"button",onClick:()=>setRoute("profile")},profileAvatar(u,{className:"avatar",size:34,ariaHidden:true}),h("div",{class:"account-meta"},h("strong",{text:displayName(u)}),h("span",{text:u?.email||roleLabel(u?.role)})),icon("More",15)))
  );
}
function mobileTabs(){return focusTabs()}
function systemState(){
  const last=state.lastSyncAt?relativeDate(state.lastSyncAt):"Synchronisation";
  return h("div",{class:`system-state ${state.online?"":"offline"}`,role:"status","aria-live":"polite",title:state.online?`Dernière synchro ${last}`:"Connexion réseau indisponible"},h("i",{class:"state-dot"}),h("span",{text:state.online?(state.lastSyncAt?"Données chargées":"Connecté"):"Hors ligne"}),h("strong",{text:state.online?last:""}));
}
function unreadNotifications(){return (state.workspace?.notifications||[]).filter(value=>!(value?.isRead??value?.is_read??value?.payload?.isRead??value?.payload?.is_read)).length}
function notificationButton(label="Notifications"){
  const count=unreadNotifications();
  return h("button",{class:"icon-button notification-trigger",type:"button","aria-label":count?`${label}, ${count} non lue${count>1?"s":""}`:label,title:"Notifications",onClick:()=>setRoute("notifications")},icon("notification",17),count?h("span",{class:"notification-count",text:count>99?"99+":String(count)}):null);
}
async function refreshWorkspace(button){
  if(state.loading||!state.online)return;
  setState({loading:true});button.disabled=true;button.setAttribute("aria-busy","true");
  try{await Promise.all([loadWorkspace(),loadDomainCatalog().catch(()=>null)]);await renderCurrent({focus:false});toast("Workspace synchronisé")}
  catch(error){toast(errorMessage(error),"error",6000)}
  finally{setState({loading:false});if(button.isConnected){button.disabled=false;button.removeAttribute("aria-busy")}}
}
function topbar(){
  if(matchMedia("(max-width: 880px)").matches)return focusHeader({search:openCommand,tools:openTools,refresh:refreshWorkspace});
  const refresh=iconButton("sync","Actualiser les données",event=>refreshWorkspace(event.currentTarget));refresh.classList.add("desktop-only");
  const effectiveTheme=document.documentElement.dataset.theme||"dark";
  const greeting=h("div",{class:"native-greeting"},h("span",{class:"native-greeting-emoji","aria-hidden":"true",text:"👋"}),h("span",{text:`Bonjour, ${displayName(state.user)}`}));
  return h("header",{class:"topbar"},
    h("div",{class:"menu-toggle"},iconButton("grid","Ouvrir le menu",()=>setState({sidebarOpen:!state.sidebarOpen}))),
    h("div",{class:"native-history"},iconButton("ArrowLeft","Page précédente",()=>history.back()),iconButton("ArrowRight","Page suivante",()=>history.forward())),
    greeting,
    h("span",{class:"native-role",text:roleLabel(state.user?.role)}),
    h("button",{class:"native-global-search",type:"button","aria-label":"Recherche",onClick:openCommand},icon("search",15),h("span",{text:"Rechercher dans Workspace"}),h("kbd",{text:"⌘ K"})),
    h("div",{class:"top-actions"},systemState(),refresh,notificationButton(),iconButton("settings","Paramètres",()=>setRoute("settings")),iconButton(effectiveTheme==="light"?"moon":"sun","Changer de thème",()=>setAppearance({mode:effectiveTheme==="light"?"dark":"light"})),h("button",{class:"top-profile",type:"button","aria-label":"Ouvrir le profil",onClick:()=>setRoute("profile")},profileAvatar(state.user,{size:30,ariaHidden:true})),h("button",{class:"native-add",type:"button","aria-label":"Créer dans Workspace",onClick:openTools},icon("add",15)))
  );
}
function moduleTabs(){
  const area=navigationAreaForSection(state.route.section)||NAV_AREAS[0];
  const sections=area.sections.filter(key=>canAccessSection(key,state.user));
  if(!sections.length)return null;
  return h("nav",{class:"native-module-tabs","aria-label":`Navigation ${area.title}`},...sections.map(key=>{
    const active=key===state.route.section,section=SECTIONS[key];
    return h("button",{type:"button",class:active?"active":"","aria-current":active?"page":null,"aria-label":`Ouvrir ${section.title}`,onClick:()=>setRoute(key,section.subpages?.find(page=>canAccessSubpage(page,state.user))?.id||"")},h("span",{text:section.title}),key==="training"?h("small",{text:"BUILD"}):null);
  }));
}
function subnav(){
  if(state.route.item)return null;
  if(["tasks","missions"].includes(state.route.section)&&matchMedia("(max-width: 880px)").matches)return h("nav",{class:"subnav focus-work-switch","aria-label":"Travail"},...["tasks","projects","planning","missions"].filter(key=>canAccessSection(key,state.user)).map(key=>h("button",{type:"button",class:key===state.route.section?"active":"","aria-current":key===state.route.section?"page":null,text:SECTIONS[key].title,onClick:()=>setRoute(key,SECTIONS[key].subpages?.find(p=>canAccessSubpage(p,state.user))?.id||"")})));
  const s=SECTIONS[state.route.section];if(!s?.subpages?.length||s.internalNavigation)return null;const pages=s.subpages.filter(p=>canAccessSubpage(p,state.user));return h("nav",{class:"subnav","aria-label":`Sous-navigation ${s.title}`},...pages.map(page=>h("button",{class:state.route.subpage===page.id?"active":"",type:"button","aria-current":state.route.subpage===page.id?"page":null,onClick:()=>setRoute(state.route.section,page.id),text:page.title})))}
function buildShell(){
  if(!safeRoute())return;
  app.replaceChildren();
  const content=h("main",{id:"workspace-main",class:"content",tabindex:"-1","aria-busy":"true"},skeletonPage());
  const main=h("div",{class:"main"},topbar(),moduleTabs(),state.online?null:h("div",{class:"network-banner"},icon("warning",15),h("span",{text:"Connexion interrompue. Les données affichées restent visibles ; aucune action n’est envoyée automatiquement."})),content);
  const shell=h("div",{class:`workspace ${state.sidebarOpen?"sidebar-open":""}`},sidebar(),h("button",{class:"sidebar-backdrop",type:"button","aria-label":"Fermer le menu",onClick:()=>setState({sidebarOpen:false})}),main,mobileTabs());
  app.append(shell);refs={shell,content,main};renderCurrent();
}
function refreshChrome(){
  if(!refs.shell)return;
  refs.shell.querySelector(".sidebar")?.replaceWith(sidebar());
  refs.shell.querySelector(".topbar")?.replaceWith(topbar());
  refs.shell.querySelector(".native-module-tabs")?.replaceWith(moduleTabs());
  refs.shell.querySelector(".mobile-tabs")?.replaceWith(mobileTabs());
  refs.shell.classList.toggle("sidebar-open",state.sidebarOpen);
  const banner=refs.main.querySelector(".network-banner");
  if(!state.online&&!banner)refs.main.querySelector(".topbar")?.after(h("div",{class:"network-banner"},icon("warning",15),h("span",{text:"Connexion interrompue. Les données affichées restent visibles ; aucune action n’est envoyée automatiquement."})));
  if(state.online)banner?.remove();
}
window.addEventListener("sq:navigation-preferences",()=>{document.querySelectorAll(".sq-mobile-pins").forEach(node=>node.remove());refreshChrome();});
async function sectionPage(section,subpage){
  if(section==="spaces")return renderSpaces();
  if(section==="planning"&&subpage==="personal"){
    const {renderPersonalPlanning}=await import("./modules/personal-planning.js");return renderPersonalPlanning();
  }
  const domain=CORE_DOMAIN_BY_SECTION[section];
  if(state.route.item&&supportsRecord(domain))return renderRecord(domain,state.route.item);
  if(section==="dashboard"||section==="today"){const {renderDashboard}=await import("./modules/dashboard.js");return renderDashboard(section==="today")}
  if(section==="projects"&&subpage==="publication"){const {renderPublication}=await import("./modules/publication.js");return renderPublication()}
  if(section==="siteHelp"){const {renderHelpCenter}=await import("./modules/help-center.js");return renderHelpCenter(subpage||"overview")}
  if(section==="webContent"){const {renderCMSStudio}=await import("./modules/cms-studio.js");return renderCMSStudio(subpage||"overview")}
  if(SECTIONS[section]?.cms){const {renderCMS}=await import("./modules/cms.js");return renderCMS(section)}
  if(section==="mailbox"){const {renderMailbox}=await import("./modules/mailbox.js");return renderMailbox(subpage||"mailbox")}
  if(section==="messages"){const {renderMessages}=await import("./modules/messages.js");return renderMessages()}
  if(section==="support"&&["","tickets-clients","demandes-internes"].includes(subpage)){const {renderSupport}=await import("./modules/support.js");return renderSupport(subpage||"tickets-clients")}
  if(section==="notifications"){const {renderNotifications}=await import("./modules/notifications.js");return renderNotifications()}
  if(section==="training"){const {renderTraining}=await import("./modules/training.js");return renderTraining()}
  if(section==="profile"||section==="settings"){const module=await import("./modules/profile.js");return section==="profile"?module.renderProfile():module.renderSettings(subpage)}
  if(section==="people"){const {renderPeople}=await import("./modules/people.js");return renderPeople(subpage)}
  if(section==="siteNewsletter"){const {renderNewsletter}=await import("./modules/newsletter.js");return renderNewsletter()}
  if(section==="securityOperations"){const {renderSecurity}=await import("./modules/security.js");return renderSecurity(subpage)}
  if(section==="team"&&subpage==="members"){const {renderTeam}=await import("./modules/team.js");return renderTeam(subpage)}
  const {renderDataSection}=await import("./modules/data.js");return renderDataSection(section,subpage);
}
let renderedRouteKey="";
async function renderCurrent({focus=true}={}){
  if(!refs.content||!safeRoute())return;
  if(renderedRouteKey&&refs.content.getAttribute("aria-busy")!=="true")viewContext("scroll:"+renderedRouteKey).y=window.scrollY;
  const route={...state.route},key=JSON.stringify(route),generation=++renderGeneration;
  const returnY=viewContext("scroll:"+key,{y:0}).y;
  refs.content.setAttribute("aria-busy","true");
  // Keep a loaded page visible during background refreshes and resizing.
  // Navigation to a different page still gets an explicit loading state.
  if(focus||renderedRouteKey!==key||!refs.content.children.length)refs.content.replaceChildren(skeletonPage());
  try{
    const page=await sectionPage(route.section,route.subpage);
    if(generation!==renderGeneration||!refs.content)return;
    const apply=()=>{
      refs.content.replaceChildren(page);
      const nav=subnav();if(nav)page.insertBefore(nav,page.children[1]||null);
      refs.content.setAttribute("aria-busy","false");renderedRouteKey=key;
      document.title=`${SECTIONS[route.section]?.title||"Workspace"} — Squared Workspace`;
    };
    // Show the ready page immediately. Animating a snapshot of the loading
    // placeholder can keep it above the new content during navigation.
    apply();
    if(generation!==renderGeneration)return;
    requestAnimationFrame(()=>{if(generation===renderGeneration)window.scrollTo({top:returnY,behavior:"instant"});});
    if(focus&&!document.querySelector("#portal-root > .overlay")){refs.content.focus({preventScroll:true});announce(`${SECTIONS[route.section]?.title||"Workspace"} chargé`);}
  }catch(error){if(generation!==renderGeneration||!refs.content)return;refs.content.setAttribute("aria-busy","false");refs.content.replaceChildren(emptyState("Chargement impossible",errorMessage(error),"warning"));}
}
function openCommand(){
  if(!uiReady||!state.user)return;
  openFocusSearch({refresh:refreshData,theme:()=>setAppearance({mode:document.documentElement.dataset.theme==="light"?"dark":"light"})});
}
async function refreshData(){
  if(state.loading||!state.online)return;
  const placeholder=h("button");await refreshWorkspace(placeholder);
}
configureMobile({refresh:refreshData,search:openCommand});
async function registerServiceWorker(){
  if(!("serviceWorker" in navigator))return;
  try{const registration=await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});swRegistration=registration;registration.waiting?.postMessage({type:"SKIP_WAITING"});await registration.update().catch(()=>{})}catch{}
}
async function ensureLatestRelease(){
  const current=document.querySelector('meta[name="sq-release"]')?.content;
  if(!current||current==="__SQUARED_RELEASE__")return false;
  try{
    const response=await fetch(`/release.json?check=${Date.now()}`,{cache:"no-store",headers:{"Cache-Control":"no-cache"}});
    if(!response.ok)return false;
    const latest=(await response.json())?.release;
    if(!latest||latest===current){sessionStorage.removeItem("sq-release-requested");return false}
    const target=new URL(location.href);target.searchParams.set("release",latest);sessionStorage.setItem("sq-release-requested",latest);location.replace(target.href);return true;
  }catch{return false}
}
let realtimeReconnectTimer=null;let reconnectDelay=1000;
function stopRealtime(){clearTimeout(realtimeReconnectTimer);clearTimeout(realtimeRefreshTimer);const old=state.realtime;state.realtime=null;try{old?.close()}catch{}}
async function refreshRealtimeView(type){
  if(type!=="personal_planning.changed"&&type!=="mail.changed")await loadWorkspace();
  if(state.route.section==="messages")window.dispatchEvent(new Event("sq:messages-refresh"));
  else await renderCurrent({focus:false});
}
function connectRealtime(){
  if(!uiReady||!state.accessToken||!state.online)return;stopRealtime();const wsURL=realtimeURL();wsURL.searchParams.set("accessToken",state.accessToken);
  try{
    const socket=new WebSocket(wsURL);state.realtime=socket;
    socket.addEventListener("open",()=>{reconnectDelay=1000;refreshChrome()});
    socket.addEventListener("message",event=>{if(socket!==state.realtime)return;let message;try{message=JSON.parse(event.data)}catch{return}const type=message.type;if(type==="communication.changed"&&!(["messages","dashboard","today","notifications","activity","support"].includes(state.route.section)))return;clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(async()=>{if(socket!==state.realtime)return;try{await refreshRealtimeView(type)}catch{}},type==="connected"?0:180)});
    socket.addEventListener("close",()=>{if(socket!==state.realtime)return;state.realtime=null;if(uiReady&&state.accessToken&&state.online){realtimeReconnectTimer=setTimeout(connectRealtime,reconnectDelay);reconnectDelay=Math.min(30000,reconnectDelay*2)}});
  }catch{}
}
async function authenticated(){await Promise.all([loadMe(),loadWorkspace(),loadDomainCatalog().catch(()=>null)]);if(!state.user||!state.accessToken)return;uiReady=true;buildShell();uiSignature=signature();connectRealtime()}
function resetInterface(reason=""){renderedRouteKey="";uiReady=false;uiSignature="";renderGeneration++;refs={};stopRealtime();document.querySelector("#portal-root")?.replaceChildren();document.querySelectorAll(".overlay").forEach(node=>node.remove());document.querySelector(".toast-stack")?.replaceChildren();if(app)app.inert=false;renderAuth(authenticated,{message:reason==="expired"?"Votre session a expiré. Reconnectez-vous.":""})}
window.addEventListener("sq:session-ended",event=>resetInterface(event.detail?.reason));window.addEventListener("offline",stopRealtime);window.addEventListener("online",()=>{if(uiReady)connectRealtime()});
async function bootstrap(){if(await ensureLatestRelease())return;registerServiceWorker();const restoring=!authContext.action&&hasStoredSession();renderAuth(authenticated,{restoring});if(!restoring)return;try{await refreshSession();await authenticated()}catch(error){if(error.name!=="AbortError")renderAuth(authenticated,{message:errorMessage(error)})}}
window.addEventListener("keydown",event=>{
  const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||"")||document.activeElement?.isContentEditable;
  if(((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k")||(!editing&&event.key==="/")){event.preventDefault();openCommand()}
  if(!editing&&!event.metaKey&&!event.ctrlKey&&!event.altKey){
    const key=event.key.toLowerCase();
    if(navigationPrefix&&key==="d"){event.preventDefault();navigationPrefix=false;setRoute("dashboard")}
    else if(key==="g"){navigationPrefix=true;setTimeout(()=>{navigationPrefix=false},900)}
    else navigationPrefix=false;
  }
  if(event.key==="Escape"&&!document.querySelector(".overlay")&&state.sidebarOpen)setState({sidebarOpen:false});
});
window.addEventListener("pageshow",()=>{ensureLatestRelease()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){swRegistration?.update().catch(()=>{});ensureLatestRelease();if(uiReady&&state.online)refreshRealtimeView("connected").catch(()=>{})}});
setInterval(()=>{if(uiReady&&state.user)refreshChrome()},60*1000);
function signature(){return JSON.stringify({profileRevision:state.profileRevision||0,route:state.route,closedGroups:state.closedGroups,sidebarOpen:state.sidebarOpen,appearance:state.appearance,online:state.online,lastSyncAt:state.lastSyncAt?.toISOString?.(),user:[state.user?.firstName,state.user?.first_name,state.user?.lastName,state.user?.last_name,state.user?.email,state.user?.role]})}
subscribe(()=>{if(!uiReady||!state.user)return;const before=uiSignature?JSON.parse(uiSignature):{};const next=signature();if(next===uiSignature)return;const after=JSON.parse(next);uiSignature=next;if(!refs.shell){buildShell();return}const routeChanged=JSON.stringify(before.route)!==JSON.stringify(after.route);refreshChrome();if(routeChanged)renderCurrent({focus:true})});
matchMedia("(max-width: 880px)").addEventListener("change",()=>{if(uiReady){refreshChrome();if(!document.querySelector(".overlay"))renderCurrent({focus:false});}});
bootstrap().catch(error=>{resetInterface();toast(errorMessage(error),"error")});
