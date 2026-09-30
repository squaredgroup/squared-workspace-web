import { state } from "./store.js";
import { SECTIONS, canAccessSection } from "./config.js";
import { storage } from "./storage.js";

const preferences=storage("local");
const key=()=>`sq-mobile-pins:${state.user?.id||"member"}`;
export function pinnedSections(){
  let values=[];try{values=JSON.parse(preferences.get(key())||"[]");}catch{}
  return Array.isArray(values)?[...new Set(values)].filter(value=>typeof value==="string"&&SECTIONS[value]&&canAccessSection(value,state.user)).slice(0,6):[];
}
export function toggleSectionPin(section){
  if(!state.user||!SECTIONS[section]||!canAccessSection(section,state.user))return {ok:false};
  const values=pinnedSections(),exists=values.includes(section);
  if(!exists&&values.length>=6)return {ok:false,full:true};
  const next=exists?values.filter(value=>value!==section):[...values,section];
  const stored=preferences.set(key(),JSON.stringify(next));
  window.dispatchEvent(new Event("sq:navigation-preferences"));
  return {ok:true,pinned:!exists,stored};
}
