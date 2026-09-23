import { getDraft, saveDraft } from "../focus-state.js";
import { state, subscribe, setRoute } from "../store.js";
import { loadWorkspace, sendConversationMessage, createConversation, markConversationRead } from "../api.js";
import { h, pageHeader, card, button, iconButton, modal, field, input, textarea, toast, errorMessage, emptyState, formatDate, profileAvatar, announce } from "../ui.js";

const conversationMessages = conversation => Array.isArray(conversation?.messages) ? conversation.messages : [];
const memberId = member => member.id || member.memberId || member.member_id;
const memberName = member => member.name || `${member.firstName || member.first_name || ""} ${member.lastName || member.last_name || ""}`.trim() || member.email || "Membre";
const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const messageAuthorId = message => message.authorId || message.authorID || message.author_id || message.senderId || message.senderID;
const messageDate = message => message.createdAt || message.created_at || message.time;
const messageBody = message => message.body || message.text || "";
const teamMember = id => (state.workspace?.team || []).find(member => memberId(member) === id);
const volatileDrafts = new Set();
const drafts = new Map(); // Memory only: never cache private messages in localStorage or the service worker.
const sending = new Set(), reading = new Set();
let owner = "", selectedId = null, listQuery = "", unreadOnly = false;
let activeRefresh = null, unsubscribeView = null, generation = 0;
function resetMessages() {
  owner = ""; selectedId = null; listQuery = ""; unreadOnly = false;
  drafts.clear(); volatileDrafts.clear(); sending.clear(); reading.clear(); activeRefresh = null; generation++;
  unsubscribeView?.(); unsubscribeView = null;
}
window.addEventListener("sq:session-ended", resetMessages);
window.addEventListener("sq:messages-refresh", () => activeRefresh?.());
window.addEventListener("beforeunload", event => { if (volatileDrafts.size) { event.preventDefault(); event.returnValue = ""; } });
function conversationPerson(conversation) {
  if (conversation.avatarData || conversation.avatar_data) return { name: conversation.name || "Conversation", avatarData: conversation.avatarData || conversation.avatar_data };
  const other = (conversation.participantIDs || conversation.participantIds || []).find(id => id !== state.user?.id);
  return teamMember(other) || { name: conversation.name || "Conversation" };
}
function participantNames(conversation) {
  if (Array.isArray(conversation.participants) && conversation.participants.length) return conversation.participants.map(value => typeof value === "string" ? value : memberName(value)).join(" · ");
  const ids = conversation.participantIDs || conversation.participantIds || [];
  const names = ids.filter(id => id !== state.user?.id).map(id => teamMember(id)).filter(Boolean).map(memberName);
  return names.length ? names.join(" · ") : `${ids.length} participant(s)`;
}
function newConversation(reload) {
  if (!state.online) { toast("Reconnectez-vous pour créer une conversation.", "error"); return; }
  const members = (state.workspace?.team || []).filter(member => memberId(member) && memberId(member) !== state.user?.id);
  const name = input("", { placeholder: "Nom de la conversation", maxLength: 120 });
  const selected = new Set(); let creating = false;
  const picker = members.length ? h("div", { class: "member-picker" }, ...members.map(member => {
    const id = memberId(member), check = h("input", { type: "checkbox" });
    check.addEventListener("change", () => check.checked ? selected.add(id) : selected.delete(id));
    return h("label", { class: "member-choice" }, check, profileAvatar(member, { className: "member-avatar", size: 38, ariaHidden: true }), h("span", {}, h("strong", { text: memberName(member) }), h("small", { text: member.title || member.role || member.email || "" })));
  })) : emptyState("Aucun membre disponible", "Aucun autre membre n’est actuellement visible dans votre périmètre.", "users");
  modal({ title: "Nouvelle conversation", wide: true,
    content: h("div", { class: "form" }, field("Nom", name, "Optionnel pour une conversation directe."), h("div", {}, h("div", { class: "card-title", text: "Participants" }), h("div", { class: "card-subtitle", text: "Sélectionnez les membres de cette conversation." })), picker),
    actions: [{ label: "Créer", kind: "primary", icon: "add", onClick: async close => {
      if (creating) return;
      const ids = [...selected]; if (!ids.length) { toast("Sélectionnez au moins un participant.", "error"); return; }
      if (!state.online) { toast("Reconnectez-vous pour créer la conversation.", "error"); return; }
      creating = true; const id = crypto.randomUUID(), user = state.user?.id;
      try {
        if (user && !ids.includes(user)) ids.unshift(user);
        await createConversation({ id, name: name.value.trim() || "Nouvelle conversation", participants: [], unread: 0, messages: [], participantIDs: ids, kind: ids.length === 2 ? "direct" : "team", createdAt: new Date().toISOString() });
        if (state.user?.id !== user) return;
        toast("Conversation créée"); close(); selectedId = id;
        try { await reload(); } catch (error) { toast(`Conversation créée, mais actualisation impossible : ${errorMessage(error)}`, "error"); }
      } catch (error) { if (state.user?.id === user) toast(errorMessage(error), "error", 6000); }
      finally { creating = false; }
    } }]
  });
}
export async function renderMessages() {
  const currentOwner = state.user?.id || "member";
  if (owner !== currentOwner) { resetMessages(); owner = currentOwner; }
  unsubscribeView?.(); const version = ++generation;
  if(state.route.item)selectedId=state.route.item;
  const root = h("div", { class: "sq-messages" }), left = h("div"), right = h("div", { class: "sq-thread-content" });
  const leftCard = card("Conversations", "Canaux auxquels vous avez accès.", left, { iconName: "messages", className: "sq-conversation-list" });
  const rightCard = card("Discussion", "Sélectionnez une conversation.", right, { iconName: "mail", className: "sq-message-panel" });
  rightCard.querySelector(":scope > .card-head")?.remove();
  let messageBox = null, sendButton = null, draftNote = null, threadQuery = "", threadSearchOpen = false;
  let listScroll = 0, shownConversation = null;
  const alive = () => version === generation && owner === currentOwner && state.user?.id === currentOwner;
  const conversations = () => Array.isArray(state.workspace?.conversations) ? state.workspace.conversations : [];
  const selected = () => conversations().find(conversation => conversation.id === selectedId);
  const draftKey = id => `${currentOwner}:${id}`;
  const reload = async () => { await loadWorkspace(); if (alive()) paint(); };
  root.append(pageHeader({ eyebrow: "Communication", title: "Messages", subtitle: "Vos échanges et vos décisions, dans leur contexte.", actions: [button("Nouvelle conversation", { kind: "primary", iconName: "add", onClick: () => newConversation(reload) })] }), h("div", { class: "split-view" }, leftCard, rightCard));
  const search = h("input", { class: "search-input", type: "search", placeholder: "Rechercher une conversation…", "aria-label": "Rechercher une conversation", value: listQuery });
  const results = h("div", { class: "section-gap" });
  const resultCount = h("span", { class: "sr-only", role: "status", "aria-live": "polite" });
  const allButton = button("Toutes", { pressed: !unreadOnly, onClick: () => setFilter(false) });
  const unreadButton = button("Non lues", { pressed: unreadOnly, onClick: () => setFilter(true) });
  left.append(h("div", { class: "sq-conversation-search" }, search, allButton, unreadButton), resultCount, results);
  search.addEventListener("input", () => { listQuery = search.value; drawList(); });
  function setFilter(value) {
    unreadOnly = value; allButton.setAttribute("aria-pressed", String(!value)); unreadButton.setAttribute("aria-pressed", String(value)); drawList();
  }
  function drawList() {
    if (!alive()) return;
    const term = normalize(listQuery.trim());
    const filtered = conversations().filter(conversation => {
      const last = conversationMessages(conversation).at(-1);
      return (!unreadOnly || Number(conversation.unread) > 0) && normalize(`${conversation.name || ""} ${participantNames(conversation)} ${last ? messageBody(last) : ""}`).includes(term);
    });
    results.replaceChildren(filtered.length ? h("div", { class: "mail-list" }, ...filtered.map(conversation => {
      const messages = conversationMessages(conversation), last = messages.at(-1), unread = Math.max(0, Number(conversation.unread) || 0);
      const draft = drafts.get(draftKey(conversation.id)) || getDraft(conversation.id);
      return h("button", { class: `mail-item conversation-item ${unread ? "unread" : ""} ${selectedId === conversation.id ? "active" : ""}`, type: "button", "aria-pressed": String(selectedId === conversation.id), onClick: () => openConversation(conversation.id, true) },
        profileAvatar(conversationPerson(conversation), { className: "conversation-avatar", size: 38, ariaHidden: true }),
        h("span", { class: "mail-item-content" }, h("strong", { text: conversation.name || "Conversation" }), h("p", { text: draft ? "Brouillon non envoyé" : last ? messageBody(last).slice(0, 90) : participantNames(conversation) }), h("p", { text: last && messageDate(last) ? formatDate(messageDate(last)) : `${messages.length} message(s)` })),
        unread ? h("span", { class: "conversation-unread", "aria-label": `${unread} messages non lus`, text: unread > 99 ? "99+" : String(unread) }) : null);
    })) : emptyState(term || unreadOnly ? "Aucun résultat" : "Aucune conversation", unreadOnly ? "Aucune conversation non lue ne correspond à ce filtre." : term ? "Aucune conversation ne correspond à cette recherche." : "Créez une conversation avec un membre Workspace.", "messages"));
    resultCount.textContent = `${filtered.length} conversation(s)`;
  }
  function updateSendState() {
    const conversation = selected(); if (!conversation || !sendButton || !messageBox) return;
    const busy = sending.has(draftKey(conversation.id));
    sendButton.disabled = busy || !state.online || !messageBox.value.trim() || messageBox.value.length > 4000;
    sendButton.setAttribute("aria-busy", String(busy)); messageBox.disabled = busy;
    if (draftNote) draftNote.textContent = !state.online ? "Hors ligne : votre brouillon reste dans cette session. Il ne sera pas envoyé automatiquement." : messageBox.value ? (messageBox.dataset.draftStored==="true"?"Brouillon conservé dans cet onglet, y compris après rechargement, pendant 24 h maximum. Effacé à la déconnexion.":"Stockage indisponible : brouillon en mémoire uniquement. Copiez-le avant de recharger.") : "Les messages sont envoyés uniquement après validation.";
  }
  function backToList() {
    selectedId = null; shownConversation = null; root.classList.remove("sq-conversation-open"); drawList();
    if(state.route.item){setRoute("messages");return;}
    requestAnimationFrame(() => { window.scrollTo({ top: listScroll, behavior: "instant" }); search.focus({ preventScroll: true }); });
  }
  function openConversation(id, userInitiated = false) {
    if (!alive()) return;
    if (selectedId !== id) { threadQuery = ""; threadSearchOpen = false; }
    if (userInitiated && !root.classList.contains("sq-conversation-open")) listScroll = window.scrollY;
    if(userInitiated&&state.route.item!==id){setRoute("messages","",id);return;}
    selectedId = id; drawList(); drawThread(userInitiated);
  }
  function drawThread(userInitiated = false) {
    const conversation = selected();
    root.classList.toggle("sq-conversation-open", Boolean(conversation));
    if (!conversation) { if(state.route.item){root.classList.add("sq-conversation-open");right.replaceChildren(button("Retour aux conversations",{onClick:()=>{selectedId=null;setRoute("messages");}}),emptyState("Conversation indisponible","Elle n’existe plus ou ne fait pas partie de votre périmètre.","lock"));return;} selectedId = null; right.replaceChildren(emptyState("Sélectionnez une conversation", "Les messages et le champ de réponse apparaîtront ici.", "mail")); return; }
    const key = draftKey(conversation.id), messages = conversationMessages(conversation);
    const oldThread = right.querySelector(".message-thread"), oldScroll = oldThread?.scrollTop || 0;
    const atBottom = !oldThread || oldThread.scrollHeight - oldThread.clientHeight - oldThread.scrollTop < 60;
    const newThread = shownConversation !== conversation.id; shownConversation = conversation.id;
    const back = button("Retour", { iconName: "ChevronDown", ariaLabel: "Retour aux conversations", className: "sq-conversation-back", onClick: backToList });
    const thread = h("div", { class: "message-thread", role: "log", "aria-live": "polite", "aria-label": `Messages de ${conversation.name || "la conversation"}`, tabindex: "0" });
    const threadSearch = h("input", { class: "search-input", type: "search", value: threadQuery, placeholder: "Rechercher dans cette discussion…", "aria-label": "Rechercher dans cette discussion" });
    const searchArea = h("div", { class: "sq-message-search", hidden: !threadSearchOpen }, threadSearch);
    const searchToggle = iconButton("search", "Rechercher dans la discussion", () => { threadSearchOpen = !threadSearchOpen; searchArea.hidden = !threadSearchOpen; searchToggle.setAttribute("aria-expanded", String(threadSearchOpen)); if (threadSearchOpen) threadSearch.focus(); else { threadQuery = ""; threadSearch.value = ""; drawBubbles(); } });
    searchToggle.setAttribute("aria-expanded", String(threadSearchOpen));
    const latest = button("Derniers messages", { iconName: "ChevronDown", className: "sq-scroll-latest", onClick: () => { thread.scrollTo({ top: thread.scrollHeight, behavior: state.appearance?.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); } });
    latest.hidden = true;
    const drawBubbles = () => {
      const term = normalize(threadQuery.trim()), filtered = term ? messages.filter(message => normalize(`${messageBody(message)} ${message.authorName || message.author || ""}`).includes(term)) : messages;
      const nodes = []; let previousDay = "";
      for (const message of filtered) {
        const date = new Date(messageDate(message)), valid = Number.isFinite(date.getTime());
        const day = valid ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date) : "Date indisponible";
        if (day !== previousDay) { nodes.push(h("div", { class: "sq-message-date", text: day })); previousDay = day; }
        const authorId = messageAuthorId(message), mine = authorId === state.user?.id;
        const author = mine ? state.user : (teamMember(authorId) || { name: message.authorName || message.author || "Membre", avatarData: message.authorAvatarData || message.author_avatar_data });
        nodes.push(h("article", { class: `message-bubble ${mine ? "mine" : ""}` }, h("div", { class: "message-bubble-head" }, profileAvatar(author, { className: "message-avatar", size: 28, ariaHidden: true }), h("div", {}, h("strong", { text: mine ? "Vous" : message.authorName || message.author || memberName(author) }), h("span", { text: valid ? new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(date) : "" }))), h("p", { text: messageBody(message) })));
      }
      thread.replaceChildren(...(nodes.length ? nodes : [emptyState(term ? "Aucun message correspondant" : "Aucun message", term ? "Essayez un autre mot dans cette discussion." : "Commencez la conversation.", "messages")]));
    };
    threadSearch.addEventListener("input", () => { threadQuery = threadSearch.value; drawBubbles(); });
    thread.addEventListener("scroll", () => { latest.hidden = thread.scrollHeight - thread.clientHeight - thread.scrollTop < 100; }, { passive: true });
    messageBox = textarea(drafts.get(key) || getDraft(conversation.id) || "", { placeholder: "Écrire un message…", maxLength: 4000, rows: 2 });
    messageBox.setAttribute("aria-label", "Écrire un message");
    const box = messageBox, count = h("span", { class: "composer-count" });
    draftNote = h("p", { class: "sq-message-draft" });
    const updateDraft = () => {
      if (box.value) drafts.set(key, box.value); else drafts.delete(key);
      const stored=saveDraft(conversation.id,box.value);
      box.dataset.draftStored=String(stored);
      if(box.value&&!stored)volatileDrafts.add(key);else volatileDrafts.delete(key);
      count.textContent = `${new Intl.NumberFormat("fr-FR").format(box.value.length)} / 4 000`;
      count.classList.toggle("warning", box.value.length > 3600); updateSendState();
    };
    const send = async () => {
      const text = box.value.trim();
      if (!text || text.length > 4000 || sending.has(key)) return;
      if (!state.online) { toast("Reconnectez-vous pour envoyer ce message. Le brouillon est conservé.", "error"); return; }
      sending.add(key); updateSendState(); let sent = false;
      try {
        await sendConversationMessage(conversation.id, text); sent = true;
        if (owner !== currentOwner || state.user?.id !== currentOwner) return;
        drafts.delete(key); volatileDrafts.delete(key); saveDraft(conversation.id,""); box.value = ""; announce("Message envoyé");
        try { await loadWorkspace(); }
        catch { toast("Message envoyé, mais actualisation impossible. Ne le renvoyez pas : actualisez la discussion après reconnexion.", "error", 7000); }
      } catch (error) { if (owner === currentOwner && state.user?.id === currentOwner) toast(errorMessage(error), "error"); }
      finally {
        sending.delete(key);
        if (owner === currentOwner && state.user?.id === currentOwner) { if (sent) activeRefresh?.(); else updateSendState(); }
      }
    };
    sendButton = button("Envoyer", { kind: "primary", iconName: "send" });
    sendButton.addEventListener("click", () => { void send(); });
    box.addEventListener("input", updateDraft);
    box.addEventListener("keydown", event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) { event.preventDefault(); void send(); } });
    right.replaceChildren(h("div", { class: "sq-thread-heading" }, back, h("div", {}, h("strong", { text: conversation.name || "Conversation" }), h("small", { text: participantNames(conversation) })), searchToggle), searchArea, thread, latest, h("div", { class: "composer" }, box, sendButton), h("div", { class: "composer-meta" }, h("span", { text: "⌘/Ctrl + Entrée pour envoyer" }), count), draftNote);
    drawBubbles(); updateDraft();
    requestAnimationFrame(() => {
      if (!root.isConnected || !alive()) return;
      thread.scrollTop = newThread || atBottom ? thread.scrollHeight : oldScroll;
      if (userInitiated && window.matchMedia("(max-width: 880px)").matches) { window.scrollTo({ top: 0, behavior: "instant" }); back.focus({ preventScroll: true }); }
    });
    const last = messages.at(-1), readKey = `${key}:${last?.id || "empty"}`;
    if (state.online && Number(conversation.unread) > 0 && !reading.has(readKey)) {
      reading.add(readKey);
      markConversationRead(conversation.id, last?.id || null).then(() => {
        if (!alive()) return;
        const updated = conversations().find(item => item.id === conversation.id); if (updated) updated.unread = 0;
        drawList();
      }).catch(() => {}).finally(() => reading.delete(readKey));
    }
  }
  function paint() {
    if (!alive()) return;
    const focused = document.activeElement;
    const editingMessage = focused === messageBox;
    const editingSearch = right.querySelector(".sq-message-search input") === focused;
    const selection = editingMessage || editingSearch ? [focused.selectionStart, focused.selectionEnd] : null;
    drawList(); drawThread();
    const next = editingMessage ? messageBox : editingSearch ? right.querySelector(".sq-message-search input") : null;
    if (next && root.isConnected) { next.focus({preventScroll:true}); if (selection) next.setSelectionRange(...selection); }
  }
  activeRefresh = () => { if (root.isConnected && alive()) paint(); };
  unsubscribeView = subscribe(() => { if (root.isConnected && alive()) updateSendState(); });
  if (state.online) await loadWorkspace();
  if (alive()) paint();
  return root;
}
