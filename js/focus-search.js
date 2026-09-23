import { state, setRoute } from "./store.js";
import { SECTIONS, canAccessSection, canAccessSubpage } from "./config.js";
import { listCoreDomain } from "./api.js";
import { h, icon, modal, button, emptyState, errorMessage } from "./ui.js";
import { normalize, titleOf, valueOf, sectionForDomain } from "./focus-model.js";
import { openRecord } from "./focus-records.js";

export function openFocusSearch({refresh,theme}={}) {
  if(!state.user||document.querySelector(".command"))return;
  const owner=state.user.id,extra=new Map();let limit=24,active=0,busy=false,visible=[],closed=false;
  const query=h("input",{class:"command-input",type:"search",role:"combobox","aria-label":"Rechercher dans Workspace","aria-controls":"focus-search-results","aria-expanded":"true","aria-autocomplete":"list",placeholder:"Projet, tâche, document ou page…",autocomplete:"off"});
  const results=h("div",{id:"focus-search-results",class:"command-results",role:"listbox","aria-label":"Résultats de recherche"});
  const scope=h("p",{class:"focus-search-scope",role:"status",text:"Pages et données de votre session. La recherche étendue charge aussi les autres éléments autorisés."});
  const more=button("Afficher plus de résultats",{kind:"ghost",onClick:()=>{limit+=24;draw();}});
  const expand=button("Étendre aux autres données autorisées",{kind:"ghost",iconName:"search",onClick:async()=>{
    if(busy||closed)return;busy=true;expand.disabled=true;scope.textContent="Chargement du périmètre autorisé…";
    const failures=[];
    const domains=["projects","tasks","missions","deliverables","documents","validations"].filter(domain=>canAccessSection(domain,state.user));
    for(let i=0;i<domains.length;i+=2){
      await Promise.all(domains.slice(i,i+2).map(async domain=>{
        try{const items=await listCoreDomain(domain);if(!closed&&state.user?.id===owner)extra.set(domain,items);}
        catch(e){failures.push(`${SECTIONS[domain].title} : ${errorMessage(e)}`);}
      }));
      if(closed||state.user?.id!==owner)return;
    }
    scope.textContent=failures.length?`Périmètre partiel. ${failures.join(" · ")}`:"Recherche étendue chargée pour les projets, tâches, missions, livrables, documents et validations autorisés. Les autres résultats proviennent de la session.";
    busy=false;expand.disabled=false;draw();
  }});
  const panel=h("div",{class:"focus-search"},query,scope,results,more,expand);
  const dialog=modal({title:"Recherche Workspace",content:panel,className:"command",initialFocus:".command-input",onClose:()=>{closed=true;extra.clear();}});
  function entries(){
    const values=[];
    if(refresh)values.push({title:"Actualiser les données",group:"Action",icon:"sync",run:refresh});
    if(theme)values.push({title:"Changer de thème",group:"Action",icon:"sun",run:theme});
    for(const [key,section] of Object.entries(SECTIONS)){
      if(!canAccessSection(key,state.user))continue;
      values.push({title:section.title,group:"Page",icon:key==="spaces"?"grid":key,run:()=>setRoute(key,section.subpages?.find(p=>canAccessSubpage(p,state.user))?.id||"")});
      for(const sub of section.subpages||[])if(canAccessSubpage(sub,state.user))values.push({title:sub.title,group:section.title,icon:key,run:()=>setRoute(key,sub.id)});
    }
    for(const domain of ["projects","tasks","missions","deliverables","documents","validations","conversations"]){
      const section=sectionForDomain(domain);if(!canAccessSection(section,state.user))continue;
      const items=new Map((Array.isArray(state.workspace?.[domain])?state.workspace[domain]:[]).filter(item=>item?.id).map(item=>[item.id,item]));
      for(const item of extra.get(domain)||[])if(item?.id)items.set(item.id,item);
      for(const item of items.values())values.push({title:titleOf(item),group:SECTIONS[section].title,detail:valueOf(item,"description","preview","status"),icon:section,run:()=>domain==="conversations"?setRoute("messages","",item.id):openRecord(domain,item.id)});
    }
    return values;
  }
  const choose=index=>{const value=visible[index];if(!value||state.user?.id!==owner)return;dialog.close();value.run();};
  function selectActive(){
    results.querySelectorAll('[role="option"]').forEach((node,index)=>{node.classList.toggle("selected",index===active);node.setAttribute("aria-selected",String(index===active));});
    if(visible[active])query.setAttribute("aria-activedescendant",`focus-result-${active}`);else query.removeAttribute("aria-activedescendant");
  }
  function draw(){
    if(closed||state.user?.id!==owner)return;
    const term=normalize(query.value.trim()),all=entries().filter(value=>normalize(`${value.title} ${value.group} ${value.detail||""}`).includes(term));
    if(term)all.sort((a,b)=>Number(normalize(b.title).startsWith(term))-Number(normalize(a.title).startsWith(term)));
    visible=all.slice(0,limit);active=Math.min(active,Math.max(0,visible.length-1));
    results.replaceChildren(...(visible.length?visible.map((value,index)=>h("div",{id:`focus-result-${index}`,class:"command-result",role:"option","aria-selected":String(index===active),tabindex:"-1",onPointermove:()=>{active=index;selectActive();},onMousedown:event=>event.preventDefault(),onClick:()=>choose(index)},icon(value.icon,20),h("span",{},h("strong",{text:value.title}),h("small",{text:value.group})))):[emptyState("Aucun résultat","Changez le terme ou étendez la recherche.","search")]));
    more.hidden=all.length<=limit;selectActive();
  }
  query.addEventListener("input",()=>{active=0;limit=24;draw();});
  query.addEventListener("keydown",event=>{
    if(!visible.length||event.isComposing)return;
    if(["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();active=(active+(event.key==="ArrowDown"?1:-1)+visible.length)%visible.length;selectActive();results.children[active]?.scrollIntoView({block:"nearest"});}
    else if(event.key==="Enter"){event.preventDefault();choose(active);}
  });
  draw();
}
