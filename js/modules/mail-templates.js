import { mailboxTemplates, saveMailboxTemplate, deleteMailboxTemplate, systemMailTemplates, previewSystemMailTemplate, saveSystemMailTemplate, restoreSystemMailTemplate } from "../api.js";
import { state } from "../store.js";
import { h, pageHeader, card, button, field, input, textarea, row, toast, errorMessage, emptyState, confirmAction } from "../ui.js";
import { mailBlocksEditor, newMailBlock } from "../mail-blocks.js";

const can = permission => state.user?.permissions?.includes(permission);
function previewFrame(preview) {
  const frame = h("iframe", { class: "system-mail-preview", title: `Aperçu : ${preview.subject || "e-mail"}`, sandbox: "", referrerpolicy: "no-referrer" });
  frame.srcdoc = preview.html || ""; return frame;
}

export async function renderMailTemplates() {
  const root = h("div", { class: "mail-templates" }), content = h("div");
  let mode = "editorial", selectedKey = "";
  const editorial = button("Modèles de rédaction", { pressed: true, onClick: () => { mode = "editorial"; syncTabs(); void draw(); } });
  const system = button("E-mails système", { pressed: false, onClick: () => { mode = "system"; syncTabs(); void draw(); } });
  const syncTabs = () => { editorial.setAttribute("aria-pressed", String(mode === "editorial")); system.setAttribute("aria-pressed", String(mode === "system")); };
  root.append(pageHeader({ eyebrow: "Communication", title: "Atelier des e-mails", subtitle: "Modèles de rédaction et e-mails automatiques reliés à votre Workspace." }), h("div", { class: "subnav", role: "group", "aria-label": "Types de modèles" }, editorial, system), content);
  async function draw() {
    content.replaceChildren(h("p", { class: "muted", role: "status", text: "Chargement des modèles…" }));
    try { mode === "editorial" ? await drawEditorial() : await drawSystem(); }
    catch (error) { content.replaceChildren(emptyState("Modèles indisponibles", errorMessage(error), "warning")); }
  }
  async function drawEditorial() {
    const data = await mailboxTemplates(), templates = Array.isArray(data) ? data : data.templates || [];
    if (mode !== "editorial") return;
    const edit = template => {
      const name = input(template?.name || "", { required: true, maxLength: 100 });
      const category = input(template?.category || "Général", { required: true, maxLength: 80 });
      const subject = input(template?.subject || "", { maxLength: 180 });
      const body = textarea(template?.body || "", { rows: 8, maxLength: 100000 });
      const blocks = mailBlocksEditor(template?.contentBlocks || (template?.body ? [{ ...newMailBlock("PARAGRAPH"), text: template.body }] : []));
      const shared = h("input", { type: "checkbox", checked: template?.isShared || false, disabled: !can("organizeMail") });
      const audience = h("div", { class: "planning-options" }, ...["OWNER", "ADMIN", "COLLABORATOR", "PARTNER", "CLIENT"].map(role => {
        const check = h("input", { type: "checkbox", value: role, checked: (template?.audienceRoles || ["OWNER", "ADMIN", "COLLABORATOR", "PARTNER"]).includes(role), disabled: !can("organizeMail") });
        return h("label", {}, check, role);
      }));
      const form = h("div", { class: "form" }, field("Nom", name), field("Catégorie", category), field("Objet", subject), field("Texte de secours", body), h("h3", { text: "Blocs de contenu" }), blocks.element, h("label", {}, shared, " Partagé avec l’équipe"), audience);
      const actions = h("div", { class: "page-actions" }, button("Enregistrer", { kind: "primary", onClick: async () => {
        if (!name.reportValidity() || !category.reportValidity()) return;
        try {
          const audienceRoles = [...audience.querySelectorAll('input:checked')].map(control => control.value);
          if (!audienceRoles.length) { toast("Sélectionnez au moins un rôle autorisé.", "error"); return; }
          await saveMailboxTemplate({ ...(template?.id ? { id: template.id } : {}), name: name.value.trim(), category: category.value.trim(), description: template?.description || "", subject: subject.value.trim(), body: body.value, contentBlocks: blocks.getBlocks(), isShared: shared.checked, audienceRoles });
          toast("Modèle enregistré"); await drawEditorial();
        } catch (error) { toast(errorMessage(error), "error", 6000); }
      } }));
      content.replaceChildren(card(template?.id ? "Modifier le modèle" : "Nouveau modèle", "Ce modèle est enregistré dans votre Workspace.", h("div", { class: "form" }, form, actions)));
    };
    content.replaceChildren(card("Bibliothèque", `${templates.length} modèle(s) disponible(s).`, h("div", { class: "list" }, ...(templates.length ? templates.map(template => {
      const editable = !template.isSystem && (template.createdBy === state.user?.id || can("organizeMail"));
      const duplicate = () => edit({ ...template, id: null, name: `${template.name} — copie`, isSystem: false, isShared: false });
      return row({ title: template.name, subtitle: `${template.category || "Général"} · ${template.description || template.subject || ""}`, status: template.isSystem ? "Modèle Squared" : template.isShared ? "Équipe" : "Personnel", actions: [can("sendMail") ? button(editable ? "Modifier" : "Dupliquer", { small: true, onClick: () => editable ? edit(template) : duplicate() }) : null, can("sendMail") && editable ? button("Supprimer", { small: true, kind: "ghost", onClick: () => confirmAction({ title: "Supprimer ce modèle ?", message: template.name, confirmLabel: "Supprimer", danger: true, onConfirm: async () => { await deleteMailboxTemplate(template.id); toast("Modèle supprimé"); await drawEditorial(); } }) }) : null].filter(Boolean) });
    }) : [emptyState("Aucun modèle", "Créez un modèle de rédaction pour votre boîte e-mail.", "document")]))), ...(can("sendMail") ? [button("Nouveau modèle", { kind: "primary", iconName: "add", onClick: () => edit(null) })] : []));
  }
  async function drawSystem() {
    const data = await systemMailTemplates(), templates = data.templates || [];
    if (mode !== "system") return;
    const selected = templates.find(item => item.key === selectedKey) || templates[0];
    if (!selected) { content.replaceChildren(emptyState("Aucun e-mail système", "Le serveur n’a retourné aucun modèle.", "mail")); return; }
    selectedKey = selected.key;
    const draft = { subject: selected.subject, body: selected.body, visualStyle: selected.visualStyle || null };
    const blocks = mailBlocksEditor(selected.contentBlocks || [], { readOnly: !can("manageMailSettings") });
    const subject = input(draft.subject, { required: true, maxLength: 180 });
    const body = textarea(draft.body, { rows: 5, maxLength: 100000 });
    const customStyle = h("input", { type: "checkbox", checked: !!draft.visualStyle });
    const accent = input(draft.visualStyle?.accentHex || "#7BE84E", { required: true, pattern: "#[0-9a-fA-F]{6}" });
    const accentSoft = input(draft.visualStyle?.accentSoftHex || "#162313", { required: true, pattern: "#[0-9a-fA-F]{6}" });
    const grid = h("input", { type: "checkbox", checked: draft.visualStyle?.showsDotGrid ?? true });
    const logo = input(draft.visualStyle?.logoURL || "", { type: "url", placeholder: "https://…" });
    const styleFields = h("div", { class: "form system-mail-style" }, field("Accent", accent), field("Accent doux", accentSoft), field("URL HTTPS du logo", logo), h("label", {}, grid, " Grille de points"));
    const styleDraft = () => customStyle.checked ? { accentHex: accent.value, accentSoftHex: accentSoft.value, showsDotGrid: grid.checked, logoURL: logo.value.trim() || null } : null;
    const validDraft = () => {
      if (!subject.reportValidity()) return false;
      if (customStyle.checked && (!accent.reportValidity() || !accentSoft.reportValidity() || !logo.reportValidity() || (logo.value && !logo.value.startsWith("https://")))) { toast("Utilisez des couleurs hexadécimales et une URL HTTPS pour le logo.", "error"); return false; }
      return true;
    };
    styleFields.hidden = !customStyle.checked;
    customStyle.addEventListener("change", () => { styleFields.hidden = !customStyle.checked; });
    const preview = h("div", { class: "system-mail-preview-host" });
    const runPreview = async original => {
      if (!original && !validDraft()) return;
      try { const payload = original ? { subject: selected.subject, body: selected.body, contentBlocks: selected.contentBlocks, visualStyle: selected.visualStyle } : { ...draft, subject: subject.value, body: body.value, contentBlocks: blocks.getBlocks(), visualStyle: styleDraft() }; const result = await previewSystemMailTemplate(selected.key, payload, original); preview.replaceChildren(previewFrame(result)); }
      catch (error) { preview.replaceChildren(emptyState("Aperçu indisponible", errorMessage(error), "warning")); }
    };
    const save = async () => {
      if (!validDraft()) return;
      try { await saveSystemMailTemplate(selected.key, { ...draft, subject: subject.value, body: body.value, contentBlocks: blocks.getBlocks(), visualStyle: styleDraft() }, selected.revision); toast("E-mail système enregistré"); await drawSystem(); }
      catch (error) { toast(error.status === 409 ? "Le modèle a été modifié ailleurs. Actualisez avant de recommencer." : errorMessage(error), "error", 7000); }
    };
    const restore = () => confirmAction({ title: "Restaurer ce modèle ?", message: "Le contenu personnalisé sera supprimé et le modèle Squared d’origine sera rétabli.", confirmLabel: "Restaurer", danger: true, onConfirm: async () => { await restoreSystemMailTemplate(selected.key, selected.revision); toast("Modèle d’origine restauré"); await drawSystem(); } });
    const list = card("E-mails système", "Chaque modèle correspond à un envoi automatique du backend.", h("div", { class: "system-mail-list" }, ...templates.map(item => button(item.name, { pressed: item.key === selected.key, onClick: () => { selectedKey = item.key; void drawSystem(); } }))));
    const editor = card(selected.name, `${selected.description} · ${selected.isCustomized ? "Personnalisé" : "Modèle d’origine"}`, h("div", { class: "form" }, field("Objet", subject), field("Texte de secours", body), h("p", { class: "muted", text: `Variables autorisées : ${(selected.variables || []).map(value => `{{${value}}}`).join(" · ")}` }), h("h3", { text: "Blocs de contenu" }), blocks.element, h("label", {}, customStyle, " Style propre à ce modèle"), styleFields, h("div", { class: "page-actions" }, button("Aperçu", { onClick: () => runPreview(false) }), button("Voir l’original", { onClick: () => runPreview(true) }), can("manageMailSettings") ? button("Enregistrer", { kind: "primary", onClick: save }) : null, can("manageMailSettings") && selected.isCustomized ? button("Restaurer", { kind: "ghost", onClick: restore }) : null), preview));
    if (!can("manageMailSettings")) editor.querySelectorAll("input,textarea,select,.system-mail-block-head button").forEach(node => node.disabled = true);
    content.replaceChildren(h("div", { class: "system-mail-layout" }, list, editor));
  }
  await draw(); return root;
}
