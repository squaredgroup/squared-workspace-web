import { authContext } from "./auth-flow.js";
import { state,setState,setRoute,setGroupOpen,subscribe,setAppearance } from "./store.js";
import { SECTIONS,NAV_GROUPS,SECTION_DESCRIPTIONS,canAccessSection,canAccessSubpage,iconPath,realtimeURL } from "./config.js";
import { refreshSession,loadMe,loadWorkspace,loadDomainCatalog,logout,hasStoredSession } from "./api.js";
import { renderAuth } from "./modules/auth.js";
import { h,icon,iconButton,emptyState,skeletonPage,toast,errorMessage,relativeDate,modal,announce,profileAvatar } from "./ui.js";

let refs={};let renderGeneration=0;let realtimeRefreshTimer=null;let uiReady=false;let uiSignature="";let swRegistration=null;let updateBanner=null;let navigationPrefix=false;let activeViewTransition=null;
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
function activeSubpage(){
  const section=SECTIONS[state.route.section];
  return section?.subpages?.find(p=>p.id===state.route.subpage);
}
function groupId(group){return "nav-group-"+group.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi,"-").toLowerCase()}
function navGroup(group){
  const visible=group.sections.filter(key=>canAccessSection(key,state.user));if(!visible.length)return null;
  const open=!state.closedGroups?.[group.name],id=groupId(group),container=h("div",{class:`nav-group ${open?"open":""}`});
  container.append(h("button",{class:"nav-group-head",type:"button","aria-expanded":String(open),"aria-controls":id,onClick:()=>setGroupOpen(group.name,!open)},h("span",{text:group.name}),h("img",{class:"group-chevron",src:iconPath("ChevronDown"),alt:"",width:14,height:14})));
  const items=h("div",{id,class:"nav-items",hidden:!open});
  if(open)for(const key of visible){const section=SECTIONS[key];items.append(h("button",{class:`nav-item ${state.route.section===key?"active":""}`,type:"button","aria-current":state.route.section===key?"page":null,onClick:()=>setRoute(key,section.subpages?.find(page=>canAccessSubpage(page,state.user))?.id||"")},h("img",{class:"nav-icon",src:iconPath(key),alt:"",width:18,height:18,decoding:"async"}),h("span",{class:"nav-label",text:section.title})))}
  container.append(items);return container;
}
function sidebar(){
  const u=state.user;const nav=h("nav",{"aria-label":"Navigation principale"});
  for(const group of NAV_GROUPS){const node=navGroup(group);if(node)nav.append(node)}
  return h("aside",{class:"sidebar"},
    h("div",{class:"brand"},h("img",{class:"brand-logo",src:"/assets/squaredgroup-logo.png",alt:"Squared Group",width:42,height:42,decoding:"async"}),h("div",{class:"brand-copy"},h("strong",{text:"Squared Workspace"}),h("span",{},h("i",{class:"brand-dot"}),"Operating system")),h("span",{class:"version-pill",text:"V7"})),
    h("button",{class:"sidebar-search",type:"button",onClick:openCommand},icon("search",16),h("span",{text:"Rechercher"}),h("span",{class:"shortcut",text:"⌘ K"})),
    h("div",{class:"sidebar-context"},h("span",{text:"Espace actif"}),h("strong",{text:state.workspace?.workspace?.name||"Squared Group"}),h("small",{text:`${accessibleSections().length} espaces autorisés`})),
    nav,
    h("div",{class:"sidebar-footer"},h("button",{class:"account-card",type:"button",onClick:()=>setRoute("profile")},profileAvatar(u,{className:"avatar",size:36,ariaHidden:true}),h("div",{class:"account-meta"},h("strong",{text:displayName(u)}),h("span",{text:u?.role||"Workspace"}))))
  );
}
function mobileTabs(){const keys=["dashboard","projects","tasks","messages"].filter(k=>canAccessSection(k,state.user));return h("nav",{class:"mobile-tabs","aria-label":"Navigation mobile"},...keys.map(key=>h("button",{class:state.route.section===key?"active":"",type:"button","aria-label":SECTIONS[key].title,"aria-current":state.route.section===key?"page":null,onClick:()=>setRoute(key)},h("img",{class:"icon",src:iconPath(key),alt:"",width:19,height:19}),h("span",{text:SECTIONS[key].title}))),h("button",{class:state.sidebarOpen?"active":"",type:"button","aria-label":"Plus de rubriques","aria-expanded":String(state.sidebarOpen),onClick:()=>setState({sidebarOpen:!state.sidebarOpen})},icon("grid",19),h("span",{text:"Plus"})))}
function systemState(){
  const last=state.lastSyncAt?relativeDate(state.lastSyncAt):"Synchronisation";
  return h("div",{class:`system-state ${state.online?"":"offline"}`,role:"status","aria-live":"polite",title:state.online?`Dernière synchro ${last}`:"Connexion réseau indisponible"},h("i",{class:"state-dot"}),h("span",{text:state.online?"Synchronisé":"Hors ligne"}),h("strong",{text:state.online?last:""}));
}
function unreadNotifications(){return (state.workspace?.notifications||[]).filter(value=>!(value?.isRead??value?.is_read??value?.payload?.isRead??value?.payload?.is_read)).length}
function notificationButton(){
  const count=unreadNotifications();
  return h("button",{class:"icon-button notification-trigger",type:"button","aria-label":count?`Notifications, ${count} non lue${count>1?"s":""}`:"Notifications",title:"Notifications",onClick:()=>setRoute("notifications")},icon("notification",17),count?h("span",{class:"notification-count",text:count>99?"99+":String(count)}):null);
}
async function refreshWorkspace(button){
  if(state.loading||!state.online)return;
  setState({loading:true});button.disabled=true;button.setAttribute("aria-busy","true");
  try{await Promise.all([loadWorkspace(),loadDomainCatalog().catch(()=>null)]);await renderCurrent({focus:false});toast("Workspace synchronisé")}
  catch(error){toast(errorMessage(error),"error",6000)}
  finally{setState({loading:false});if(button.isConnected){button.disabled=false;button.removeAttribute("aria-busy")}}
}
function topbar(){
  const section=SECTIONS[state.route.section]||{};const sub=activeSubpage();
  const refresh=iconButton("sync","Actualiser les données",event=>refreshWorkspace(event.currentTarget));refresh.classList.add("desktop-only");
  const effectiveTheme=document.documentElement.dataset.theme||"dark";
  return h("header",{class:"topbar"},
    h("div",{class:"menu-toggle"},iconButton("grid","Ouvrir le menu",()=>setState({sidebarOpen:!state.sidebarOpen}))),
    h("div",{class:"breadcrumbs"},h("div",{class:"breadcrumb-line"},h("span",{text:section.group||"Workspace"}),sub?h("span",{class:"separator",text:"/"}):null,sub?h("span",{text:sub.title}):null),h("div",{class:"top-title",text:section.title||"Squared Workspace"})),
    h("div",{class:"top-actions"},systemState(),refresh,notificationButton(),iconButton(effectiveTheme==="light"?"moon":"sun","Changer de thème",()=>setAppearance({mode:effectiveTheme==="light"?"dark":"light"})),iconButton("search","Recherche",openCommand),iconButton("logout","Déconnexion",async()=>{await logout()}))
  );
}
function subnav(){const s=SECTIONS[state.route.section];if(!s?.subpages?.length)return null;const pages=s.subpages.filter(p=>canAccessSubpage(p,state.user));return h("nav",{class:"subnav","aria-label":`Sous-navigation ${s.title}`},...pages.map(page=>h("button",{class:state.route.subpage===page.id?"active":"",type:"button","aria-current":state.route.subpage===page.id?"page":null,onClick:()=>setRoute(state.route.section,page.id),text:page.title})))}
function buildShell(){
  if(!safeRoute())return;
  app.replaceChildren();
  const content=h("main",{id:"workspace-main",class:"content",tabindex:"-1","aria-busy":"true"},skeletonPage());
  const main=h("div",{class:"main"},topbar(),state.online?null:h("div",{class:"network-banner"},icon("warning",15),h("span",{text:"Connexion interrompue. Les données affichées restent visibles, les actions serveur reprendront dès le retour du réseau."})),content);
  const shell=h("div",{class:`workspace ${state.sidebarOpen?"sidebar-open":""}`},sidebar(),h("button",{class:"sidebar-backdrop",type:"button","aria-label":"Fermer le menu",onClick:()=>setState({sidebarOpen:false})}),main,mobileTabs());
  app.append(shell);refs={shell,content,main};renderCurrent();
}
function refreshChrome(){
  if(!refs.shell)return;
  refs.shell.querySelector(".sidebar")?.replaceWith(sidebar());
  refs.shell.querySelector(".topbar")?.replaceWith(topbar());
  refs.shell.querySelector(".mobile-tabs")?.replaceWith(mobileTabs());
  refs.shell.classList.toggle("sidebar-open",state.sidebarOpen);
  const banner=refs.main.querySelector(".network-banner");
  if(!state.online&&!banner)refs.main.querySelector(".topbar")?.after(h("div",{class:"network-banner"},icon("warning",15),h("span",{text:"Connexion interrompue. Les données affichées restent visibles, les actions serveur reprendront dès le retour du réseau."})));
  if(state.online)banner?.remove();
}
async function sectionPage(section,subpage){
  if(section==="dashboard"||section==="today"){const {renderDashboard}=await import("./modules/dashboard.js");return renderDashboard(section==="today")}
  if(section==="projects"&&subpage==="publication"){const {renderPublication}=await import("./modules/publication.js");return renderPublication()}
  if(SECTIONS[section]?.cms){const {renderCMS}=await import("./modules/cms.js");return renderCMS(section)}
  if(section==="mailbox"){const {renderMailbox}=await import("./modules/mailbox.js");return renderMailbox(subpage||"mailbox")}
  if(section==="messages"){const {renderMessages}=await import("./modules/messages.js");return renderMessages()}
  if(section==="notifications"){const {renderNotifications}=await import("./modules/notifications.js");return renderNotifications()}
  if(section==="training"){const {renderTraining}=await import("./modules/training.js");return renderTraining()}
  if(section==="profile"||section==="settings"){const module=await import("./modules/profile.js");return section==="profile"?module.renderProfile():module.renderSettings()}
  if(section==="people"){const {renderPeople}=await import("./modules/people.js");return renderPeople(subpage)}
  if(section==="siteNewsletter"){const {renderNewsletter}=await import("./modules/newsletter.js");return renderNewsletter()}
  if(section==="securityOperations"){const {renderSecurity}=await import("./modules/security.js");return renderSecurity(subpage)}
  if(section==="team"&&subpage==="members"){const {renderTeam}=await import("./modules/team.js");return renderTeam(subpage)}
  const {renderDataSection}=await import("./modules/data.js");return renderDataSection(section,subpage);
}
async function renderCurrent({focus=true}={}){
  if(!refs.content||!safeRoute())return;
  const generation=++renderGeneration;refs.content.setAttribute("aria-busy","true");refs.content.replaceChildren(skeletonPage());const section=state.route.section,subpage=state.route.subpage;
  try{const page=await sectionPage(section,subpage);if(generation!==renderGeneration)return;const apply=()=>{refs.content.replaceChildren(page);const nav=subnav();if(nav)page.insertBefore(nav,page.children[1]||null);refs.content.setAttribute("aria-busy","false");document.title=`${SECTIONS[section]?.title||"Workspace"} — Squared Workspace`};if(document.startViewTransition&&!state.appearance.reducedMotion&&!activeViewTransition){const transition=document.startViewTransition(apply);activeViewTransition=transition;transition.finished.catch(()=>{}).finally(()=>{if(activeViewTransition===transition)activeViewTransition=null})}else apply();window.scrollTo({top:0,behavior:"instant"});if(focus){refs.content.focus({preventScroll:true});announce(`${SECTIONS[section]?.title||"Workspace"} chargé`)}}
  catch(error){if(generation!==renderGeneration)return;refs.content.replaceChildren(emptyState("Chargement impossible",errorMessage(error),"warning"));refs.content.setAttribute("aria-busy","false");toast(errorMessage(error),"error",6000)}
}
function commandEntries(){
  const entries=[];
  for(const key of accessibleSections()){
    const section=SECTIONS[key];entries.push({kind:"page",section:key,subpage:"",title:section.title,group:section.group||"Workspace",description:SECTION_DESCRIPTIONS[key]||""});
    for(const sub of section.subpages||[])if(canAccessSubpage(sub,state.user))entries.push({kind:"page",section:key,subpage:sub.id,title:sub.title,group:section.title,description:sub.summary||""});
  }
  const routeByCollection={projects:"projects",tasks:"tasks",missions:"missions",validations:"validations",deliverables:"deliverables",notifications:"notifications",conversations:"messages"};
  for(const [collection,section] of Object.entries(routeByCollection))for(const item of (state.workspace?.[collection]||[]).slice(0,30))entries.push({kind:"record",section,subpage:"",title:item.title||item.name||item.subject||"Sans titre",group:SECTIONS[section]?.title||"Workspace",description:item.preview||item.description||item.body||item.status||"Élément synchronisé"});
  entries.unshift(
    {kind:"action",title:"Actualiser les données",group:"Action rapide",description:"Synchroniser Workspace maintenant",icon:"sync",run:async()=>{try{await Promise.all([loadWorkspace(),loadDomainCatalog().catch(()=>null)]);await renderCurrent({focus:false});toast("Workspace synchronisé")}catch(error){toast(errorMessage(error),"error")}}},
    {kind:"action",title:"Changer de thème",group:"Action rapide",description:"Basculer entre les thèmes clair et sombre",icon:"sun",run:()=>{const theme=document.documentElement.dataset.theme||"dark";setAppearance({mode:theme==="light"?"dark":"light"})}},
    {kind:"action",title:"Ouvrir mon profil",group:"Action rapide",description:"Identité, coordonnées et sécurité",icon:"user",run:()=>setRoute("profile")}
  );
  return entries;
}
function openCommand(){
  if(!uiReady||!state.user||document.querySelector(".command"))return;
  const listId="workspace-command-results",query=h("input",{class:"command-input",type:"search",placeholder:"Rechercher une page, un outil, une fonction…",autocomplete:"off",role:"combobox","aria-label":"Rechercher dans Workspace","aria-controls":listId,"aria-expanded":"true","aria-autocomplete":"list"});
  const results=h("div",{id:listId,class:"command-results",role:"listbox","aria-label":"Résultats de recherche"}),dialog=modal({title:"Recherche Workspace",content:h("div",{class:"command-body"},query,results),className:"command",initialFocus:".command-input"});
  let values=[],activeIndex=0;
  const activate=index=>{const value=values[index];if(!value)return;dialog.close();if(value.run)value.run();else setRoute(value.section,value.subpage)};
  const draw=()=>{const q=query.value.trim().toLowerCase();values=commandEntries().filter(value=>`${value.title} ${value.group} ${value.description}`.toLowerCase().includes(q)).slice(0,24);activeIndex=Math.min(activeIndex,Math.max(0,values.length-1));results.replaceChildren(...values.map((value,index)=>{const id=`workspace-command-option-${index}`;return h("div",{id,class:`command-result ${index===activeIndex?"selected":""}`,role:"option","aria-selected":String(index===activeIndex),tabindex:"-1",onMousemove:()=>{activeIndex=index;draw()},onMousedown:event=>event.preventDefault(),onClick:()=>activate(index)},h("img",{class:"icon",src:iconPath(value.icon||value.section||(value.kind==="action"?"sparkles":"search")),alt:"",width:17,height:17}),h("span",{},value.title,h("small",{text:`${value.group}${value.kind==="record"?" · donnée":""}`})),value.kind==="action"?h("kbd",{text:"Action"}):null) }));query.setAttribute("aria-activedescendant",values.length?`workspace-command-option-${activeIndex}`:"");if(!values.length)results.append(emptyState("Aucun résultat","Essayez un autre terme ou le nom d’un projet.","search"));};
  query.addEventListener("input",()=>{activeIndex=0;draw()});
  query.addEventListener("keydown",event=>{if(!values.length)return;if(event.key==="ArrowDown"){event.preventDefault();activeIndex=(activeIndex+1)%values.length;draw()}else if(event.key==="ArrowUp"){event.preventDefault();activeIndex=(activeIndex-1+values.length)%values.length;draw()}else if(event.key==="Enter"){event.preventDefault();activate(activeIndex)}});
  draw();
}
function showUpdateBanner(registration){
  if(updateBanner||!registration?.waiting)return;
  updateBanner=h("div",{class:"update-banner",role:"status"},h("div",{},h("strong",{text:"Nouvelle version disponible"}),h("span",{text:"Workspace peut se mettre à jour sans interrompre votre session."})),h("div",{class:"update-actions"},h("button",{class:"button ghost",type:"button",text:"Plus tard",onClick:()=>{updateBanner?.remove();updateBanner=null}}),h("button",{class:"button primary",type:"button",text:"Actualiser",onClick:()=>{sessionStorage.setItem("sq-sw-reloading","1");registration.waiting?.postMessage({type:"SKIP_WAITING"})}})));document.body.append(updateBanner);announce("Une nouvelle version de Workspace est disponible.");
}
async function registerServiceWorker(){
  if(!("serviceWorker" in navigator))return;
  try{const registration=await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});swRegistration=registration;if(registration.waiting&&navigator.serviceWorker.controller)showUpdateBanner(registration);registration.addEventListener("updatefound",()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)showUpdateBanner(registration)})});navigator.serviceWorker.addEventListener("controllerchange",()=>{if(sessionStorage.getItem("sq-sw-reloading")==="1"){sessionStorage.removeItem("sq-sw-reloading");location.reload()}});registration.update().catch(()=>{});setInterval(()=>registration.update().catch(()=>{}),60*60*1000)}catch{}
}
let realtimeReconnectTimer=null;let reconnectDelay=1000;
function stopRealtime(){clearTimeout(realtimeReconnectTimer);clearTimeout(realtimeRefreshTimer);const old=state.realtime;state.realtime=null;try{old?.close()}catch{}}
function connectRealtime(){
  if(!uiReady||!state.accessToken||!state.online)return;stopRealtime();const wsURL=realtimeURL();wsURL.searchParams.set("accessToken",state.accessToken);
  try{
    const socket=new WebSocket(wsURL);state.realtime=socket;
    socket.addEventListener("open",()=>{reconnectDelay=1000;setState({lastSyncAt:new Date()})});
    socket.addEventListener("message",event=>{if(socket!==state.realtime)return;let message;try{message=JSON.parse(event.data)}catch{return}if(message.type==="connected")return;clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(async()=>{try{await loadWorkspace();if(state.route.section==="messages")window.dispatchEvent(new Event("sq:messages-refresh"));else if(["dashboard","today","notifications","activity"].includes(state.route.section))renderCurrent({focus:false})}catch{}},500)});
    socket.addEventListener("close",()=>{if(socket!==state.realtime)return;state.realtime=null;if(uiReady&&state.accessToken&&state.online){realtimeReconnectTimer=setTimeout(connectRealtime,reconnectDelay);reconnectDelay=Math.min(30000,reconnectDelay*2)}});
  }catch{}
}
async function authenticated(){await Promise.all([loadMe(),loadWorkspace(),loadDomainCatalog().catch(()=>null)]);if(!state.user||!state.accessToken)return;uiReady=true;buildShell();uiSignature=signature();connectRealtime()}
function resetInterface(reason=""){uiReady=false;uiSignature="";renderGeneration++;refs={};stopRealtime();document.querySelector("#portal-root")?.replaceChildren();document.querySelectorAll(".overlay").forEach(node=>node.remove());document.querySelector(".toast-stack")?.replaceChildren();if(app)app.inert=false;renderAuth(authenticated,{message:reason==="expired"?"Votre session a expiré. Reconnectez-vous.":""})}
window.addEventListener("sq:session-ended",event=>resetInterface(event.detail?.reason));window.addEventListener("offline",stopRealtime);window.addEventListener("online",()=>{if(uiReady)connectRealtime()});
async function bootstrap(){registerServiceWorker();const restoring=!authContext.action&&hasStoredSession();renderAuth(authenticated,{restoring});if(!restoring)return;try{await refreshSession();await authenticated()}catch(error){if(error.name!=="AbortError")renderAuth(authenticated,{message:errorMessage(error)})}}
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
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")swRegistration?.update().catch(()=>{})});
setInterval(()=>{if(uiReady&&state.user)refreshChrome()},60*1000);
function signature(){return JSON.stringify({route:state.route,closedGroups:state.closedGroups,sidebarOpen:state.sidebarOpen,appearance:state.appearance,online:state.online,lastSyncAt:state.lastSyncAt?.toISOString?.(),user:[state.user?.firstName,state.user?.first_name,state.user?.lastName,state.user?.last_name,state.user?.email,state.user?.role]})}
subscribe(()=>{if(!uiReady||!state.user)return;const before=uiSignature?JSON.parse(uiSignature):{};const next=signature();if(next===uiSignature)return;const after=JSON.parse(next);uiSignature=next;if(!refs.shell){buildShell();return}const routeChanged=JSON.stringify(before.route)!==JSON.stringify(after.route);refreshChrome();if(routeChanged)renderCurrent({focus:true})});
bootstrap().catch(error=>{resetInterface();toast(errorMessage(error),"error")});
