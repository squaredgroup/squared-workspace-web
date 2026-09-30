import { getDraft, saveDraft } from "../focus-state.js";
import { state, subscribe, setRoute, setAppearance } from "../store.js";
import { loadWorkspace, sendConversationMessage, createConversation, markConversationRead, editConversationMessage, deleteConversationMessage, reactToConversationMessage, flagConversationMessage, updateConversationPreferences, updateConversationDetails, updateConversationParticipants, deleteConversation, uploadFile, downloadFile, fetchFileBlob } from "../api.js";
import { h, card, button, icon, iconButton, modal, field, input, textarea, toast, errorMessage, emptyState, formatDate, profileAvatar, announce, confirmAction } from "../ui.js";
import { openProposalPicker, proposalCard } from "../message-proposals.js";
import { openPDF, drawPDFPage } from "../pdf-reader.js";

const conversationMessages = conversation => Array.isArray(conversation?.messages) ? conversation.messages : [];
const memberId = member => member.id || member.memberId || member.member_id;
const memberName = member => member.name || `${member.firstName || member.first_name || ""} ${member.lastName || member.last_name || ""}`.trim() || member.email || "Membre";
const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const messageAuthorId = message => message.authorId || message.authorID || message.author_id || message.senderId || message.senderID;
const messageDate = message => message.createdAt || message.created_at || message.time;
const messageBody = message => message.body || message.text || "";
function conversationTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(date);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}
const teamMember = id => (state.workspace?.team || []).find(member => memberId(member) === id);
const volatileDrafts = new Set();
// Draft content is held exclusively by the bounded, per-session draft store.
const sending = new Set(), reading = new Set();
let owner = "", selectedId = null, listQuery = "", listMode = "all";
let activeRefresh = null, unsubscribeView = null, generation = 0;
let mediaAbort = new AbortController(), mediaObserver = null;
const mediaURLs = new Set();
let activeViewer = null, activeGallery = null;
function releaseMedia() {
  mediaAbort.abort(); mediaAbort = new AbortController();
  mediaObserver?.disconnect(); mediaObserver = null;
  for (const url of mediaURLs) URL.revokeObjectURL(url);
  mediaURLs.clear();
}
function attachmentKind(file) {
  const name = String(file.fileName || "").toLowerCase();
  const type = String(file.mediaType || file.contentType || "").toLowerCase();
  if (/^image\/(?:png|jpeg|gif|webp|avif|heic|heif|bmp)$/.test(type) || /\.(?:png|jpe?g|gif|webp|avif|heic|heif|bmp)$/.test(name)) return "image";
  if (/^video\/(?:mp4|webm|ogg|quicktime|x-m4v)$/.test(type) || /\.(?:mp4|webm|ogv|mov|m4v)$/.test(name)) return "video";
  if (/^audio\/(?:mpeg|mp4|aac|ogg|wav|webm|x-m4a|flac)$/.test(type) || /\.(?:mp3|m4a|aac|ogg|wav|webm|flac)$/.test(name)) return "audio";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === "text/plain" || name.endsWith(".txt")) return "text";
  return "document";
}
const attachmentLabel = kind => ({ image: "Image", video: "Vidéo", audio: "Message vocal", pdf: "Document PDF", text: "Document texte", document: "Document" })[kind];
function typedAttachmentBlob(blob, kind, file) {
  const fallbackType = ({ image: "image/png", video: "video/mp4", audio: "audio/mpeg", pdf: "application/pdf", text: "text/plain" })[kind];
  const allowedType = ({ image: /^image\/(?:png|jpeg|gif|webp|avif|heic|heif|bmp)$/, video: /^video\/(?:mp4|webm|ogg|quicktime|x-m4v)$/, audio: /^audio\/(?:mpeg|mp4|aac|ogg|wav|webm|x-m4a|flac)$/, pdf: /^application\/pdf$/, text: /^text\/plain$/ })[kind];
  const type = [blob.type, file?.mediaType, file?.contentType].find(value => allowedType.test(String(value || "").toLowerCase()));
  return blob.slice(0, blob.size, type || fallbackType);
}
function openAttachmentViewer(file, cachedBlob = null) {
  activeViewer?.close();
  const kind = attachmentKind(file), name = file.fileName || "Fichier", id = file.storageKey || file.id;
  const controller = new AbortController(), content = h("div", { class: `sq-reader-content sq-reader-${kind}`, role: "status" }, h("p", { class: "sq-media-loading", text: "Ouverture du fichier…" }));
  let readerURL = "", reader, pdfResource = null, pageRender = null;
  reader = modal({ title: name, wide: true, className: "sq-media-viewer", content,
    actions: [{ label: "Télécharger", icon: "download", disabled: !id, onClick: async () => {
      try { await downloadFile(id, name); } catch (error) { toast(errorMessage(error), "error"); }
    } }],
    onClose: () => { controller.abort(); pageRender?.abort(); void pdfResource?.destroy(); if (readerURL) URL.revokeObjectURL(readerURL); if (activeViewer === reader) activeViewer = null; }
  });
  activeViewer = reader;
  if (kind === "document" || !id) {
    content.replaceChildren(h("div", { class: "sq-reader-unavailable" }, h("strong", { text: attachmentLabel(kind) }), h("p", { text: id ? "Ce format ne peut pas être prévisualisé dans le navigateur. Vous pouvez le télécharger." : "Ce fichier n’est plus disponible." })));
    return;
  }
  const currentUser = state.user?.id;
  void (async () => {
    try {
      const blob = cachedBlob || typedAttachmentBlob(await fetchFileBlob(id, { signal: controller.signal }), kind, file);
      if (controller.signal.aborted || state.user?.id !== currentUser || activeViewer !== reader) return;
      if (kind === "text") {
        if (blob.size > 256 * 1024) throw new Error("Ce document texte est trop volumineux pour être affiché. Téléchargez-le pour le consulter.");
        const value = await blob.text();
        if (!controller.signal.aborted) content.replaceChildren(h("pre", { text: value }));
        return;
      }
      if (kind === "pdf") {
        const resource = await openPDF(blob);
        if (controller.signal.aborted || activeViewer !== reader) { void resource.destroy(); return; }
        pdfResource = resource;
        let currentPage = 1, renderComplete = Promise.resolve();
        const previous = button("Page précédente", { small: true, onClick: () => void showPage(currentPage - 1) });
        const next = button("Page suivante", { small: true, onClick: () => void showPage(currentPage + 1) });
        const counter = h("span", { class: "sq-pdf-counter", "aria-live": "polite" });
        const canvas = h("canvas", { role: "img", "aria-label": `Lecteur PDF : ${name}` });
        const sheet = h("div", { class: "sq-pdf-sheet" }, canvas);
        content.removeAttribute("role");
        content.replaceChildren(h("div", { class: "sq-pdf-controls" }, previous, counter, next), h("div", { class: "sq-pdf-scroll" }, sheet));
        async function showPage(number) {
          if (controller.signal.aborted || number < 1 || number > resource.document.numPages) return;
          pageRender?.abort(); pageRender = new AbortController();
          const signal = pageRender.signal;
          currentPage = number;
          previous.disabled = number === 1;
          next.disabled = number === resource.document.numPages;
          counter.textContent = `${number} / ${resource.document.numPages}`;
          delete canvas.dataset.rendered;
          sheet.setAttribute("aria-busy", "true");
          try {
            await renderComplete.catch(() => {});
            if (signal.aborted) return;
            renderComplete = drawPDFPage(resource.document, number, canvas, Math.min(920, content.clientWidth - 32), signal);
            await renderComplete;
            if (!signal.aborted) { canvas.dataset.rendered = "true"; sheet.removeAttribute("aria-busy"); }
          } catch (error) {
            if (!signal.aborted) content.replaceChildren(h("p", { class: "sq-reader-error", text: errorMessage(error) }));
          }
        }
        await showPage(1);
        return;
      }
      readerURL = URL.createObjectURL(blob);
      const media = kind === "image" ? h("img", { src: readerURL, alt: name, onError: () => content.replaceChildren(h("p", { text: "L’image ne peut pas être affichée. Téléchargez-la pour la consulter." })) })
        : h(kind, { src: readerURL, controls: true, preload: "metadata", "aria-label": name, onError: () => content.replaceChildren(h("p", { text: "Ce média ne peut pas être lu dans le navigateur. Téléchargez-le pour le consulter." })) });
      if (!controller.signal.aborted) content.replaceChildren(media);
    } catch (error) { if (!controller.signal.aborted) content.replaceChildren(h("p", { class: "sq-reader-error", text: errorMessage(error) })); }
  })();
}
function attachmentPreview(file, observer, signal, resourceURLs = mediaURLs) {
  const kind = attachmentKind(file), name = file.fileName || "Fichier", id = file.storageKey || file.id;
  const detail = h("small", { text: attachmentLabel(kind) });
  let cachedBlob = null;
  const preview = h("div", { class: `sq-attachment-preview sq-attachment-${kind}`, "aria-label": `Aperçu de ${name}` });
  const fallback = () => preview.replaceChildren(h("span", { class: "sq-file-symbol", "aria-hidden": "true", text: kind === "pdf" ? "PDF" : kind === "text" ? "TXT" : "▤" }), h("span", { text: kind === "document" ? "Aperçu non disponible pour ce format" : "Aperçu indisponible — télécharger le fichier" }));
  if (kind === "audio" && id) preview.replaceChildren(h("span", { class: "sq-audio-preview", text: "▶ Écouter le message vocal" }));
  else if (kind === "document" || !id) fallback();
  else {
    preview.replaceChildren(h("span", { class: "sq-media-loading", text: "Chargement de l’aperçu…" }));
    const load = async () => {
      try {
        const blob = await fetchFileBlob(id, { signal });
        if (signal.aborted) return;
        // The API serves attachments as downloads; a local blob URL lets the browser display them without exposing a token in the page URL.
        const typedBlob = typedAttachmentBlob(blob, kind, file);
        cachedBlob = typedBlob;
        if (kind === "text") {
          if (blob.size > 256 * 1024) { fallback(); return; }
          const value = await typedBlob.text();
          if (!signal.aborted) preview.replaceChildren(h("pre", { text: value.slice(0, 4000) }));
          return;
        }
        if (kind === "pdf") {
          const canvas = h("canvas", { role: "img", "aria-label": `Aperçu PDF : ${name}` });
          preview.replaceChildren(canvas);
          let resource;
          try {
            resource = await openPDF(typedBlob);
            detail.textContent = `PDF · ${resource.document.numPages} page${resource.document.numPages > 1 ? "s" : ""}`;
            if (!signal.aborted) { await drawPDFPage(resource.document, 1, canvas, Math.min(108, preview.clientWidth - 20), signal); if (!signal.aborted) canvas.dataset.rendered = "true"; }
          } finally { if (resource) await resource.destroy(); }
          return;
        }
        const url = URL.createObjectURL(typedBlob); resourceURLs.add(url);
        const media = kind === "image" ? h("img", { src: url, alt: name, loading: "lazy", onError: fallback })
          : h(kind, { src: url, preload: "metadata", "aria-label": name, onError: fallback });
        if (signal.aborted) { URL.revokeObjectURL(url); resourceURLs.delete(url); return; }
        preview.replaceChildren(media);
      } catch (error) { if (!signal.aborted) fallback(); }
    };
    if (observer) { preview.addEventListener("sq:preview-visible", load, { once: true }); observer.observe(preview); }
    else void load();
  }
  const open = button("Ouvrir", { iconName: "Expand", className: "sq-attachment-open", ariaLabel: `Ouvrir ${name} dans le lecteur`, onClick: () => openAttachmentViewer(file, cachedBlob) });
  const download = button("Télécharger", { iconName: "download", small: true, className: "sq-attachment-download", disabled: !id, ariaLabel: `Télécharger ${name}`, onClick: async () => { try { await downloadFile(id, name); } catch (error) { toast(errorMessage(error), "error"); } } });
  const opaqueName = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\.[a-z0-9]+)?$/i.test(name);
  const caption = h("button", { type: "button", class: "sq-attachment-caption", "aria-label": `Lire ${name}`, onClick: () => openAttachmentViewer(file, cachedBlob) }, h("strong", { text: opaqueName ? attachmentLabel(kind) : name, title: name }), detail);
  return h("div", { class: `sq-attachment sq-attachment-card-${kind}` }, h("div", { class: "sq-attachment-stage" }, preview, open), h("div", { class: "sq-attachment-footer" }, icon(kind === "image" ? "image" : kind === "video" ? "external" : "document", 18), caption, download));
}
function resetMessages() {
  owner = ""; selectedId = null; listQuery = ""; listMode = "all";
  volatileDrafts.clear(); sending.clear(); reading.clear(); activeRefresh = null; generation++;
  activeViewer?.close(); activeGallery?.close();
  releaseMedia();
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
        try { await loadWorkspace(); setRoute("messages","",id); } catch (error) { toast(`Conversation créée, mais actualisation impossible : ${errorMessage(error)}`, "error"); }
      } catch (error) { if (state.user?.id === user) toast(errorMessage(error), "error", 6000); }
      finally { creating = false; }
    } }]
  });
}
export async function renderMessages() {
  const currentOwner = state.user?.id || "member";
  if (owner !== currentOwner) { resetMessages(); owner = currentOwner; }
  unsubscribeView?.(); const version = ++generation;
  selectedId=state.route.item||null;
  const root = h("div", { class: "sq-messages" }), left = h("div", { class: "sq-inbox-body" }), right = h("div", { class: "sq-thread-content" });
  const leftCard = card("Conversations", "Canaux auxquels vous avez accès.", left, { iconName: "messages", className: "sq-conversation-list" });
  const rightCard = card("Discussion", "Sélectionnez une conversation.", right, { iconName: "mail", className: "sq-message-panel" });
  rightCard.querySelector(":scope > .card-head")?.remove();
  let messageBox = null, sendButton = null, draftNote = null, threadQuery = "", threadSearchOpen = false, replyingTo = null, linkedContext = null;
  let listScroll = 0, shownConversation = null;
  const alive = () => version === generation && owner === currentOwner && state.user?.id === currentOwner;
  const conversations = () => Array.isArray(state.workspace?.conversations) ? state.workspace.conversations : [];
  const selected = () => conversations().find(conversation => conversation.id === selectedId);
  const draftKey = id => `${currentOwner}:${id}`;
  const reload = async () => { await loadWorkspace(); if (alive()) paint(); };
  const inboxCount = h("span", { class: "sq-inbox-count" });
  const inboxSummary = h("small", { class: "sq-inbox-summary" });
  leftCard.prepend(h("div", { class: "sq-inbox-brandbar" }, h("div", { class: "sq-inbox-brand" }, h("img", { src: "/assets/squaredgroup-logo.png", alt: "Squared", width: 28, height: 28 }), h("span", { text: "WORKSPACE", class: "sq-inbox-wordmark" })), h("div", { class: "sq-inbox-account" }, iconButton("sun", "Changer de thème", () => setAppearance({ mode: document.documentElement.dataset.theme === "dark" ? "light" : "dark" })), h("button", { type: "button", class: "sq-inbox-profile", "aria-label": "Ouvrir mon profil", onClick: () => setRoute("profile") }, profileAvatar(state.user, { size: 30, ariaHidden: true })))));
  leftCard.querySelector(":scope > .card-head").replaceChildren(h("div", { class: "sq-inbox-heading" }, h("span", { class: "sq-inbox-kicker", text: "MESSAGES" }), h("div", { class: "sq-inbox-title" }, h("h1", { class: "card-title", text: "Conversations" }), inboxCount), inboxSummary), button("Nouvelle conversation", { iconName: "edit", ariaLabel: "Nouvelle conversation", className: "sq-new-conversation", onClick: () => newConversation(reload) }));
  root.append(h("div", { class: "split-view sq-messenger-shell" }, leftCard, rightCard));
  const search = h("input", { class: "search-input", type: "search", placeholder: "Rechercher une conversation…", "aria-label": "Rechercher une conversation", value: listQuery });
  const results = h("div", { class: "sq-conversation-results" });
  const pinnedRail = h("div", { class: "sq-pinned-rail", hidden: true });
  const resultsLabel = h("div", { class: "sq-inbox-section-label" });
  const resultCount = h("span", { class: "sr-only", role: "status", "aria-live": "polite" });
  const filters = [
    ["all", "Toutes"], ["unread", "Non lues"], ["pinned", "Épinglées"], ["archived", "Archivées"]
  ].map(([mode, label]) => button(label, { small: true, pressed: listMode === mode, onClick: () => setFilter(mode) }));
  left.append(h("div", { class: "sq-conversation-search" }, h("div", { class: "sq-inbox-search" }, icon("search", 17), search), h("div", { class: "sq-conversation-filters" }, ...filters)), pinnedRail, resultsLabel, resultCount, results);
  search.addEventListener("input", () => { listQuery = search.value; drawList(); });
  function setFilter(value) {
    listMode = value; filters.forEach((control, index) => control.setAttribute("aria-pressed", String(["all", "unread", "pinned", "archived"][index] === value))); drawList();
  }
  function drawList() {
    if (!alive()) return;
    const term = normalize(listQuery.trim());
    const pinned = new Set(state.workspace?.intelligence?.pinnedConversationIDs || []);
    const archived = new Set(state.workspace?.intelligence?.archivedEntityIDs || []);
    const filtered = conversations().filter(conversation => {
      const last = conversationMessages(conversation).at(-1);
      const visible = listMode === "archived" ? archived.has(conversation.id) : !archived.has(conversation.id) && (listMode === "unread" ? Number(conversation.unread) > 0 : listMode === "pinned" ? pinned.has(conversation.id) : true);
      return visible && normalize(`${conversation.name || ""} ${participantNames(conversation)} ${last ? messageBody(last) : ""}`).includes(term);
    });
    const activeConversations = conversations().filter(conversation => !archived.has(conversation.id));
    const unreadConversations = activeConversations.filter(conversation => Number(conversation.unread) > 0).length;
    inboxCount.textContent = String(activeConversations.length);
    inboxSummary.textContent = unreadConversations ? `${unreadConversations} conversation${unreadConversations > 1 ? "s" : ""} à lire` : "Toutes vos conversations sont à jour";
    resultsLabel.textContent = ({ all: "Derniers échanges", unread: "À lire", pinned: "Épinglées", archived: "Archives" })[listMode];
    const shortcuts = activeConversations.filter(conversation => pinned.has(conversation.id));
    pinnedRail.hidden = listMode !== "all" || Boolean(term) || !shortcuts.length;
    pinnedRail.replaceChildren(...shortcuts.map(conversation => h("button", { type: "button", class: "sq-pinned-shortcut", "aria-label": `Ouvrir la conversation épinglée ${conversation.name || "Conversation"}`, onClick: () => openConversation(conversation.id, true) }, profileAvatar(conversationPerson(conversation), { size: 44, ariaHidden: true }), h("span", { text: conversation.name || "Conversation", title: conversation.name || "Conversation" }), icon("star", 11))));
    results.replaceChildren(filtered.length ? h("div", { class: "mail-list" }, ...filtered.map(conversation => {
      const messages = conversationMessages(conversation), last = messages.at(-1), unread = Math.max(0, Number(conversation.unread) || 0);
      const draft = getDraft(conversation.id);
      const lastAttachment = last?.attachments?.[0] || (last?.attachmentName ? { fileName: last.attachmentName } : null);
      const lastSummary = lastAttachment ? attachmentLabel(attachmentKind(lastAttachment)) : last ? messageBody(last).slice(0, 90) : participantNames(conversation);
      return h("button", { class: `mail-item conversation-item ${unread ? "unread" : ""} ${selectedId === conversation.id ? "active" : ""}`, type: "button", "aria-pressed": String(selectedId === conversation.id), onClick: () => openConversation(conversation.id, true) },
        profileAvatar(conversationPerson(conversation), { className: "conversation-avatar", size: 46, ariaHidden: true }),
        h("span", { class: "mail-item-content" },
          h("span", { class: "sq-conversation-topline" }, h("strong", { title: conversation.name || "Conversation", text: conversation.name || "Conversation" }), h("time", { class: "sq-conversation-time", datetime: last && messageDate(last) || null, text: last ? conversationTime(messageDate(last)) : "" })),
          h("span", { class: "sq-conversation-bottomline" }, lastAttachment && !draft ? icon(attachmentKind(lastAttachment) === "image" ? "image" : "document", 13) : null, h("p", { class: draft ? "sq-conversation-draft" : "", text: draft ? "Brouillon · " + draft.slice(0, 70) : lastSummary }), unread ? h("span", { class: "conversation-unread", "aria-label": `${unread} messages non lus`, text: unread > 99 ? "99+" : String(unread) }) : pinned.has(conversation.id) ? icon("star", 13) : null)));
    })) : emptyState(term || listMode !== "all" ? "Aucun résultat" : "Aucune conversation", term ? "Aucune conversation ne correspond à cette recherche." : listMode === "archived" ? "Aucune conversation archivée." : listMode === "pinned" ? "Aucune conversation épinglée." : listMode === "unread" ? "Aucune conversation non lue." : "Créez une conversation avec un membre Workspace.", "messages"));
    resultCount.textContent = `${filtered.length} conversation(s)`;
  }
  function updateSendState() {
    const conversation = selected(); if (!conversation || !sendButton || !messageBox) return;
    const busy = sending.has(draftKey(conversation.id));
    sendButton.disabled = busy || !state.online || !messageBox.value.trim() || messageBox.value.length > 4000;
    sendButton.setAttribute("aria-busy", String(busy)); messageBox.disabled = busy;
    if (draftNote) {
      draftNote.dataset.state = !state.online ? "offline" : messageBox.value ? "draft" : "idle";
      draftNote.textContent = !state.online ? "Hors ligne · Brouillon conservé, envoi en attente de votre action." : messageBox.value ? (messageBox.dataset.draftStored==="true"?"Brouillon enregistré":"Stockage indisponible : copiez votre brouillon avant de recharger.") : "";
      draftNote.title = messageBox.dataset.draftStored === "true" ? "Conservé dans cet onglet pendant 24 h maximum, puis effacé à la déconnexion." : "";
    }
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
  function conversationGallery(conversation) {
    activeGallery?.close();
    const galleryURLs = new Set(), seen = new Set();
    let galleryRender = new AbortController();
    const files = conversationMessages(conversation).filter(message => !message.deletedAt && !message.deleted_at).flatMap(message => Array.isArray(message.attachments) && message.attachments.length ? message.attachments : message.attachmentName ? [{ fileName: message.attachmentName, storageKey: message.attachmentStorageKey }] : []).filter(file => { const key = file.id || file.storageKey; if (!key || seen.has(key)) return false; seen.add(key); return true; }).reverse();
    const participants = (conversation.participantIDs || []).map(teamMember).filter(Boolean);
    const mediaCount = files.filter(file => ["image", "video", "audio"].includes(attachmentKind(file))).length;
    const summary = h("div", { class: "sq-gallery-summary" }, profileAvatar(conversationPerson(conversation), { size: 56, ariaHidden: true }), h("div", {}, h("strong", { text: conversation.name || "Conversation" }), h("small", { text: `${participants.length} membre${participants.length > 1 ? "s" : ""} · ${files.length} fichier${files.length > 1 ? "s" : ""} partagé${files.length > 1 ? "s" : ""}` })));
    const grid = h("div", { class: "sq-gallery-grid" });
    const filters = [["all", `Tout (${files.length})`], ["media", `Médias (${mediaCount})`], ["documents", `Documents (${files.length - mediaCount})`]];
    let currentFilter = "all";
    const controls = filters.map(([key, label]) => button(label, { small: true, pressed: key === currentFilter, onClick: () => { currentFilter = key; paintGallery(); } }));
    function paintGallery() {
      galleryRender.abort(); galleryRender = new AbortController();
      for (const url of galleryURLs) URL.revokeObjectURL(url); galleryURLs.clear();
      controls.forEach((control, index) => control.setAttribute("aria-pressed", String(filters[index][0] === currentFilter)));
      const visible = files.filter(file => currentFilter === "all" || (["image", "video", "audio"].includes(attachmentKind(file)) ? currentFilter === "media" : currentFilter === "documents"));
      grid.replaceChildren(...(visible.length ? visible.map(file => attachmentPreview(file, null, galleryRender.signal, galleryURLs)) : [emptyState("Aucun fichier dans cette catégorie", "Les pièces jointes de cette conversation apparaîtront ici.", "document")]));
    }
    let gallery;
    gallery = modal({ title: "Médias partagés", wide: true, className: "sq-conversation-gallery", content: h("div", { class: "sq-gallery-content" }, summary, h("div", { class: "sq-gallery-filters" }, ...controls), grid, h("div", { class: "sq-gallery-members" }, h("h4", { text: "Participants" }), ...participants.map(member => h("div", { class: "sq-gallery-member" }, profileAvatar(member, { size: 28, ariaHidden: true }), h("span", { text: memberName(member) }))))), onClose: () => { galleryRender.abort(); for (const url of galleryURLs) URL.revokeObjectURL(url); galleryURLs.clear(); if (activeGallery === gallery) activeGallery = null; } });
    activeGallery = gallery; paintGallery();
  }
  function conversationOptions(conversation) {
    const archived = (state.workspace?.intelligence?.archivedEntityIDs || []).includes(conversation.id);
    const pinned = (state.workspace?.intelligence?.pinnedConversationIDs || []).includes(conversation.id);
    const privateThread = conversation.kind === "direct";
    const storedMode = conversation.notificationModes;
    const currentMode = Array.isArray(storedMode) ? storedMode[1] : storedMode?.[state.user?.id];
    const notification = h("select", {}, ...[["all", "Toutes"], ["mentions", "Mentions uniquement"], ["muted", "Silencieuse"]].map(([value, label]) => h("option", { value, text: label, selected: value === (currentMode || "all") })));
    const name = input(conversation.name || "", { required: true, minLength: 2, maxLength: 300 });
    const description = textarea(conversation.description || "", { maxLength: 4000, rows: 3 });
    const existingIDs = conversation.participantIDs || [];
    const selectedIDs = new Set(existingIDs);
    const participants = privateThread ? null : h("div", { class: "member-picker" }, ...(state.workspace?.team || []).filter(member => memberId(member)).map(member => {
      const id = memberId(member), check = h("input", { type: "checkbox", checked: selectedIDs.has(id), disabled: id === state.user?.id });
      check.addEventListener("change", () => check.checked ? selectedIDs.add(id) : selectedIDs.delete(id));
      return h("label", { class: "member-choice" }, check, h("span", { text: memberName(member) }));
    }));
    const toggle = async (key, value, close) => {
      try { await updateConversationPreferences(conversation.id, { [key]: value }); close(); await reload(); if (key === "isArchived") setFilter(value ? "archived" : "all"); }
      catch (error) { toast(errorMessage(error), "error", 6000); }
    };
    modal({ title: "Options de la conversation", wide: true,
      content: h("div", { class: "form" },
        privateThread ? h("p", { class: "muted", text: "Cette discussion privée reste limitée à ses deux membres." }) : field("Nom du groupe", name),
        privateThread ? null : field("Description", description),
        field("Notifications", notification),
        privateThread ? null : h("div", {}, h("strong", { text: "Participants" }), participants)),
      actions: [
        { label: pinned ? "Désépingler" : "Épingler", onClick: close => toggle("isPinned", !pinned, close) },
        { label: archived ? "Désarchiver" : "Archiver", onClick: close => toggle("isArchived", !archived, close) },
        { label: "Enregistrer", kind: "primary", onClick: async close => {
          if (!privateThread && !name.reportValidity()) return;
          const nextIDs = [...selectedIDs].sort(), previousIDs = [...existingIDs].sort();
          if (!privateThread && nextIDs.length < 2) { toast("Un groupe doit conserver au moins deux membres.", "error"); return; }
          try {
            if (notification.value !== (currentMode || "all")) await updateConversationPreferences(conversation.id, { notificationMode: notification.value });
            if (!privateThread && (name.value.trim() !== conversation.name || description.value.trim() !== (conversation.description || ""))) {
              await updateConversationDetails(conversation.id, { name: name.value.trim(), description: description.value.trim(), kind: conversation.kind || "team", context: conversation.context || null, avatarData: conversation.avatarData || null });
            }
            if (!privateThread && nextIDs.join() !== previousIDs.join()) await updateConversationParticipants(conversation.id, nextIDs);
            close(); toast("Conversation actualisée"); await reload();
          } catch (error) { toast(errorMessage(error), "error", 6000); await reload(); }
        } },
        ...((conversation.createdByID === state.user?.id || ["OWNER", "ADMIN"].includes(state.user?.role)) ? [{ label: "Supprimer la conversation", kind: "danger", onClick: close => confirmAction({ title: "Supprimer cette conversation ?", message: "Cette action retire la conversation pour tous ses participants.", confirmLabel: "Supprimer", danger: true, onConfirm: async () => { await deleteConversation(conversation.id); close(); selectedId = null; setRoute("messages"); await reload(); } }) }] : [])
      ]
    });
  }
  function drawThread(userInitiated = false) {
    releaseMedia();
    const conversation = selected();
    root.classList.toggle("sq-conversation-open", Boolean(conversation));
    if (!conversation) { if(state.route.item){root.classList.add("sq-conversation-open");right.replaceChildren(button("Retour aux conversations",{onClick:()=>{selectedId=null;setRoute("messages");}}),emptyState("Conversation indisponible","Elle n’existe plus ou ne fait pas partie de votre périmètre.","lock"));return;} selectedId = null; right.replaceChildren(emptyState("Sélectionnez une conversation", "Les messages et le champ de réponse apparaîtront ici.", "mail")); return; }
    const key = draftKey(conversation.id), messages = conversationMessages(conversation);
    const oldThread = right.querySelector(".message-thread"), oldScroll = oldThread?.scrollTop || 0;
    const atBottom = !oldThread || oldThread.scrollHeight - oldThread.clientHeight - oldThread.scrollTop < 60;
    const newThread = shownConversation !== conversation.id; shownConversation = conversation.id;
    if (newThread) { replyingTo = null; linkedContext = null; }
    const back = button("Retour", { iconName: "ArrowLeft", ariaLabel: "Retour aux conversations", className: "sq-conversation-back", onClick: backToList });
    const thread = h("div", { class: "message-thread", role: "log", "aria-live": "polite", "aria-label": `Messages de ${conversation.name || "la conversation"}`, tabindex: "0" });
    const threadSearch = h("input", { class: "search-input", type: "search", value: threadQuery, placeholder: "Rechercher dans cette discussion…", "aria-label": "Rechercher dans cette discussion" });
    const searchArea = h("div", { class: "sq-message-search", hidden: !threadSearchOpen }, threadSearch);
    const searchToggle = iconButton("search", "Rechercher dans la discussion", () => { threadSearchOpen = !threadSearchOpen; searchArea.hidden = !threadSearchOpen; searchToggle.setAttribute("aria-expanded", String(threadSearchOpen)); if (threadSearchOpen) threadSearch.focus(); else { threadQuery = ""; threadSearch.value = ""; drawBubbles(); } });
    searchToggle.setAttribute("aria-expanded", String(threadSearchOpen));
    const latest = button("Derniers messages", { iconName: "ChevronDown", ariaLabel: "Aller aux derniers messages", className: "sq-scroll-latest", onClick: () => { thread.scrollTo({ top: thread.scrollHeight, behavior: state.appearance?.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); } });
    latest.hidden = true;
    const drawBubbles = () => {
      releaseMedia();
      const signal = mediaAbort.signal;
      mediaObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) { mediaObserver?.unobserve(entry.target); entry.target.dispatchEvent(new Event("sq:preview-visible")); }
      }, { root: thread, rootMargin: "250px" }) : null;
      const term = normalize(threadQuery.trim()), filtered = term ? messages.filter(message => normalize(`${messageBody(message)} ${message.authorName || message.author || ""}`).includes(term)) : messages;
      const profiles = new Map((state.workspace?.enterprise?.messageProfiles || []).map(profile => [profile.messageID, profile]));
      const nodes = []; let previousDay = "", previousMessage = null;
      for (const message of filtered) {
        const date = new Date(messageDate(message)), valid = Number.isFinite(date.getTime());
        const day = valid ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date) : "Date indisponible";
        if (day !== previousDay) { nodes.push(h("div", { class: "sq-message-date" }, h("span", { text: day }))); previousDay = day; previousMessage = null; }
        if (message.proposalEvent) {
          nodes.push(h("div", { class: "sq-proposal-event", text: `${messageBody(message)} · ${valid ? formatDate(date) : "Date indisponible"}` }));
          previousMessage = null;
          continue;
        }
        const authorId = messageAuthorId(message), mine = authorId === state.user?.id;
        const elapsed = previousMessage ? date.getTime() - new Date(messageDate(previousMessage)).getTime() : NaN;
        const continuation = previousMessage && messageAuthorId(previousMessage) === authorId && elapsed >= 0 && elapsed < 5 * 60 * 1000;
        const author = mine ? state.user : (teamMember(authorId) || { name: message.authorName || message.author || "Membre", avatarData: message.authorAvatarData || message.author_avatar_data });
        const profile = profiles.get(message.id), removed = Boolean(message.deletedAt || message.deleted_at);
        const myName = memberName(state.user);
        const reactions = Object.entries(profile?.reactions || {}).filter(([, members]) => Array.isArray(members) && members.length);
        const mutate = async action => { try { await action(); await reload(); } catch (error) { toast(errorMessage(error), "error", 6000); } };
        const actions = removed || message.proposal ? null : h("div", { class: "message-actions" },
          button("Répondre", { small: true, onClick: () => { replyingTo = message; box.focus(); replyHint.replaceChildren(h("span", { text: `En réponse à ${mine ? "votre message" : message.authorName || message.author || "un membre"} : ${messageBody(message).slice(0, 80)}` }), button("Annuler", { small: true, kind: "ghost", onClick: () => { replyingTo = null; replyHint.replaceChildren(); } })); } }),
          ...["👍", "❤️", "🎉"].map(emoji => {
            const active = (profile?.reactions?.[emoji] || []).includes(myName);
            return button(emoji, { small: true, pressed: active, onClick: () => mutate(() => reactToConversationMessage(conversation.id, message.id, emoji, !active)) });
          }),
          button(profile?.isPinned ? "Désépingler" : "Épingler", { small: true, kind: "ghost", onClick: () => mutate(() => flagConversationMessage(conversation.id, message.id, { isPinned: !profile?.isPinned })) }),
          button((profile?.savedByMemberIDs || []).includes(state.user?.id) ? "Retirer des favoris" : "Sauvegarder", { small: true, kind: "ghost", onClick: () => mutate(() => flagConversationMessage(conversation.id, message.id, { isSaved: !(profile?.savedByMemberIDs || []).includes(state.user?.id) })) }),
          button("Transférer", { small: true, kind: "ghost", onClick: () => {
            const targets = conversations().filter(item => item.id !== conversation.id);
            if (!targets.length) { toast("Créez une autre conversation avant de transférer ce message.", "error"); return; }
            const target = h("select", {}, ...targets.map(item => h("option", { value: item.id, text: item.name || "Conversation" })));
            modal({ title: "Transférer le message", content: h("div", { class: "form" }, field("Conversation destinataire", target), h("p", { text: messageBody(message).slice(0, 240) })), actions: [{ label: "Transférer", kind: "primary", onClick: async close => {
              try { await sendConversationMessage(target.value, messageBody(message), null, { forwardedFromMessageID: message.id, attachments: message.attachments || [], linkedContext: message.linkedContext || null }); close(); toast("Message transféré"); await reload(); }
              catch (error) { toast(errorMessage(error), "error", 6000); }
            } }] });
          } }),
          mine ? button("Modifier", { small: true, onClick: () => {
            const text = textarea(messageBody(message), { maxLength: 4000, rows: 4 });
            modal({ title: "Modifier le message", content: field("Message", text), actions: [{ label: "Enregistrer", kind: "primary", onClick: async close => { if (!text.value.trim()) return; await mutate(() => editConversationMessage(conversation.id, message.id, text.value.trim())); close(); } }] });
          } }) : null,
          mine ? button("Supprimer", { small: true, kind: "ghost", onClick: () => confirmAction({ title: "Supprimer ce message ?", message: "Le message restera marqué comme supprimé dans la conversation.", confirmLabel: "Supprimer", danger: true, onConfirm: () => mutate(() => deleteConversationMessage(conversation.id, message.id)) }) }) : null);
        const reply = profile?.replyToMessageID && messages.find(item => item.id === profile.replyToMessageID);
        const attachments = removed ? [] : Array.isArray(message.attachments) && message.attachments.length
          ? message.attachments.map(file => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(file.fileName || "") && message.attachmentName ? { ...file, fileName: message.attachmentName } : file)
          : message.attachmentName ? [{ fileName: message.attachmentName, storageKey: message.attachmentStorageKey, mediaType: "" }] : [];
        const body = messageBody(message);
        const generatedCaption = attachments.length && (body === `Pièce jointe : ${attachments[0].fileName}` || body === "Message vocal" || body === attachmentLabel(attachmentKind(attachments[0])));
        nodes.push(h("article", { class: `message-bubble ${mine ? "mine" : ""} ${continuation ? "sq-message-continuation" : ""} ${attachments.length ? "sq-message-with-media" : ""} ${generatedCaption ? "sq-message-media-only" : ""}`, "aria-label": `Message de ${mine ? "vous" : memberName(author)}` },
          !mine && !continuation && !(conversation.kind === "direct" || (conversation.participantIDs || []).length === 2) ? h("div", { class: "message-bubble-head" }, profileAvatar(author, { className: "message-avatar", size: 24, ariaHidden: true }), h("strong", { title: memberName(author), text: message.authorName || message.author || memberName(author) })) : null,
          h("div", { class: "sq-bubble-surface" },
          profile?.forwardedFromMessageID ? h("small", { class: "muted", text: "Message transféré" }) : null,
          reply ? h("blockquote", { class: "sq-message-reference", text: `En réponse à : ${messageBody(reply).slice(0, 140)}` }) : null,
          profile?.isPinned ? h("small", { class: "muted", text: "📌 Message épinglé" }) : null,
          message.proposal ? proposalCard(conversation, message, reload) : body && !generatedCaption ? h("p", { text: body }) : null,
          message.linkedContext ? h("div", { class: "sq-message-reference", text: `${message.linkedContext.entityKind || "Élément"} · ${message.linkedContext.title || "Workspace"}` }) : null,
          attachments.length ? h("div", { class: "message-attachments" }, ...attachments.map(file => attachmentPreview(file, message === filtered.at(-1) ? null : mediaObserver, signal))) : null),
          reactions.length ? h("div", { class: "message-reactions" }, ...reactions.map(([emoji, members]) => h("span", { text: `${emoji} ${members.length}` }))) : null,
          actions,
          h("div", { class: "sq-message-footer" },
          h("time", { class: "sq-message-clock", datetime: valid ? date.toISOString() : null, text: `${valid ? new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(date) : ""}${message.editedAt ? " · modifié" : ""}` }),
          mine && !removed ? h("small", { class: `sq-message-receipt ${profile?.readBy?.length ? "sq-receipt-read" : ""}`, title: profile?.readBy?.length ? `Lu par ${profile.readBy.join(", ")}` : profile?.deliveryState === "delivered" ? "Distribué" : "Envoyé", "aria-label": profile?.readBy?.length ? "Lu" : profile?.deliveryState === "delivered" ? "Distribué" : "Envoyé" }, icon(profile?.readBy?.length || profile?.deliveryState === "delivered" ? "DoubleCheck" : "check", 13)) : null,
          actions ? button("Actions", { iconName: "More", small: true, className: "sq-message-action-menu", ariaLabel: `Actions sur le message de ${mine ? "vous" : message.authorName || message.author || "un membre"}`, onClick: () => {
            const choices = [...actions.querySelectorAll(":scope > button")];
            let menu;
            menu = modal({ title: "Actions sur le message", className: "sq-message-tools-sheet sq-message-actions-sheet", content: h("div", { class: "sq-message-action-list" }, ...choices.map(choice => button(choice.textContent.trim(), { onClick: () => {
              menu.close(); choice.click();
            } }))) });
          } }) : null)));
        previousMessage = message;
      }
      // Text messages keep their metadata inside the bubble; media retains an unobtrusive caption below it.
      for (const node of nodes) {
        if (!node.matches(".message-bubble") || node.querySelector(".message-attachments,.sq-proposal-card")) continue;
        const surface = node.querySelector(".sq-bubble-surface"), footer = node.querySelector(".sq-message-footer");
        if (surface && footer) { surface.append(footer); node.classList.add("sq-message-text-only"); }
      }
      thread.replaceChildren(...(nodes.length ? nodes : [emptyState(term ? "Aucun message correspondant" : "Aucun message", term ? "Essayez un autre mot dans cette discussion." : "Commencez la conversation.", "messages")]));
    };
    threadSearch.addEventListener("input", () => { threadQuery = threadSearch.value; drawBubbles(); });
    thread.addEventListener("scroll", () => { latest.hidden = thread.scrollHeight - thread.clientHeight - thread.scrollTop < 100; }, { passive: true });
    messageBox = textarea(getDraft(conversation.id) || "", { placeholder: "Écrire un message…", maxLength: 4000, rows: 2 });
    messageBox.setAttribute("aria-label", "Écrire un message");
    const box = messageBox, count = h("span", { class: "composer-count" });
    const replyHint = h("div", { class: "message-reply-hint" });
    if (replyingTo) replyHint.replaceChildren(h("span", { text: `En réponse à : ${messageBody(replyingTo).slice(0, 80)}` }), button("Annuler", { small: true, kind: "ghost", onClick: () => { replyingTo = null; replyHint.replaceChildren(); } }));
    draftNote = h("p", { class: "sq-message-draft" });
    const updateDraft = () => {
      box.style.height = "44px";
      box.style.height = `${Math.min(124, Math.max(44, box.scrollHeight))}px`;
      const stored=saveDraft(conversation.id,box.value);
      box.dataset.draftStored=String(stored);
      if(box.value&&!stored)volatileDrafts.add(key);else volatileDrafts.delete(key);
      count.textContent = `${new Intl.NumberFormat("fr-FR").format(box.value.length)} / 4 000`;
      count.classList.toggle("warning", box.value.length > 3600); updateSendState();
      count.hidden = box.value.length < 3600;
    };
    const send = async () => {
      const text = box.value.trim();
      if (!text || text.length > 4000 || sending.has(key)) return;
      if (!state.online) { toast("Reconnectez-vous pour envoyer ce message. Le brouillon est conservé.", "error"); return; }
      sending.add(key); updateSendState(); let sent = false;
      try {
        await sendConversationMessage(conversation.id, text, replyingTo?.id || null, linkedContext ? { linkedContext } : {}); sent = true;
        if (owner !== currentOwner || state.user?.id !== currentOwner) return;
        volatileDrafts.delete(key); saveDraft(conversation.id,""); box.value = ""; replyingTo = null; linkedContext = null; replyHint.replaceChildren(); contextHint.replaceChildren(); announce("Message envoyé");
        try { await loadWorkspace(); }
        catch { toast("Message envoyé, mais actualisation impossible. Ne le renvoyez pas : actualisez la discussion après reconnexion.", "error", 7000); }
      } catch (error) { if (owner === currentOwner && state.user?.id === currentOwner) toast(errorMessage(error), "error"); }
      finally {
        sending.delete(key);
        if (owner === currentOwner && state.user?.id === currentOwner) { if (sent) activeRefresh?.(); else updateSendState(); }
      }
    };
    sendButton = button("Envoyer", { kind: "primary", iconName: "send" });
    sendButton.setAttribute("aria-label", "Envoyer");
    sendButton.addEventListener("click", () => { void send(); });
    const attachmentInput = h("input", { type: "file", class: "sr-only", "aria-label": "Choisir une pièce jointe", accept: "*/*" });
    const attachmentButton = button("Joindre un fichier", { small: true, onClick: () => attachmentInput.click() });
    const contextHint = h("div", { class: "message-reply-hint" });
    if (linkedContext) contextHint.replaceChildren(h("span", { text: `${linkedContext.subtitle} · ${linkedContext.title}` }), button("Retirer", { small: true, onClick: () => { linkedContext = null; contextHint.replaceChildren(); } }));
    const contextButton = button("Lier un élément", { small: true, onClick: () => {
      const kinds = [["projects", "project", "Projet"], ["missions", "mission", "Mission"], ["tasks", "task", "Tâche"], ["validations", "validation", "Validation"], ["deliverables", "deliverable", "Livrable"], ["contracts", "contract", "Contrat"], ["documents", "document", "Document"]];
      const options = kinds.flatMap(([collection, kind, label]) => (state.workspace?.[collection] || []).filter(item => item.id).map(item => ({ entityKind: kind, entityID: item.id, title: item.title || item.name || item.reference || label, subtitle: label, projectID: item.projectID || null })));
      if (!options.length) { toast("Aucun élément Workspace visible à lier.", "error"); return; }
      const choice = h("select", {}, ...options.map((item, index) => h("option", { value: String(index), text: `${item.subtitle} · ${item.title}` })));
      modal({ title: "Lier un élément Workspace", content: field("Élément", choice), actions: [{ label: "Lier", kind: "primary", onClick: close => {
        linkedContext = options[Number(choice.value)]; contextHint.replaceChildren(h("span", { text: `${linkedContext.subtitle} · ${linkedContext.title}` }), button("Retirer", { small: true, onClick: () => { linkedContext = null; contextHint.replaceChildren(); } })); close(); box.focus();
      } }] });
    } });
    attachmentInput.addEventListener("change", async () => {
      const file = attachmentInput.files?.[0]; attachmentInput.value = "";
      if (!file) return;
      if (!state.online) { toast("Reconnectez-vous pour joindre un fichier.", "error"); return; }
      if (sending.has(key)) return;
      sending.add(key); attachmentButton.disabled = true; updateSendState();
      try {
        const uploaded = await uploadFile(file, "messageAttachment", conversation.id);
        await sendConversationMessage(conversation.id, attachmentLabel(attachmentKind(uploaded)), null, {
          attachmentName: file.name, attachmentStorageKey: uploaded.id, attachments: [uploaded]
        });
        toast("Fichier envoyé"); await reload();
      } catch (error) { toast(errorMessage(error), "error", 7000); }
      finally { sending.delete(key); attachmentButton.disabled = false; updateSendState(); }
    });
    box.addEventListener("input", updateDraft);
    box.addEventListener("keydown", event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) { event.preventDefault(); void send(); } });
    const proposalButtons = state.user?.permissions?.includes("sendMessages") ? [
      state.user.permissions.includes("manageMissions") ? button("Envoyer une mission", { small: true, onClick: () => openProposalPicker(conversation, "mission", reload) }) : null,
      state.user.permissions.includes("manageContracts") ? button("Envoyer un contrat", { small: true, onClick: () => openProposalPicker(conversation, "contract", reload) }) : null
    ].filter(Boolean) : [];
    const addButton = button("Ajouter", { iconName: "Paperclip", className: "sq-composer-add", ariaLabel: "Ajouter au message", onClick: () => {
      let menu;
      menu = modal({ title: "Ajouter au message", className: "sq-message-tools-sheet", content: h("div", { class: "sq-message-add-grid" }, ...[
        ["Joindre une photo ou un document", "image", "Photos, PDF, vidéos et fichiers", attachmentButton], ["Lier un élément Workspace", "external", "Projet, tâche ou livrable", contextButton],
        ...proposalButtons.map(control => [control.textContent.trim(), control.textContent.includes("mission") ? "missions" : "contracts", control.textContent.includes("mission") ? "Proposer une mission" : "Partager un contrat", control])
      ].map(([label, symbol, description, control]) => {
        const choice = button(label, { iconName: symbol, className: "sq-message-add-choice", onClick: () => { menu.close(); control.click(); } });
        choice.append(h("small", { text: description }));
        return choice;
      })) });
    } });
    const identity = h("button", { type: "button", class: "sq-thread-profile", "aria-label": "Voir les médias et les participants", onClick: () => conversationGallery(conversation) }, profileAvatar(conversationPerson(conversation), { className: "sq-thread-avatar", size: 36, ariaHidden: true }), h("span", { class: "sq-thread-identity" }, h("strong", { title: conversation.name || "Conversation", text: conversation.name || "Conversation" }), h("small", { class: "sq-heading-participants", text: participantNames(conversation) }), h("small", { class: "sq-heading-mobile", text: conversation.kind === "direct" || (conversation.participantIDs || []).length === 2 ? "Conversation privée" : `${(conversation.participantIDs || []).length} participants` })));
    right.replaceChildren(h("div", { class: "sq-thread-heading" }, back, identity, searchToggle, button("Options", { small: true, iconName: "More", ariaLabel: "Options", className: "sq-thread-options", onClick: () => conversationOptions(conversation) })), searchArea, h("div", { class: "sq-timeline" }, thread, latest), h("div", { class: "sq-composer-dock" }, replyHint, contextHint, h("div", { class: "composer" }, addButton, box, sendButton, attachmentInput), h("div", { class: "composer-meta" }, h("span", { class: "sq-composer-shortcut", text: "⌘/Ctrl + Entrée pour envoyer" }), count), draftNote));
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
