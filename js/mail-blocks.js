import { h, button, field, input, textarea } from "./ui.js";

export const mailBlockKinds = [
  ["PREHEADER", "Pré-en-tête"], ["HEADING", "Titre"], ["SUBHEADING", "Sous-titre"],
  ["PARAGRAPH", "Paragraphe"], ["QUOTE", "Citation"], ["TESTIMONIAL", "Témoignage"],
  ["BULLETED_LIST", "Liste à puces"], ["NUMBERED_LIST", "Liste numérotée"], ["CHECKLIST", "Liste à cocher"],
  ["CALLOUT", "Encadré"], ["HIGHLIGHT", "Mise en avant"], ["EVENT", "Événement"],
  ["CONTACT_CARD", "Carte de contact"], ["FILE_LINK", "Fichier lié"], ["SIGNATURE", "Signature"],
  ["FOOTER_NOTE", "Note de bas de page"], ["IMAGE", "Image"], ["BUTTON", "Bouton"],
  ["DIVIDER", "Séparateur"], ["SPACER", "Espace"], ["BANNER", "Bannière"],
  ["SECTION", "Section"], ["COLUMNS", "Colonnes"], ["IMAGE_TEXT", "Image et texte"],
  ["GALLERY", "Galerie"], ["CARDS", "Cartes"], ["STEPS", "Étapes"],
  ["DATA_TABLE", "Tableau"], ["ACTION_GROUP", "Groupe de liens"], ["FAQ", "FAQ"],
  ["STATS", "Statistiques"], ["TIMELINE", "Chronologie"], ["PROGRESS", "Progression"],
  ["SOCIAL_LINKS", "Réseaux sociaux"], ["VIDEO_LINK", "Vidéo liée"]
];
const labels = new Map(mailBlockKinds);
export const newMailBlock = kind => ({ id: crypto.randomUUID(), kind, text: "", url: "", alternativeText: "" });

export function mailBlocksEditor(initial = [], { readOnly = false } = {}) {
  let blocks = structuredClone(initial || []);
  const host = h("div", { class: "mail-block-editor" });
  const draw = () => {
    host.replaceChildren(...blocks.map((block, index) => {
      const kind = h("select", { disabled: readOnly }, ...mailBlockKinds.map(([value, label]) => h("option", { value, text: label, selected: block.kind === value })));
      if (!labels.has(block.kind)) kind.prepend(h("option", { value: block.kind, text: block.kind, selected: true }));
      const text = textarea(block.text || "", { rows: 3, maxLength: 20000 }); text.disabled = readOnly;
      const url = input(block.url || "", { maxLength: 12000, placeholder: "https://… ou Libellé | URL selon le bloc" }); url.disabled = readOnly;
      const thumbnail = input(block.thumbnailURL || "", { maxLength: 2048, placeholder: "https://…" }); thumbnail.disabled = readOnly;
      const alternative = input(block.alternativeText || "", { maxLength: 500 }); alternative.disabled = readOnly;
      const update = () => {
        blocks[index] = { ...blocks[index], kind: kind.value, text: text.value, url: url.value, alternativeText: alternative.value,
          ...(thumbnail.value ? { thumbnailURL: thumbnail.value } : {}) };
        if (!thumbnail.value) delete blocks[index].thumbnailURL;
        if (block.text !== text.value) delete blocks[index].marks;
      };
      [kind, text, url, thumbnail, alternative].forEach(control => control.addEventListener("input", update));
      const move = offset => { [blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]]; draw(); };
      return h("section", { class: "mail-block-item", "aria-label": `Bloc ${index + 1} : ${labels.get(block.kind) || block.kind}` },
        h("div", { class: "mail-block-toolbar" }, h("strong", { text: `Bloc ${index + 1}` }),
          readOnly ? null : button("Monter", { small: true, disabled: index === 0, onClick: () => move(-1) }),
          readOnly ? null : button("Descendre", { small: true, disabled: index === blocks.length - 1, onClick: () => move(1) }),
          readOnly ? null : button("Dupliquer", { small: true, onClick: () => { blocks.splice(index + 1, 0, { ...structuredClone(blocks[index]), id: crypto.randomUUID() }); draw(); } }),
          readOnly ? null : button("Retirer", { small: true, kind: "ghost", onClick: () => { blocks.splice(index, 1); draw(); } })),
        field("Type de bloc", kind), field("Texte du bloc", text), field("Lien du bloc", url),
        block.kind === "VIDEO_LINK" ? field("Miniature", thumbnail) : null,
        field("Texte alternatif ou valeur", alternative));
    }), readOnly ? null : button("Ajouter un bloc", { small: true, iconName: "add", disabled: blocks.length >= 80, onClick: () => { blocks.push(newMailBlock("PARAGRAPH")); draw(); } }));
  };
  draw();
  return { element: host, getBlocks: () => structuredClone(blocks) };
}
