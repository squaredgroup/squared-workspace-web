/** Progressive mobile controls. No new API endpoints, tokens or private offline cache. */
import { state, subscribe, setRoute, setState, setAppearance } from "./store.js";
import { SECTIONS, canAccessSection, canAccessSubpage } from "./config.js";
import { logout } from "./api.js";
import { h, button, iconButton, modal, confirmAction, toast, relativeDate } from "./ui.js";
import { storage } from "./storage.js";

let initialized = false;
const preferences = storage("local");
const mobile = window.matchMedia("(max-width: 880px)");
const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let pendingInstall = null, recent = [], userId = "", routeKey = "", scheduled = false;
let drawerWasOpen = false, drawerFocus = null, viewportFrame = 0, baselineHeight = 0;
const enhancedSubnavs = new WeakSet(), enhancedMailReaders = new WeakSet();
let mailSearchFocus = null;

function allowed(key) { return Boolean(state.user && SECTIONS[key] && canAccessSection(key, state.user)); }
function pinsKey() { return `sq-mobile-pins:${state.user?.id || "member"}`; }
function pinnedPages() {
  let saved = [];
  try { saved = JSON.parse(preferences.get(pinsKey()) || "[]"); } catch { /* Invalid preference: recover without blocking navigation. */ }
  return Array.isArray(saved) ? [...new Set(saved)].filter(key => typeof key === "string" && allowed(key)).slice(0, 6) : [];
}
function go(key) {
  if (!allowed(key)) return;
  const first = SECTIONS[key].subpages?.find(page => canAccessSubpage(page, state.user));
  setRoute(key, first?.id || "");
}
function openInstall() {
  if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) {
    toast("Workspace est déjà ouvert en mode application."); return;
  }
  if (pendingInstall) {
    const install = pendingInstall; pendingInstall = null;
    Promise.resolve(install.prompt()).then(() => install.userChoice).then(choice => {
      if (choice?.outcome === "accepted") toast("Installation demandée au navigateur.");
    }).catch(() => toast("L’installation n’est pas disponible dans ce navigateur.", "error"));
    return;
  }
  modal({ title: "Installer Workspace", className: "sq-tools-sheet", content: h("div", { class: "sq-install-copy" },
    h("p", { text: "Sur iPhone ou iPad : ouvrez ce site dans Safari, touchez Partager, puis Sur l’écran d’accueil." }),
    h("p", { text: "Sur Android : ouvrez le menu du navigateur, puis Installer l’application ou Ajouter à l’écran d’accueil, lorsque cette option est disponible." }),
    h("p", { text: "Il s’agit du raccourci de Workspace Web. Une connexion reste nécessaire pour synchroniser et enregistrer les données." })) });
}
async function sharePage() {
  // Never include query strings: authentication URLs can contain activation/reset secrets.
  const section = state.route.section;
  if (!allowed(section)) return;
  const validSubpage = SECTIONS[section].subpages?.some(page => page.id === state.route.subpage && canAccessSubpage(page, state.user));
  const url = `${location.origin}${location.pathname}#/${section}${validSubpage ? `/${encodeURIComponent(state.route.subpage)}` : ""}${state.route.item?`?item=${encodeURIComponent(state.route.item)}`:""}`;
  try {
    if (navigator.share) await navigator.share({ title: `${SECTIONS[section].title} — Squared Workspace`, url });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast("Lien copié. Le destinataire devra disposer des accès nécessaires."); }
    else showCopyLink(url);
  } catch (error) {
    if (error?.name !== "AbortError") showCopyLink(url);
  }
}
function showCopyLink(url) {
  const control = h("input", { value: url, readonly: true, "aria-label": "Lien de la rubrique", onFocus: event => event.target.select() });
  modal({ title: "Copier le lien", content: h("div", { class: "form" }, control, h("p", { class: "sq-install-copy", text: "Copiez ce lien. Les droits d’accès du destinataire restent nécessaires." })) });
}
let mobileCommands={};
export function configureMobile(commands){mobileCommands=commands;}
export function openTools() {
  if (!state.user || document.querySelector(".sq-tools-sheet")) return;
  const content = h("div", { class: "sq-mobile-tools" });
  const actions = h("div", { class: "sq-tools-grid" });
  const pins = pinnedPages(); let dialog;
  function action(label, iconName, run, disabled = false, kind = "") {
    return button(label, { iconName, disabled, kind, onClick: () => { dialog.close(); return run(); } });
  }
  content.append(h("p", { class: "sq-tools-status", role: "status", text: !state.online
    ? "Hors ligne. Les informations déjà affichées restent consultables. Les actions serveur ne sont pas mises en attente : réessayez une fois connecté."
    : state.loading ? "Synchronisation en cours…" : state.lastSyncAt ? `Dernier chargement confirmé ${relativeDate(state.lastSyncAt)}.` : "Aucun chargement de données confirmé pour cette session." }));
  actions.append(
    action("Actualiser les données", "sync", () => mobileCommands.refresh?.(), !state.online || state.loading),
    action("Rechercher partout", "search", () => mobileCommands.search?.()),
    action("Changer de thème", "sun", () => setAppearance({ mode: document.documentElement.dataset.theme === "light" ? "dark" : "light" })),
    action("Partager cette rubrique", "Share", sharePage),
    action("Installer Workspace", "download", openInstall)
  );
  if (allowed(state.route.section)) actions.append(action(pins.includes(state.route.section) ? "Retirer des favoris" : "Épingler cette rubrique", "star", () => {
    const key = state.route.section;
    if (!pins.includes(key) && pins.length >= 6) { toast("Vous pouvez épingler jusqu’à six rubriques. Retirez d’abord un favori.", "error"); return; }
    const next = pins.includes(key) ? pins.filter(value => value !== key) : [...pins, key];
    const stored = preferences.set(pinsKey(), JSON.stringify(next));
    if (stored === false) toast("Le navigateur n’a pas pu enregistrer les favoris.", "error");
    else toast(next.includes(key) ? "Rubrique ajoutée aux favoris" : "Rubrique retirée des favoris");
    document.querySelectorAll(".sq-mobile-pins").forEach(node => node.remove()); schedule();
  }));
  content.append(actions);
  function section(title, keys) {
    const permitted = [...new Set(keys)].filter(allowed);
    if (!permitted.length) return;
    content.append(h("section", {}, h("h4", { class: "sq-tools-heading", text: title }), h("div", { class: "sq-tools-grid" }, ...permitted.map(key => action(SECTIONS[key].title, key, () => go(key))))));
  }
  section("Mes favoris", pins);
  section("Récemment consultés", recent.filter(key => !pins.includes(key) && key !== state.route.section).slice(0, 4));
  section("Mon espace", ["today", "notifications", "profile", "settings"]);
  content.append(action("Se déconnecter", "logout", () => confirmAction({ title: "Se déconnecter ?", message: "Les brouillons de messages conservés dans cette session seront effacés.", confirmLabel: "Déconnexion", danger: true, onConfirm: logout }), false, "danger"));
  dialog = modal({ title: "Outils Workspace", content, className: "sq-tools-sheet", initialFocus: ".modal-head button" });
}
function visibleButtons(root) { return [...root.querySelectorAll(focusable)].filter(node => node.getClientRects().length > 0 && !node.closest("[inert]")); }
function syncDrawer(shell) {
  const sidebar = shell.querySelector(".sidebar"); if (!sidebar) return;
  const open = mobile.matches && state.sidebarOpen;
  sidebar.id = "sq-mobile-navigation";
  const trigger = shell.querySelector(".menu-toggle button");
  trigger?.setAttribute("aria-expanded", String(open)); trigger?.setAttribute("aria-controls", sidebar.id);
  sidebar.inert = mobile.matches && !open;
  const main = shell.querySelector(".main"), tabs = shell.querySelector(".mobile-tabs");
  if (main) main.inert = open;
  if (tabs) tabs.inert = open;
  if (mobile.matches) {
    if (!sidebar.querySelector(".sq-drawer-close")) {
      const close = iconButton("close", "Fermer la navigation", () => setState({ sidebarOpen: false }));
      close.classList.add("sq-drawer-close"); sidebar.prepend(close);
    }
    if (open) { sidebar.setAttribute("role", "dialog"); sidebar.setAttribute("aria-modal", "true"); sidebar.setAttribute("aria-label", "Navigation Workspace"); }
    else { sidebar.removeAttribute("role"); sidebar.removeAttribute("aria-modal"); sidebar.removeAttribute("aria-label"); }
    if (open && !drawerWasOpen) drawerFocus = document.activeElement;
    if (open && !sidebar.contains(document.activeElement) && !document.querySelector("#portal-root > .overlay")) sidebar.querySelector(".sq-drawer-close")?.focus({ preventScroll: true });
    if (!open && drawerWasOpen && !document.querySelector("#portal-root > .overlay")) {
      (drawerFocus?.isConnected && !drawerFocus.closest("[inert]") ? drawerFocus : trigger)?.focus({ preventScroll: true });
    }
    if (!sidebar.querySelector(".sq-mobile-pins")) {
      const pins = pinnedPages();
      if (pins.length) {
        const group = h("div", { class: "sq-mobile-pins" }, h("strong", { text: "Mes favoris" }), ...pins.map(key => button(SECTIONS[key].title, { iconName: key, onClick: () => go(key) })));
        sidebar.querySelector(".sidebar-search")?.after(group);
      }
    }
  } else {
    sidebar.removeAttribute("role"); sidebar.removeAttribute("aria-modal"); sidebar.removeAttribute("aria-label");
  }
  drawerWasOpen = open;
}
function enhanceMailbox(shell) {
  const layout = shell.querySelector(".mail-workspace");
  if (!layout || layout.dataset.focusManaged === "true") return;
  if (mailSearchFocus && !mailSearchFocus.isConnected && document.activeElement === document.body) {
    const replacement = layout.querySelector('.mail-list-pane input[type="search"]');
    if (replacement && replacement.value === mailSearchFocus.value) {
      const start = mailSearchFocus.selectionStart, end = mailSearchFocus.selectionEnd;
      replacement.focus({preventScroll:true}); replacement.setSelectionRange(start, end);
    }
    mailSearchFocus = replacement;
  }
  const reader = layout.querySelector(".mail-reader");
  if (!reader) { layout.classList.remove("sq-mail-open"); return; }
  if (enhancedMailReaders.has(reader)) return;
  enhancedMailReaders.add(reader);
  const previousScroll = window.scrollY;
  const back = button("Retour aux e-mails", {iconName:"ChevronDown", className:"sq-mail-back", onClick: () => {
    layout.classList.remove("sq-mail-open");
    window.scrollTo({top:previousScroll,behavior:"instant"});
    layout.querySelector('.mail-list-pane .mail-item.active')?.focus({preventScroll:true});
  }});
  reader.prepend(back); layout.classList.add("sq-mail-open");
  if (mobile.matches) { window.scrollTo({top:0,behavior:"instant"}); back.focus({preventScroll:true}); }
}
function sync() {
  scheduled = false;
  const shell = document.querySelector(".workspace");
  document.documentElement.classList.toggle("sq-scroll-locked", mobile.matches && Boolean((shell && state.sidebarOpen) || document.querySelector("#portal-root > .overlay")));
  if (!shell || !state.user) return;
  const id = state.user.id || "member";
  if (id !== userId) { userId = id; routeKey = ""; recent = []; }
  const current = `${state.route.section}/${state.route.subpage || ""}`;
  if (current !== routeKey) { routeKey = current; if (allowed(state.route.section)) recent = [state.route.section, ...recent.filter(key => key !== state.route.section)].slice(0, 8); }
  const actions = shell.querySelector(".top-actions");
  if (actions && !actions.querySelector(".sq-mobile-tools-trigger")) {
    actions.querySelectorAll('[aria-label="Changer de thème"], [aria-label="Déconnexion"]').forEach(node => node.classList.add("sq-mobile-overflow"));
    const tools = iconButton("grid", "Outils Workspace", openTools); tools.classList.add("sq-mobile-tools-trigger"); actions.append(tools);
  }
  syncDrawer(shell);
  enhanceMailbox(shell);
  const messageTab = shell.querySelector('.mobile-tabs button[aria-label^="Messages"]');
  if (messageTab) {
    const count = (state.workspace?.conversations || []).reduce((sum, item) => sum + Math.max(0, Number(item.unread) || 0), 0);
    let badge = messageTab.querySelector(".sq-tab-count");
    if (count > 0) {
      if (!badge) { badge = h("span", { class: "sq-tab-count", "aria-hidden": "true" }); messageTab.append(badge); }
      const text = count > 99 ? "99+" : String(count); if (badge.textContent !== text) badge.textContent = text;
    } else badge?.remove();
    messageTab.setAttribute("aria-label", count ? `Messages, ${count} non lus` : "Messages");
  }
  const networkCopy = shell.querySelector(".network-banner span");
  const offlineCopy = "Connexion interrompue. Aucune action serveur n’est mise en attente. Réessayez après le retour du réseau.";
  if (networkCopy && networkCopy.textContent !== offlineCopy) networkCopy.textContent = offlineCopy;
  shell.querySelectorAll(".content table:has(thead)").forEach(table => {
    if (table.closest(".sq-scroll-region") || table.getAttribute("role") === "presentation") return;
    const wrapper = h("div", { class: "sq-scroll-region", tabindex: "0", role: "region", "aria-label": table.getAttribute("aria-label") || "Tableau défilant horizontalement" });
    table.before(wrapper); wrapper.append(table);
  });
  shell.querySelectorAll(".subnav").forEach(nav => {
    if (enhancedSubnavs.has(nav)) return; enhancedSubnavs.add(nav);
    const active = nav.querySelector('[aria-current="page"]');
    if (active && mobile.matches) nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - 8;
  });
}
function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(sync); } }
function viewport() {
  viewportFrame = 0;
  const visual = window.visualViewport;
  if (visual && visual.scale > 1.1) return; // Do not counteract the user's pinch zoom.
  const editing = document.activeElement?.matches("input,textarea,select,[contenteditable=true]");
  if (!editing) baselineHeight = window.innerHeight;
  baselineHeight = Math.max(baselineHeight, window.innerHeight);
  const height = visual?.height || window.innerHeight;
  const keyboard = mobile.matches && editing && baselineHeight - height > 120;
  document.documentElement.style.setProperty("--sq-viewport-height", `${Math.round(height)}px`);
  document.documentElement.style.setProperty("--sq-viewport-top", `${Math.round(visual?.offsetTop || 0)}px`);
  document.documentElement.classList.toggle("sq-keyboard-open", Boolean(keyboard));
}
function scheduleViewport() { if (!viewportFrame) viewportFrame = requestAnimationFrame(viewport); }
export function initMobile() {
  if (initialized) return; initialized = true;
  const app = document.querySelector("#app"), portal = document.querySelector("#portal-root");
  const observer = new MutationObserver(schedule);
  if (app) observer.observe(app, { childList: true, subtree: true });
  if (portal) observer.observe(portal, { childList: true, subtree: true });
  subscribe(schedule);
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); pendingInstall = event; });
  window.addEventListener("appinstalled", () => { pendingInstall = null; });
  window.addEventListener("sq:session-ended", () => { recent = []; userId = ""; routeKey = ""; drawerWasOpen = false; drawerFocus = null; schedule(); });
  mobile.addEventListener("change", () => { if (!mobile.matches && state.sidebarOpen) setState({ sidebarOpen: false }); baselineHeight = 0; scheduleViewport(); schedule(); });
  window.addEventListener("resize", scheduleViewport, { passive: true });
  window.addEventListener("orientationchange", () => { baselineHeight = 0; scheduleViewport(); });
  window.visualViewport?.addEventListener("resize", scheduleViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleViewport, { passive: true });
  document.addEventListener("focusin", event => {
    mailSearchFocus = event.target.matches?.('.mail-list-pane input[type="search"]') ? event.target : null;
    scheduleViewport();
  });
  document.addEventListener("focusout", scheduleViewport);
  document.addEventListener("keydown", event => {
    if (!mobile.matches || !state.sidebarOpen || document.querySelector("#portal-root > .overlay")) return;
    const sidebar = document.querySelector(".sidebar"); if (!sidebar) return;
    if (event.key === "Escape") { event.preventDefault(); setState({ sidebarOpen: false }); return; }
    if (event.key !== "Tab") return;
    const nodes = visibleButtons(sidebar), first = nodes[0], last = nodes.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  scheduleViewport(); schedule();
}
