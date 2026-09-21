import { storage } from "./storage.js";
import { SECTIONS } from "./config.js";
const preferences=storage("local");
const tab=storage("session");
const listeners = new Set();
const initialRoute = () => {
  const raw = location.hash.replace(/^#\/?/, "");
  const [section = "dashboard", subpage = ""] = raw.split("/");
  let decoded=""; try { decoded=decodeURIComponent(subpage || ""); } catch { /* malformed URL */ }
  return { section: section || "dashboard", subpage: decoded };
};

export const state = {
  accessToken: null,
  sessionId: null,
  user: null,
  workspace: null,
  workspaceEtag: null,
  domainCatalog: null,
  route: initialRoute(),
  closedGroups: tab.json("sq-closed-nav-groups", {}),
  sidebarOpen: false,
  commandOpen: false,
  notificationsOpen: false,
  online: navigator.onLine,
  loading: false,
  lastSyncAt: null,
  realtime: null,
  realtimeTicket: null,
  appearance: preferences.json("sq-web-appearance")
};

export function subscribe(listener){ listeners.add(listener); return () => listeners.delete(listener); }
export function notify(){ for(const listener of listeners) listener(state); }
export function setState(patch){ Object.assign(state,patch); notify(); }
export function updateState(mutator){ mutator(state); notify(); }
export function setRoute(section,subpage=""){
  state.route={section,subpage}; state.sidebarOpen=false;
  const group=SECTIONS[section]?.group;
  if(group&&state.closedGroups[group]){
    state.closedGroups={...state.closedGroups};
    delete state.closedGroups[group];
    tab.set("sq-closed-nav-groups",JSON.stringify(state.closedGroups));
  }
  const encoded = `#/${section}${subpage?`/${encodeURIComponent(subpage)}`:""}`;
  if(location.hash!==encoded) history.pushState(null,"",encoded);
  notify();
}
export function setGroupOpen(group,open){
  const closedGroups={...state.closedGroups};
  if(open)delete closedGroups[group];else closedGroups[group]=true;
  state.closedGroups=closedGroups;
  tab.set("sq-closed-nav-groups",JSON.stringify(closedGroups));
  notify();
}
export function setAppearance(patch){ state.appearance={...state.appearance,...patch}; preferences.set("sq-web-appearance",JSON.stringify(state.appearance)); applyAppearance(); notify(); }
export function applyAppearance(){
  const preference=["light","dark","system"].includes(state.appearance.mode)?state.appearance.mode:"dark";
  const mode=preference==="system"?(colorScheme.matches?"light":"dark"):preference;
  const density=["dense","airy","balanced"].includes(state.appearance.density)?state.appearance.density:"balanced";
  const width=["focused","balanced","wide"].includes(state.appearance.contentWidth)?state.appearance.contentWidth:"balanced";
  document.documentElement.dataset.theme=mode;
  document.documentElement.dataset.density=density;
  document.documentElement.dataset.contentWidth=width;
  document.documentElement.dataset.compactSidebar=state.appearance.compactSidebar?"true":"false";
  document.documentElement.dataset.reducedMotion=state.appearance.reducedMotion?"true":"false";
  document.documentElement.style.colorScheme=mode;
  const themeColor=document.querySelector?.('meta[name="theme-color"]');
  if(themeColor)themeColor.setAttribute("content",mode==="light"?"#F4F5F1":"#0D0D0E");
  if(/^#[0-9a-f]{6}$/i.test(state.appearance.accent||"")){
    document.documentElement.style.setProperty("--sq-accent",state.appearance.accent);
  }
}
const colorScheme=window.matchMedia?.("(prefers-color-scheme: light)")||{matches:false,addEventListener(){}};
colorScheme.addEventListener?.("change",()=>{if(state.appearance.mode==="system"){applyAppearance();notify()}});
window.addEventListener("hashchange",()=>{
  state.route=initialRoute();
  const group=SECTIONS[state.route.section]?.group;
  if(group&&state.closedGroups[group]){
    state.closedGroups={...state.closedGroups};
    delete state.closedGroups[group];
    tab.set("sq-closed-nav-groups",JSON.stringify(state.closedGroups));
  }
  state.sidebarOpen=false;
  notify();
});
window.addEventListener("online",()=>setState({online:true}));
window.addEventListener("offline",()=>setState({online:false}));
applyAppearance();
