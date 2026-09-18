const listeners = new Set();
const initialRoute = () => {
  const raw = location.hash.replace(/^#\/?/, "");
  const [section = "dashboard", subpage = ""] = raw.split("/");
  return { section, subpage: decodeURIComponent(subpage || "") };
};

export const state = {
  accessToken: null,
  sessionId: null,
  user: null,
  workspace: null,
  workspaceEtag: null,
  domainCatalog: null,
  route: initialRoute(),
  openGroup: sessionStorage.getItem("sq-open-group") || "Général",
  sidebarOpen: false,
  commandOpen: false,
  notificationsOpen: false,
  online: navigator.onLine,
  loading: false,
  lastSyncAt: null,
  realtime: null,
  realtimeTicket: null,
  appearance: JSON.parse(localStorage.getItem("sq-web-appearance") || "{}")
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
export function setOpenGroup(group){ state.openGroup=group; sessionStorage.setItem("sq-open-group",group); notify(); }
export function setAppearance(patch){ state.appearance={...state.appearance,...patch}; localStorage.setItem("sq-web-appearance",JSON.stringify(state.appearance)); applyAppearance(); notify(); }
export function applyAppearance(){
  const mode=state.appearance.mode||"dark";
  document.documentElement.dataset.theme=mode;
  if(state.appearance.accent){
    document.documentElement.style.setProperty("--sq-accent",state.appearance.accent);
  }
}
window.addEventListener("hashchange",()=>{ state.route=initialRoute(); notify(); });
window.addEventListener("online",()=>setState({online:true}));
window.addEventListener("offline",()=>setState({online:false}));
applyAppearance();
