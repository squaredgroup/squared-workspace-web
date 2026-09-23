import { state, setRoute } from "./store.js";
import { SECTIONS, ICONS, NAV_GROUPS, canAccessSection, canAccessSubpage } from "./config.js";
import { h, icon, button, iconButton, pageHeader, emptyState, profileAvatar } from "./ui.js";
import { normalize } from "./focus-model.js";
import { viewContext } from "./focus-state.js";
import { storage } from "./storage.js";
SECTIONS.spaces={title:"Espaces",group:"Général"};
ICONS.spaces="Grid";
const allowed=key=>canAccessSection(key,state.user);
const go=key=>setRoute(key,SECTIONS[key]?.subpages?.find(p=>canAccessSubpage(p,state.user))?.id||"");
export function focusTabs(){
  const client=state.user?.role==="CLIENT";
  const entries=[{key:"dashboard",title:"Accueil",active:["dashboard","today"]},{key:client?"projects":"tasks",title:client?"Projets":"Travail",active:["projects","tasks","missions","planning"]},{key:"notifications",title:client?"À valider":"À traiter",active:["notifications","validations"]},{key:"messages",title:"Messages",active:["messages","mailbox"]},{key:"spaces",title:client?"Espace":"Espaces",active:[]}].filter(item=>allowed(item.key));
  const matched=entries.find(item=>item.active.includes(state.route.section));
  return h("nav",{class:"mobile-tabs focus-tabs os-tabs","aria-label":"Navigation mobile"},...entries.map(item=>{
    const active=item===matched||(!matched&&item.key==="spaces");
    return h("button",{type:"button",class:active?"active":"","aria-label":item.title,"aria-current":active?"page":null,onClick:()=>go(item.key)},h("span",{class:"os-tab-icon"},icon(item.key==="spaces"?"grid":item.key,22)),h("span",{text:item.title}));
  }));
}
export function focusHeader({search,tools,refresh}){
  const route=state.route.section;
  const title=route==="dashboard"?"Workspace":route==="notifications"?"À traiter":SECTIONS[route]?.title||"Workspace";
  const head=h("header",{class:"topbar focus-topbar os-topbar"},
    h("button",{type:"button",class:"os-brand-button","aria-label":"Ouvrir les espaces",onClick:()=>go("spaces")},h("img",{src:"/assets/squaredgroup-logo.png",alt:"",width:28,height:28}),h("span",{text:title})),
    h("div",{class:"top-actions"},iconButton("search","Recherche",search))
  );
  const actions=head.querySelector(".top-actions");
  const account=h("button",{type:"button",class:"icon-button focus-account","aria-label":"Mon compte",onClick:()=>go("profile")},profileAvatar(state.user,{size:32,ariaHidden:true}));
  const more=iconButton("sliders","Outils Workspace",tools);more.classList.add("sq-mobile-tools-trigger");
  const sync=iconButton("sync","Actualiser les données",event=>refresh(event.currentTarget));sync.classList.add("desktop-only");
  actions.append(sync,more,account);return head;
}
export function renderSpaces(){
  const root=h("div",{class:"focus-spaces"}),results=h("div",{class:"focus-space-groups"}),context=viewContext("spaces",{query:""});
  const search=h("input",{type:"search",class:"search-input",placeholder:"Trouver un espace…","aria-label":"Trouver un espace",value:context.query});
  const preferences=storage("local");let pins=[];try{pins=JSON.parse(preferences.get(`sq-mobile-pins:${state.user?.id||"member"}`)||"[]");}catch{}
  if(!Array.isArray(pins))pins=[];
  const renderItem=key=>button(SECTIONS[key].title,{kind:"ghost",iconName:key,onClick:()=>go(key),className:"focus-space-link"});
  root.append(pageHeader({eyebrow:"Votre périmètre",title:"Espaces",subtitle:"Tous vos modules autorisés, sans perdre le fil."}),search,results);
  function draw(){
    const term=normalize(context.query),groups=[];
    const matches=key=>key!=="spaces"&&allowed(key)&&normalize(SECTIONS[key].title).includes(term);
    const favourites=[...new Set(pins)].filter(matches);
    if(favourites.length)groups.push(h("section",{},h("h2",{text:"Mes favoris"}),h("div",{class:"focus-space-grid"},...favourites.map(renderItem))));
    for(const group of NAV_GROUPS){const keys=group.sections.filter(matches);if(keys.length)groups.push(h("section",{},h("h2",{text:group.name}),h("div",{class:"focus-space-grid"},...keys.map(renderItem))));}
    results.replaceChildren(...(groups.length?groups:[emptyState("Aucun espace correspondant","Essayez un autre nom.","search")]));
  }
  search.addEventListener("input",()=>{context.query=search.value;draw();});draw();return root;
}
