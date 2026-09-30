import { withWorkspaceTypography } from "../typography.js";
import { mailboxTemplates, previewMail, saveMailDraft, sendMail, uploadFile } from "../api.js";
import { mailBlocksEditor } from "../mail-blocks.js";
import { h, button, field, input, textarea, modal, toast, errorMessage, validateControls } from "../ui.js";

const addresses = value => String(value || "").split(/[;,]/).map(item => item.trim()).filter(Boolean);

export function openMailComposer(reload, replyTo = null, draft = null) {
  const id = draft?.id || crypto.randomUUID();
  const to = input(draft?.toEmails?.join(", ") || replyTo?.fromEmail || "", { placeholder: "nom@entreprise.com", required: true });
  const cc = input(draft?.ccEmails?.join(", ") || "", { placeholder: "cc@entreprise.com" });
  const bcc = input(draft?.bccEmails?.join(", ") || "", { placeholder: "cci@entreprise.com" });
  const subject = input(draft?.subject || (replyTo ? `Re: ${String(replyTo.subject || "").replace(/^Re:\s*/i, "")}` : ""), { required: true, maxLength: 180 });
  const body = textarea(draft?.textBody || "", { placeholder: "Texte de secours ou message simple…", rows: 5, maxLength: 100000 });
  const scheduledDate = draft?.scheduledAt ? new Date(draft.scheduledAt) : null;
  const localSchedule = scheduledDate && !Number.isNaN(scheduledDate.valueOf()) ? new Date(scheduledDate.getTime() - scheduledDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const scheduled = input(localSchedule, { type: "datetime-local" });
  const template = h("select", {}, h("option", { value: "", text: "Sans modèle" }));
  let editor = mailBlocksEditor(draft?.editorContent || []);
  const editorHost = h("div", {}, editor.element);
  const previewHost = h("div", { class: "mail-composer-preview" });
  const attachmentList = h("div", { class: "mail-composer-attachments" });
  const attachmentInput = h("input", { type: "file", multiple: true, class: "sr-only", "aria-label": "Sélectionner les pièces jointes" });
  let attachments = (draft?.attachments || []).map(file => ({ id: file.id, fileName: file.fileName }));
  const drawAttachments = () => attachmentList.replaceChildren(...attachments.map(file => h("div", { class: "mail-composer-attachment" },
    h("span", { text: file.fileName }), button("Retirer", { small: true, kind: "ghost", onClick: () => { attachments = attachments.filter(item => item.id !== file.id); drawAttachments(); } }))));
  drawAttachments();
  attachmentInput.addEventListener("change", async () => {
    const files = [...(attachmentInput.files || [])]; attachmentInput.value = "";
    if (files.length + attachments.length > 10) { toast("Un e-mail accepte au maximum dix pièces jointes.", "error"); return; }
    for (const file of files) {
      try { const uploaded = await uploadFile(file, "mailAttachment", id); attachments.push(uploaded); drawAttachments(); }
      catch (error) { toast(`Échec du fichier « ${file.name} » : ${errorMessage(error)}`, "error", 6000); break; }
    }
  });
  const makePayload = () => ({
    id, to: addresses(to.value), cc: addresses(cc.value), bcc: addresses(bcc.value), subject: subject.value.trim(),
    body: body.value, blocks: editor.getBlocks(), attachmentIDs: attachments.map(file => file.id),
    ...(template.value ? { templateID: template.value } : {}),
    ...(replyTo?.providerThreadID ? { providerThreadID: replyTo.providerThreadID } : {}),
    ...(scheduled.value ? { scheduledAt: new Date(scheduled.value).toISOString() } : {})
  });
  template.addEventListener("change", () => {
    const selected = template._items?.find(item => item.id === template.value);
    if (!selected) return;
    subject.value = selected.subject || ""; body.value = selected.body || "";
    editor = mailBlocksEditor(selected.contentBlocks || []); editorHost.replaceChildren(editor.element);
  });
  const showPreview = button("Aperçu", { onClick: async () => {
    try {
      const result = await previewMail({ subject: subject.value.trim(), body: body.value, blocks: editor.getBlocks(), ...(addresses(to.value).length === 1 ? { recipientEmail: addresses(to.value)[0] } : {}) });
      const frame = h("iframe", { title: "Aperçu du message en cours", sandbox: "", referrerpolicy: "no-referrer" });
      frame.srcdoc = withWorkspaceTypography(result.html); previewHost.replaceChildren(frame);
    } catch (error) { toast(errorMessage(error), "error", 6000); }
  } });
  const content = h("div", { class: "form mail-composer-form" }, field("À", to),
    h("details", { class: "advanced-panel" }, h("summary", { text: "Copie & copie cachée" }), h("div", { class: "advanced-panel-body form" }, field("Cc", cc), field("Cci", bcc))),
    field("Objet", subject), field("Modèle de rédaction", template), field("Texte de secours", body),
    h("h4", { text: "Blocs de contenu" }), editorHost,
    h("div", { class: "mail-composer-tools" }, button("Joindre un fichier", { onClick: () => attachmentInput.click() }), attachmentInput, showPreview), attachmentList,
    field("Programmer l’envoi", scheduled), previewHost);
  modal({ title: draft ? "Modifier le brouillon" : replyTo ? "Répondre" : "Nouveau message", content, wide: true, actions: [
    { label: "Enregistrer le brouillon", onClick: async close => {
      try { await saveMailDraft(id, makePayload()); toast("Brouillon enregistré"); close(); await reload(); }
      catch (error) { toast(errorMessage(error), "error", 6000); }
    } },
    { label: "Envoyer ou programmer", kind: "primary", icon: "send", onClick: async close => {
      if (!validateControls(to, subject)) return;
      const payload = makePayload();
      if (!payload.to.length || [...payload.to, ...payload.cc, ...payload.bcc].some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) { toast("Vérifiez les adresses e-mail.", "error"); return; }
      if (!payload.body.trim() && !payload.blocks.some(block => block.text.trim() || block.url.trim())) { toast("Ajoutez du contenu au message.", "error"); return; }
      if (payload.scheduledAt && new Date(payload.scheduledAt).getTime() <= Date.now() + 30000) { toast("Choisissez une date d’envoi dans le futur.", "error"); return; }
      try { await sendMail(payload); toast(payload.scheduledAt ? "E-mail programmé" : "E-mail envoyé"); close(); await reload(); }
      catch (error) { toast(errorMessage(error), "error", 6000); }
    } }
  ] });
  mailboxTemplates().then(data => {
    const items = Array.isArray(data) ? data : data?.templates || [];
    template._items = items;
    if (!template.isConnected) return;
    template.replaceChildren(h("option", { value: "", text: "Sans modèle" }), ...items.map(item => h("option", { value: item.id, text: `${item.category || "Général"} · ${item.name}`, selected: item.id === draft?.templateID })));
  }).catch(() => { /* La rédaction reste utilisable sans catalogue de modèles. */ });
}
