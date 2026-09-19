import { storage } from "./storage.js";
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
  openGroup: tab.get("sq-open-group") || "Général",
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
  const encoded = `#/${section}${subpage?`/${encodeURIComponent(subpage)}`:""}`;
  if(location.hash!==encoded) history.pushState(null,"",encoded);
  notify();
}
export function setOpenGroup(group){ state.openGroup=group; tab.set("sq-open-group",group); notify(); }
export function setAppearance(patch){ state.appearance={...state.appearance,...patch}; preferences.set("sq-web-appearance",JSON.stringify(state.appearance)); applyAppearance(); notify(); }
export function applyAppearance(){
  const mode=state.appearance.mode==="light"?"light":"dark";
  const density=["dense","airy","balanced"].includes(state.appearance.density)?state.appearance.density:"balanced";
  const width=["focused","balanced","wide"].includes(state.appearance.contentWidth)?state.appearance.contentWidth:"balanced";
  document.documentElement.dataset.theme=mode;
  document.documentElement.dataset.density=density;
  document.documentElement.dataset.contentWidth=width;
  document.documentElement.dataset.compactSidebar=state.appearance.compactSidebar?"true":"false";
  document.documentElement.dataset.reducedMotion=state.appearance.reducedMotion?"true":"false";
  document.documentElement.style.colorScheme=mode;
  const themeColor=document.querySelector('meta[name="theme-color"]');
  if(themeColor)themeColor.setAttribute("content",mode==="light"?"#F4F5F1":"#0D0D0E");
  if(/^#[0-9a-f]{6}$/i.test(state.appearance.accent||"")){
    document.documentElement.style.setProperty("--sq-accent",state.appearance.accent);
  }
}
window.addEventListener("hashchange",()=>{ state.route=initialRoute(); notify(); });
window.addEventListener("online",()=>setState({online:true}));
window.addEventListener("offline",()=>setState({online:false}));
applyAppearance();
