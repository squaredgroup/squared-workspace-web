/** Per-user UI state and bounded tab-only drafts. Never a server mutation queue. */
import { state } from "./store.js";
const contexts = new Map();
const draftMemory = new Map();
const PREFIX = "sq-focus-draft:";
const MAX_AGE = 24 * 60 * 60 * 1000;
let identity = "";
export function scopeKey() {
  return JSON.stringify([state.user?.id || "", state.workspace?.workspace?.id || "", state.user?.role || "", [...(state.user?.permissions || [])].sort()]);
}
function ensureScope() {
  const next = scopeKey();
  if (identity && identity !== next) { contexts.clear(); clearDrafts(); }
  identity=next; return next;
}
export function viewContext(key, initial = {}) {
  const scoped = ensureScope()+":"+key;
  if (!contexts.has(scoped)) contexts.set(scoped, {...initial});
  return contexts.get(scoped);
}
const draftKey = id => PREFIX+encodeURIComponent(JSON.stringify([scopeKey(),state.sessionId || "",id]));
function prune() {
  try {
    const keys=Object.keys(sessionStorage).filter(k=>k.startsWith(PREFIX));
    const active=[];
    for(const key of keys) {
      try { const value=JSON.parse(sessionStorage.getItem(key)); if(!value?.time || Date.now()-value.time>MAX_AGE)sessionStorage.removeItem(key);else active.push([key,value.time]); }
      catch {sessionStorage.removeItem(key);}
    }
    active.sort((a,b)=>b[1]-a[1]).slice(50).forEach(([key])=>sessionStorage.removeItem(key));
  } catch { /* Disabled browser storage: memory-only draft remains available. */ }
}
export function getDraft(id) {
  if (!state.user?.id) return "";
  const key=draftKey(id);
  try {
    const value=JSON.parse(sessionStorage.getItem(key)||"null");
    if(value && Date.now()-value.time<MAX_AGE && typeof value.text==="string")return value.text.slice(0,4000);
    sessionStorage.removeItem(key);
  } catch { /* memory fallback */ }
  const memory=draftMemory.get(key);
  if(memory&&Date.now()-memory.time<MAX_AGE)return memory.text;
  draftMemory.delete(key);return "";
}
export function saveDraft(id,text) {
  if(!state.user?.id)return false;
  const key=draftKey(id),value=String(text).slice(0,4000);
  if(value)draftMemory.set(key,{text:value,time:Date.now()});else draftMemory.delete(key);
  try {
    if(value)sessionStorage.setItem(key,JSON.stringify({text:value,time:Date.now()}));else sessionStorage.removeItem(key);
    prune();return true;
  } catch{return false;}
}
export function clearDrafts() {
  draftMemory.clear();
  try {Object.keys(sessionStorage).filter(k=>k.startsWith(PREFIX)).forEach(k=>sessionStorage.removeItem(k));}catch{}
}
window.addEventListener("sq:session-ended",()=>{contexts.clear();clearDrafts();identity="";});
