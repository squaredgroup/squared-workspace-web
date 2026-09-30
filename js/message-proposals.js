import { state } from "./store.js";
import { decideMessageProposal, downloadFile, getCoreEntity, loadWorkspace, sendMessageProposal } from "./api.js";
import { button, confirmAction, emptyState, errorMessage, field, formatDate, h, modal, toast } from "./ui.js";
import { editRecord } from "./focus-records.js";
import { formatMoney } from "./money.js";

const kinds = { mission: { collection: "missions", label: "mission", permission: "manageMissions" }, contract: { collection: "contracts", label: "contrat", permission: "manageContracts" } };
const statusLabels = { pending: "En attente de réponse", accepted: "Proposition acceptée", refused: "Proposition refusée", replaced: "Version remplacée", unavailable: "Fiche indisponible" };
const value = (item, key) => item?.[key] ?? item?.payload?.[key];
const memberName = member => member?.name || `${member?.firstName || ""} ${member?.lastName || ""}`.trim() || member?.email || "Membre";
const nonempty = input => String(input ?? "").trim();
function previewTerms(kind, item) {
  return kind === "mission"
    ? { summary: value(item, "summary"), dueAt: value(item, "dueAt"), dueDate: value(item, "dueDate"), remuneration: value(item, "remuneration"), currency: value(item, "currency") }
    : { scope: value(item, "scope"), client: value(item, "client"), organizationName: state.workspace?.enterprise?.organizationProfile?.legalName, amount: value(item, "amount"), amountValue: value(item, "amountValue"), currency: value(item, "currency") };
}

function amount(terms) {
  return formatMoney(nonempty(terms.amount) || terms.amountValue, terms.currency);
}

function remuneration(terms) {
  return formatMoney(terms.remuneration, terms.currency || "", "Non renseignée");
}

function termsSummary(kind, terms) {
  if (kind === "mission") return [terms.summary, `Rémunération : ${remuneration(terms)}`, terms.dueAt ? `Échéance : ${formatDate(terms.dueAt, { dateOnly: true })}` : terms.dueDate ? `Échéance : ${terms.dueDate}` : null].filter(Boolean).join("\n");
  return [terms.scope, terms.client ? `Parties : ${terms.organizationName || "Organisation"} et ${terms.client}` : null, `Montant : ${amount(terms)}`].filter(Boolean).join("\n");
}

export function openProposalPicker(conversation, kind, reload, selectedEntity=null) {
  const definition = kinds[kind];
  if (!definition || !state.user?.permissions?.includes("sendMessages") || !state.user?.permissions?.includes(definition.permission)) {
    toast("Votre rôle ne permet pas de proposer cette fiche dans la messagerie.", "error"); return;
  }
  if (!state.online) { toast("Reconnectez-vous pour envoyer une proposition.", "error"); return; }
  const participantIDs = conversation.participantIDs || conversation.participantIds || [];
  const recipients = participantIDs.filter(id => id !== state.user.id).map(id => {
    const member = (state.workspace?.team || []).find(item => item.id === id);
    return { id, name: member ? memberName(member) : conversation.participants?.[participantIDs.indexOf(id)] || `Membre ${id.slice(0, 8)}` };
  });
  const entries = (state.workspace?.[definition.collection] || []).filter(item => item.id).map(item => ({
    id: item.id, title: nonempty(value(item, "title")) || "Sans titre",
    terms: previewTerms(kind, item)
  }));
  const selectedEntityID=typeof selectedEntity==="string"?selectedEntity:selectedEntity?.id;
  if(selectedEntityID&&typeof selectedEntity==="object"&&!entries.some(item=>item.id===selectedEntityID))entries.push({id:selectedEntityID,title:nonempty(value(selectedEntity,"title"))||"Sans titre",terms:previewTerms(kind,selectedEntity)});
  const recipient = h("select", { "aria-label": "Destinataire désigné" }, h("option", { value: "", text: "Choisir un participant" }), ...recipients.map(item => h("option", { value: item.id, text: item.name })));
  const entity = h("select", { "aria-label": kind === "mission" ? "Mission" : "Contrat" }, h("option", { value: "", text: "Choisir une fiche" }), ...entries.map(item => h("option", { value: item.id, text: item.title })));
  if(selectedEntityID&&entries.some(item=>item.id===selectedEntityID))entity.value=selectedEntityID;
  const preview = h("div", { class: "sq-proposal-preview", role: "status" });
  const updatePreview = () => {
    const entry = entries.find(item => item.id === entity.value);
    preview.replaceChildren(entry ? h("div", {}, h("strong", { text: entry.title }), h("p", { text: termsSummary(kind, entry.terms) || "Aucune condition supplémentaire renseignée." })) : emptyState("Choisissez une fiche", "Son contenu essentiel apparaîtra ici avant l’envoi."));
  };
  entity.addEventListener("change", updatePreview); updatePreview();
  let sending = false, messageID = crypto.randomUUID();
  recipient.addEventListener("change", () => { messageID = crypto.randomUUID(); });
  entity.addEventListener("change", () => { messageID = crypto.randomUUID(); });
  let dialog;
  dialog = modal({ title: kind === "mission" ? "Envoyer une mission" : "Envoyer un contrat", wide: true,
    content: h("div", { class: "form" }, h("p", { class: "page-subtitle", text: "Choisissez une fiche existante et le destinataire qui pourra répondre. Les autres participants du groupe pourront la lire, sans décider à sa place." }),
      field("Destinataire désigné", recipient), field(kind === "mission" ? "Mission" : "Contrat", entity), preview,
      button(kind === "mission" ? "Créer une mission" : "Créer un contrat", { small: true, onClick: () => {
        dialog.close(); editRecord(definition.collection, null, async () => { await loadWorkspace(); await reload(); });
      } }),
      entries.length ? null : h("p", { class: "muted", text: `Aucune fiche de ${definition.label} accessible. Créez-en une dans la rubrique ${kind === "mission" ? "Missions" : "Contrats"}, puis revenez ici.` })),
    actions: [{ label: "Vérifier et envoyer", kind: "primary", onClick: async () => {
      const entry = entries.find(item => item.id === entity.value), target = recipients.find(item => item.id === recipient.value);
      if (!entry || !target) { toast("Choisissez une fiche et un destinataire.", "error"); return; }
      try {
        const fresh = await getCoreEntity(definition.collection, entry.id);
        if (!dialog.overlay.isConnected) return;
        entry.title = nonempty(value(fresh, "title")) || entry.title;
        entry.terms = previewTerms(kind, fresh);
        updatePreview();
      } catch (error) { toast(errorMessage(error), "error", 7000); return; }
      const detail = `Destinataire : ${target.name}\n${kind === "mission" ? "Mission" : "Contrat"} : ${entry.title}\n${termsSummary(kind, entry.terms)}\n\nUne nouvelle version de la proposition sera ajoutée à la conversation.${kind === "contract" ? " L’acceptation ne signe pas le contrat." : ""}`;
      confirmAction({ title: `Envoyer ${kind === "mission" ? "la mission" : "le contrat"} ?`, message: detail, confirmLabel: "Envoyer la proposition", onConfirm: async () => {
        if (sending) return;
        if (!state.online) throw new Error("Connexion nécessaire pour envoyer la proposition.");
        sending = true;
        try {
          await sendMessageProposal(conversation.id, messageID, kind, entry.id, target.id);
          dialog.close(); toast("Proposition envoyée");
          try { await loadWorkspace(); await reload(); }
          catch { toast("Envoi confirmé. Actualisez la conversation pour afficher la proposition ; ne la renvoyez pas.", "error", 7000); }
        } finally { sending = false; }
      } });
    } }]
  });
  return dialog;
}

export function openRecordProposal(domain,record,reload){
  const kind=domain==="missions"?"mission":domain==="contracts"?"contract":"";
  if(!kind||!state.user?.permissions?.includes("sendMessages")||!state.user?.permissions?.includes(kinds[kind].permission))return;
  const conversations=(state.workspace?.conversations||[]).filter(item=>{const ids=item.participantIDs||item.participantIds||[];return ids.includes(state.user.id)&&ids.some(id=>id!==state.user.id)&&!item.isArchived;});
  const choice=h("select",{"aria-label":"Conversation"},h("option",{value:"",text:"Choisir une conversation"}),...conversations.map(item=>h("option",{value:item.id,text:item.name||"Conversation"})));
  modal({title:"Choisir une conversation",content:h("div",{class:"form"},h("p",{class:"page-subtitle",text:`Proposer « ${record.title||value(record,"title")||"Sans titre"} » à un participant d’une conversation existante.`}),field("Conversation",choice),conversations.length?null:emptyState("Aucune conversation disponible","Ouvrez une conversation avec le destinataire depuis Messages, puis revenez ici.","messages")),actions:conversations.length?[{label:"Continuer",kind:"primary",icon:"ArrowRight",onClick:close=>{const conversation=conversations.find(item=>item.id===choice.value);if(!conversation){toast("Choisissez une conversation.","error");return;}close();openProposalPicker(conversation,kind,reload,record);}}]:[]});
}

async function openSource(proposal) {
  const definition = kinds[proposal.kind]; if (!definition) return;
  try {
    const record = await getCoreEntity(definition.collection, proposal.entityID);
    const terms = record.payload || record;
    const content = h("div", { class: "sq-proposal-source" },
      h("p", { class: "muted", text: `Fiche source · version ${record.version || "—"} · ${record.status || "Statut indisponible"}` }),
      h("h4", { text: terms.title || record.title || "Sans titre" }),
      h("p", { text: termsSummary(proposal.kind, terms) || "Aucune information complémentaire." }));
    if (proposal.kind === "contract" && nonempty(terms.storageKey)) content.append(button("Télécharger le document complet", {
      iconName: "download", onClick: async () => { try { await downloadFile(terms.storageKey, `${terms.title || "Contrat"}.pdf`); } catch (error) { toast(errorMessage(error), "error", 7000); } }
    }));
    modal({ title: proposal.kind === "mission" ? "Fiche de la mission" : "Fiche du contrat", content, wide: true });
  } catch (error) { toast(errorMessage(error), "error", 7000); }
}

export function proposalCard(conversation, message, reload) {
  const proposal = message.proposal, terms = proposal?.terms || {}, definition = kinds[proposal?.kind];
  if (!definition) return null;
  const status = statusLabels[proposal.status] || "Statut indisponible";
  const card = h("section", { class: `sq-proposal-card sq-proposal-${proposal.status}`, "aria-label": `Proposition de ${definition.label} : ${status}` },
    h("div", { class: "sq-proposal-head" }, h("span", { class: "sq-proposal-type", text: `PROPOSITION DE ${definition.label.toUpperCase()} · VERSION ${proposal.version}` }), h("span", { class: "sq-proposal-status", text: status })),
    h("h4", { text: terms.title || (proposal.kind === "mission" ? "Mission" : "Contrat") }),
    terms.summary || terms.scope ? h("p", { class: "sq-proposal-summary", text: terms.summary || terms.scope }) : null,
    proposal.kind === "mission"
      ? h("div", { class: "sq-proposal-finance" }, h("span", { text: "RÉMUNÉRATION" }), h("strong", { class: nonempty(terms.remuneration) ? "sq-proposal-amount" : "", text: remuneration(terms) }))
      : h("div", { class: "sq-proposal-finance" }, h("span", { text: "MONTANT DU CONTRAT" }), h("strong", { class: nonempty(terms.amount) || terms.amountValue != null ? "sq-proposal-amount" : "", text: amount(terms) })),
    proposal.kind === "mission" && (terms.dueAt || terms.dueDate) ? h("div", { class: "sq-proposal-facts" }, h("span", { text: `Échéance · ${terms.dueAt ? formatDate(terms.dueAt, { dateOnly: true }) : terms.dueDate}` })) : null,
    proposal.kind === "contract" && terms.client ? h("div", { class: "sq-proposal-facts" }, h("span", { text: `Parties · ${terms.organizationName || "Organisation"} et ${terms.client}` })) : null,
    h("div", { class: "sq-proposal-actions" }, button(proposal.kind === "mission" ? "Voir la mission" : "Consulter le contrat", { small: true, onClick: () => openSource(proposal), disabled: proposal.status === "unavailable" })));
  if (proposal.kind === "contract" && proposal.status === "accepted") card.append(h("p", { class: "sq-proposal-footnote", text: "Proposition acceptée. Une signature reste une étape distincte si elle est requise." }));
  if (proposal.status === "pending" && proposal.recipientID === state.user?.id) {
    let deciding = false;
    const actions = card.querySelector(".sq-proposal-actions");
    for (const [decision, label] of [["accepted", "Accepter la proposition"], ["refused", "Refuser la proposition"]]) actions.append(button(label, { small: true, kind: decision === "accepted" ? "primary" : "ghost", onClick: () => {
      confirmAction({ title: `${decision === "accepted" ? "Accepter" : "Refuser"} cette proposition ?`,
        message: `Vous allez ${decision === "accepted" ? "accepter" : "refuser"} ${definition.label === "mission" ? "la mission" : "le contrat"} « ${terms.title || "Sans titre"} » (version ${proposal.version}).${proposal.kind === "contract" ? " Cette décision ne signe pas le document." : ""}`,
        confirmLabel: decision === "accepted" ? "Confirmer l’acceptation" : "Confirmer le refus", danger: decision === "refused",
        onConfirm: async () => {
          if (deciding) return;
          deciding = true;
          try {
            await decideMessageProposal(conversation.id, message.id, decision);
            message.proposal.status = decision;
            card.classList.replace("sq-proposal-pending", `sq-proposal-${decision}`);
            card.querySelector(".sq-proposal-status").textContent = statusLabels[decision];
            actions.querySelectorAll(".button:not(:first-child)").forEach(control => control.remove());
            toast("Réponse enregistrée");
            try { await loadWorkspace(); await reload(); }
            catch { toast("Réponse enregistrée, mais actualisation impossible. Ne répondez pas une seconde fois.", "error", 7000); }
          }
          finally { deciding = false; }
        } });
    } }));
  }
  return card;
}
