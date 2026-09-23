/** UI context and bounded tab-only drafts. Never a server mutation queue. */
import { state } from "./store.js";
const contexts = new Map();
const draftMemory = new Map();
const PREFIX = "sq-focus-draft:";
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 50;
let identity = "";
export function scopeKey() {
  const permissions = Array.isArray(state.user?.permissions) ? state.user.permissions : [];
  return JSON.stringify([state.user?.id || "", state.workspace?.workspace?.id || "", state.user?.role || "", [...permissions].sort()]);
}
function ensureScope() {
  const next=scopeKey();
  if(identity&&identity!==next){contexts.clear();clearDrafts();}
  identity=next;return next;
}
export function viewContext(key,initial={}) {
  const scoped=ensureScope()+":"+key;
  if(!contexts.has(scoped))contexts.set(scoped,{...initial});
  return contexts.get(scoped);
}
const draftKey=id=>PREFIX+encodeURIComponent(JSON.stringify([scopeKey(),state.sessionId||"",id]));
function valid(value) { return value&&typeof value.text==="string"&&Number.isFinite(value.time)&&Date.now()-value.time>=0&&Date.now()-value.time<MAX_AGE; }
function prune() {
  for(const [key,value] of draftMemory)if(!valid(value))draftMemory.delete(key);
  [...draftMemory].sort((a,b)=>b[1].time-a[1].time).slice(MAX_DRAFTS).forEach(([key])=>draftMemory.delete(key));
  try {
    const active=[];
    for(const key of Object.keys(sessionStorage).filter(k=>k.startsWith(PREFIX))){
      let value;try{value=JSON.parse(sessionStorage.getItem(key));}catch{}
      if(valid(value))active.push([key,value.time]);else sessionStorage.removeItem(key);
    }
    active.sort((a,b)=>b[1]-a[1]).slice(MAX_DRAFTS).forEach(([key])=>sessionStorage.removeItem(key));
  }catch{/* Storage blocked: the equally bounded in-memory fallback still works. */}
}
function readValue(key) {
  try{const value=JSON.parse(sessionStorage.getItem(key)||"null");if(valid(value))return value;sessionStorage.removeItem(key);}catch{}
  const memory=draftMemory.get(key);if(valid(memory))return memory;
  draftMemory.delete(key);return null;
}
export function getDraft(id) {
  if(!state.user?.id)return "";
  ensureScope();return readValue(draftKey(id))?.text.slice(0,4000)||"";
}
export function saveDraft(id,text) {
  if(!state.user?.id)return false;
  ensureScope();
  const key=draftKey(id),value=String(text).slice(0,4000),existing=readValue(key);
  // A redraw/reload of identical text must not extend retention indefinitely.
  const record={text:value,time:existing?.text===value?existing.time:Date.now()};
  if(value)draftMemory.set(key,record);else draftMemory.delete(key);
  let stored=false;
  try{if(value)sessionStorage.setItem(key,JSON.stringify(record));else sessionStorage.removeItem(key);stored=true;}catch{}
  prune();return stored;
}
export function clearDrafts() {
  draftMemory.clear();
  try{Object.keys(sessionStorage).filter(k=>k.startsWith(PREFIX)).forEach(k=>sessionStorage.removeItem(k));}catch{}
}
window.addEventListener("sq:session-ended",()=>{contexts.clear();clearDrafts();identity="";});
setInterval(prune,60000);
