"""One-time, hash-guarded source edits on the isolated development branch.
This script and its workflow are removed before merge. Production builds use
ordinary reviewed source files, never runtime patches. No backend or DNS writes.
"""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
EXPECTED={'js/store.js':'4c8379385ddd5d0e64d265141b63e9ca9d1b8979354fbbef481a0f3197967d47','js/ui.js':'459836cdc067744ad98434d5c55a6ea25b4da535bb671e014a53bf64ebe59e27','js/app.js':'57ed9f7e83145db917cb6cbd40888449562c9ab14778f32ed7049264dfae9f51','js/api.js':'fb650185adbb299e411db44cee69849ca1a8c4758978cddf13f3369c42c2d49a','js/mobile.js':'9ab899bf31d9595293c67bafedd24541efd0c371b51a5f8aec61b00422ad0443','js/modules/data.js':'5587c2b58ae3c2aecab54ad3d54a9ef525cfcec048fe9e1a8f7af8a2f4f98d5a','js/modules/messages.js':'8ac91bfbf4b00f82e735aebd557cc7429ac7ff6fc4bac8710ccfb475cf019d8c','js/modules/dashboard.js':'0a66a2f7a0c76359d61c0de97e562f772583f8cc3e3b4433d55cede314ceea6e','js/modules/mailbox.js':'d8f417e886000ac98bef57556e11a8ef2380d099e4d6d571186690004e8f3d8b'}
for name,expected in EXPECTED.items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==expected,f'Source changed: {name}'
def edit(path,old,new):
    p=root/path;s=p.read_text();assert old in s,(path,old[:100]);p.write_text(s.replace(old,new))
def block(path,start,end,new):
    p=root/path;s=p.read_text();a=s.index(start);b=s.index(end,a);p.write_text(s[:a]+new+s[b:])
# Backward-compatible object identity in hash URLs.
edit('js/store.js','const raw = location.hash.replace(/^#\\/?/, "");','const [raw, query = ""] = location.hash.replace(/^#\\/?/, "").split("?");')
edit('js/store.js','return { section: section || "dashboard", subpage: decoded };','const item = new URLSearchParams(query).get("item");\n  return { section: section || "dashboard", subpage: decoded, ...(item ? {item} : {}) };')
edit('js/store.js','setRoute(section,subpage=""){','setRoute(section,subpage="",item=""){')
edit('js/store.js','state.route={section,subpage};','state.route={section,subpage,...(item?{item}: {})};')
edit('js/store.js','const encoded = `#/${section}${subpage?`/${encodeURIComponent(subpage)}`:""}`;','const encoded = `#/${section}${subpage?`/${encodeURIComponent(subpage)}`:""}${item?`?item=${encodeURIComponent(item)}`:""}`;')
# Dirty-dialog veto and caught asynchronous actions.
edit('js/ui.js','closeOnBackdrop=true}){','closeOnBackdrop=true,beforeClose}){')
edit('js/ui.js','const close=()=>{if(closed)return;closed=true;','const close=()=>{if(closed||beforeClose?.()===false)return;closed=true;')
edit('js/ui.js','result.finally(()=>{if(node.isConnected){node.disabled=false;node.removeAttribute("aria-busy")}})','Promise.resolve(result).catch(error=>toast(errorMessage(error),"error")).finally(()=>{if(node.isConnected){node.disabled=false;node.removeAttribute("aria-busy")}})')
# Existing core endpoints, human forms, stable input nodes.
edit('js/modules/data.js','import { state }','import { editRecord, recordList, supportsRecord } from "../focus-records.js";\nimport { strictObject, domainLabels } from "../focus-model.js";\nimport { viewContext } from "../focus-state.js";\nimport { state }')
edit('js/modules/data.js','function coreForm(domain,entity,reload){','function coreForm(domain,entity,reload){\n  if(supportsRecord(domain))return editRecord(domain,entity,reload);')
edit('js/modules/data.js','payload:safeJSON(payload.value,{})','payload:strictObject(payload.value)')
edit('js/modules/data.js','const finalData=safeJSON(advanced.value,{});','const finalData=strictObject(advanced.value);')
block('js/modules/data.js','function renderDomainList(','function snapshotView(',(root/'scripts/focus-parts/domain-list.txt').read_text())
edit('js/modules/data.js','panel=card(pretty(core),','panel=card(domainLabels[core]||pretty(core),')
edit('js/modules/dashboard.js','export async function renderDashboard(today=false){','export async function renderDashboard(today=false){\n  if(matchMedia("(max-width: 880px)").matches){const {renderFocusHome}=await import("../focus-home.js");return renderFocusHome(today);}')
edit('js/api.js','  return items;\n}\nexport async function getCoreEntity','  if(cursor)throw new Error("Le périmètre dépasse la limite de chargement. Affinez la recherche ou ouvrez le module concerné.");\n  return items;\n}\nexport async function getCoreEntity')
# Chrome commands receive callbacks instead of querying translated labels.
edit('js/mobile.js','function openTools() {','let mobileCommands={};\nexport function configureMobile(commands){mobileCommands=commands;}\nexport function openTools() {')
edit('js/mobile.js','() => document.querySelector(\'.top-actions [aria-label="Actualiser les données"]\')?.click()','() => mobileCommands.refresh?.()')
edit('js/mobile.js','() => document.querySelector(".sidebar-search")?.click()','() => mobileCommands.search?.()')
edit('js/mobile.js','const url = `${location.origin}${location.pathname}#/${section}${validSubpage ? `/${encodeURIComponent(state.route.subpage)}` : ""}`;','const url = `${location.origin}${location.pathname}#/${section}${validSubpage ? `/${encodeURIComponent(state.route.subpage)}` : ""}${state.route.item?`?item=${encodeURIComponent(state.route.item)}`:""}`;')
edit('js/mobile.js','`Dernier chargement des données ${relativeDate(state.lastSyncAt)}.`','`Dernier chargement confirmé ${relativeDate(state.lastSyncAt)}.`')
edit('js/mobile.js','if (!layout) return;','if (!layout || layout.dataset.focusManaged === "true") return;')
# Restore drafts only within this user/workspace/session, never a mutation queue.
edit('js/modules/messages.js','import { state, subscribe }','import { getDraft, saveDraft } from "../focus-state.js";\nimport { state, subscribe, setRoute }')
edit('js/modules/messages.js','const drafts = new Map();','const volatileDrafts = new Set();\nconst drafts = new Map();')
edit('js/modules/messages.js','drafts.clear(); sending.clear();','drafts.clear(); volatileDrafts.clear(); sending.clear();')
edit('js/modules/messages.js','if (drafts.size) { event.preventDefault();','if (volatileDrafts.size) { event.preventDefault();')
edit('js/modules/messages.js','unsubscribeView?.(); const version = ++generation;','unsubscribeView?.(); const version = ++generation;\n  if(state.route.item)selectedId=state.route.item;')
edit('js/modules/messages.js','const draft = drafts.get(draftKey(conversation.id));','const draft = drafts.get(draftKey(conversation.id)) || getDraft(conversation.id);')
edit('js/modules/messages.js','selectedId = null; shownConversation = null; root.classList.remove("sq-conversation-open"); drawList();','selectedId = null; shownConversation = null; root.classList.remove("sq-conversation-open"); drawList();\n    if(state.route.item){setRoute("messages");return;}')
edit('js/modules/messages.js','selectedId = id; drawList(); drawThread(userInitiated);','if(userInitiated&&state.route.item!==id){setRoute("messages","",id);return;}\n    selectedId = id; drawList(); drawThread(userInitiated);')
edit('js/modules/messages.js','messageBox = textarea(drafts.get(key) || "",','messageBox = textarea(drafts.get(key) || getDraft(conversation.id) || "",')
edit('js/modules/messages.js','if (box.value) drafts.set(key, box.value); else drafts.delete(key);','if (box.value) drafts.set(key, box.value); else drafts.delete(key);\n      const stored=saveDraft(conversation.id,box.value);\n      box.dataset.draftStored=String(stored);\n      if(box.value&&!stored)volatileDrafts.add(key);else volatileDrafts.delete(key);')
edit('js/modules/messages.js','drafts.delete(key); box.value = ""; announce("Message envoyé");','drafts.delete(key); volatileDrafts.delete(key); saveDraft(conversation.id,""); box.value = ""; announce("Message envoyé");')
edit('js/modules/messages.js','"Brouillon gardé dans cette session uniquement, jusqu’à la fermeture ou la déconnexion."','(messageBox.dataset.draftStored==="true"?"Brouillon conservé dans cet onglet, y compris après rechargement, pendant 24 h maximum. Effacé à la déconnexion.":"Stockage indisponible : brouillon en mémoire uniquement. Copiez-le avant de recharger.")')
edit('js/modules/messages.js','subtitle: "Vos conversations, avec des brouillons conservés pendant cette session."','subtitle: "Vos échanges et vos décisions, dans leur contexte."')
edit('js/modules/messages.js','if (!conversation) { selectedId = null; right.replaceChildren','if (!conversation) { if(state.route.item){root.classList.add("sq-conversation-open");right.replaceChildren(button("Retour aux conversations",{onClick:()=>{selectedId=null;setRoute("messages");}}),emptyState("Conversation indisponible","Elle n’existe plus ou ne fait pas partie de votre périmètre.","lock"));return;} selectedId = null; right.replaceChildren')
# Mail reader lifecycle lives in the module rather than a MutationObserver.
p=root/'js/modules/mailbox.js';p.write_text('import { viewContext } from "../focus-state.js";\n'+p.read_text())
block('js/modules/mailbox.js','async function mailboxMain()','async function templatesView()',(root/'scripts/focus-parts/mailbox.txt').read_text())
# Explicit chrome, record routes, safe rendering and scroll restoration.
p=root/'js/app.js';p.write_text('''import { focusTabs, focusHeader, renderSpaces } from "./focus-navigation.js";
import { configureMobile, openTools } from "./mobile.js";
import { openFocusSearch } from "./focus-search.js";
import { viewContext } from "./focus-state.js";
import { supportsRecord, renderRecord } from "./focus-records.js";
import { CORE_DOMAIN_BY_SECTION } from "./config.js";
'''+p.read_text())
block('js/app.js','function mobileTabs()','function systemState()','function mobileTabs(){return focusTabs()}\n')
edit('js/app.js','function topbar(){','function topbar(){\n  if(matchMedia("(max-width: 880px)").matches)return focusHeader({search:openCommand,tools:openTools,refresh:refreshWorkspace});')
edit('js/app.js','async function sectionPage(section,subpage){','async function sectionPage(section,subpage){\n  if(section==="spaces")return renderSpaces();\n  const domain=CORE_DOMAIN_BY_SECTION[section];\n  if(state.route.item&&supportsRecord(domain))return renderRecord(domain,state.route.item);')
edit('js/app.js','function subnav(){const s=','''function subnav(){
  if(state.route.item)return null;
  if(["tasks","missions"].includes(state.route.section)&&matchMedia("(max-width: 880px)").matches)return h("nav",{class:"subnav focus-work-switch","aria-label":"Travail"},...["tasks","projects","planning","missions"].filter(key=>canAccessSection(key,state.user)).map(key=>h("button",{type:"button",class:key===state.route.section?"active":"","aria-current":key===state.route.section?"page":null,text:SECTIONS[key].title,onClick:()=>setRoute(key,SECTIONS[key].subpages?.find(p=>canAccessSubpage(p,state.user))?.id||"")})));
  const s=''' )
block('js/app.js','function commandEntries()','function showUpdateBanner(','''function openCommand(){
  if(!uiReady||!state.user)return;
  openFocusSearch({refresh:refreshData,theme:()=>setAppearance({mode:document.documentElement.dataset.theme==="light"?"dark":"light"})});
}
async function refreshData(){
  if(state.loading||!state.online)return;
  const placeholder=h("button");await refreshWorkspace(placeholder);
}
configureMobile({refresh:refreshData,search:openCommand});
''')
block('js/app.js','async function renderCurrent(','function openCommand()', '''let renderedRouteKey="";
async function renderCurrent({focus=true}={}){
  if(!refs.content||!safeRoute())return;
  if(renderedRouteKey&&refs.content.getAttribute("aria-busy")!=="true")viewContext("scroll:"+renderedRouteKey).y=window.scrollY;
  const route={...state.route},key=JSON.stringify(route),generation=++renderGeneration;
  const returnY=viewContext("scroll:"+key,{y:0}).y;
  refs.content.setAttribute("aria-busy","true");refs.content.replaceChildren(skeletonPage());
  try{
    const page=await sectionPage(route.section,route.subpage);
    if(generation!==renderGeneration||!refs.content)return;
    const apply=()=>{
      refs.content.replaceChildren(page);
      const nav=subnav();if(nav)page.insertBefore(nav,page.children[1]||null);
      refs.content.setAttribute("aria-busy","false");renderedRouteKey=key;
      document.title=`${SECTIONS[route.section]?.title||"Workspace"} — Squared Workspace`;
    };
    const reduced=state.appearance?.reducedMotion||matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(document.startViewTransition&&!reduced&&!activeViewTransition){
      const transition=document.startViewTransition(apply);activeViewTransition=transition;
      await transition.updateCallbackDone.catch(()=>{});
      transition.finished.catch(()=>{}).finally(()=>{if(activeViewTransition===transition)activeViewTransition=null;});
    }else apply();
    if(generation!==renderGeneration)return;
    requestAnimationFrame(()=>{if(generation===renderGeneration)window.scrollTo({top:returnY,behavior:"instant"});});
    if(focus&&!document.querySelector("#portal-root > .overlay")){refs.content.focus({preventScroll:true});announce(`${SECTIONS[route.section]?.title||"Workspace"} chargé`);}
  }catch(error){if(generation!==renderGeneration||!refs.content)return;refs.content.setAttribute("aria-busy","false");refs.content.replaceChildren(emptyState("Chargement impossible",errorMessage(error),"warning"));}
}
''')
edit('js/app.js','function resetInterface(reason=""){uiReady=false;','function resetInterface(reason=""){renderedRouteKey="";uiReady=false;')
edit('js/app.js','socket.addEventListener("open",()=>{reconnectDelay=1000;setState({lastSyncAt:new Date()})});','socket.addEventListener("open",()=>{reconnectDelay=1000;refreshChrome()});')
edit('js/app.js','text:state.online?"Synchronisé":"Hors ligne"','text:state.online?(state.lastSyncAt?"Données chargées":"Connecté"):"Hors ligne"')
edit('js/app.js','Connexion interrompue. Les données affichées restent visibles, les actions serveur reprendront dès le retour du réseau.','Connexion interrompue. Les données affichées restent visibles ; aucune action n’est envoyée automatiquement.')
edit('js/app.js','bootstrap().catch(error=>','matchMedia("(max-width: 880px)").addEventListener("change",()=>{if(uiReady){refreshChrome();if(!document.querySelector(".overlay"))renderCurrent({focus:false});}});\nbootstrap().catch(error=>')
# Bundle/version/budgets stay in the existing production pipeline.
edit('src/styles.css','@import "../css/mobile.css";','@import "../css/mobile.css";\n@import "../css/focus.css";')
edit('sw.js','workspace-v7-5-mobile','workspace-focus-20260923')
edit('scripts/quality-budget.mjs','"css/mobile.css"]','"css/mobile.css","css/focus.css","src/styles.css"]')
edit('scripts/quality-budget.mjs','"js/mobile.js"]','"js/mobile.js","js/focus-model.js","js/focus-state.js","js/focus-records.js","js/focus-navigation.js","js/focus-search.js"]')
# Update obsolete assertions only, retaining all original functional scenarios.
p=root/'tests/product_flows.py';s=p.read_text();i=s.index('    mobile = browser.new_context');a=s[:i];b=s[i:];start=b.index('    expect(page.get_by_role("heading", name="Tableau de bord", exact=True)).to_be_visible()');end=b.index('    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")',start);b=b[:start]+'''    expect(page.locator(".focus-home")).to_be_visible()
    expect(page.locator(".focus-home-content")).to_be_visible()
    for _ in range(2):
        page.reload()
        expect(page.locator(".focus-home")).to_be_visible()
'''+b[end:];b=b.replace('get_by_text("Tableau de bord", exact=True)','get_by_text("Accueil", exact=True)');p.write_text(a+b)
p=root/'tests/mobile_flows.py';s=p.read_text();start=s.index("    page.locator('.menu-toggle button').click();");end=s.index("    page.locator('.sq-mobile-tools-trigger').click();",start);s=s[:start]+'''    page.locator('.mobile-tabs').get_by_role('button',name='Espaces',exact=True).click()
    expect(page.locator('.focus-spaces')).to_be_visible()
    page.get_by_role('searchbox',name='Trouver un espace').fill('Messages')
    page.locator('.focus-space-link').filter(has_text='Messages').click();settled(page)
'''+s[end:];p.write_text(s)
p=root/'tests/accessibility.mjs';s=p.read_text();mark='  console.log("Accessibilité WCAG 2.2 AA validée sur connexion et dashboard.");';assert mark in s;s=s.replace(mark,'''  await page.setViewportSize({width:390,height:844});
  for(const mode of ["dark","light"]){
    await page.evaluate(async mode=>{const m=await import('/js/store.js');m.setAppearance({mode,reducedMotion:true});},mode);
    for(const section of ["dashboard","tasks","notifications","spaces"]){
      await page.evaluate(async section=>{const m=await import('/js/store.js');m.setRoute(section);},section);
      await page.waitForFunction(()=>document.querySelector('#workspace-main')?.getAttribute('aria-busy')==='false');
      await audit(page,`mobile-${section}-${mode}`);
    }
  }
  console.log("Audits axe : connexion, tableau de bord et 8 états mobiles clair/sombre.");''');p.write_text(s)
# Guarded integration fixes in authored helpers.
edit('js/focus-navigation.js','SECTIONS, NAV_GROUPS,','SECTIONS, ICONS, NAV_GROUPS,')
edit('js/focus-navigation.js','SECTIONS.spaces={title:"Espaces",group:"Général"};','SECTIONS.spaces={title:"Espaces",group:"Général"};\nICONS.spaces="Grid";')
edit('js/focus-home.js','titleOf, domainLabels','titleOf, domainLabels, sectionForDomain')
edit('js/focus-home.js','`Voir les ${items.length} éléments`','`Ouvrir ${domainLabels[domain]?.toLowerCase()||"la liste"}`')
edit('js/focus-home.js','onClick:()=>setRoute(domain)','onClick:()=>setRoute(sectionForDomain(domain))')
edit('js/focus-records.js','beforeClose:()=>!dirty||window.confirm','beforeClose:()=>!busy&&(!dirty||window.confirm')
edit('js/focus-records.js','non enregistrées ?"),actions','non enregistrées ?")),actions')
edit('js/focus-records.js','dirty=false;close();toast','dirty=false;busy=false;close();toast')
edit('js/focus-records.js','const description=textarea(valueOf(original,','if(domain==="validations")status.disabled=true;\n  const description=textarea(valueOf(original,')
print('Focus sources materialized; full CI must pass before merge.')
