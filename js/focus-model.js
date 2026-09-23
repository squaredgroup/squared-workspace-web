/** Data adapters shared by mobile lists, search and details. No network or storage. */
export const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const valueOf = (record, ...keys) => {
  for (const source of [record, record?.payload, record?.data]) for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return "";
};
export const titleOf = record => valueOf(record, "title", "name", "subject", "fileName") || "Sans titre";
export const dueOf = record => valueOf(record, "dueAt", "due_at", "dueDate", "deadline", "startAt", "start_at", "startsAt");
export const statusOf = record => normalize(valueOf(record, "status", "state"));
export const isFinished = record => /^(completed|done|closed|archived|approved|rejected|cancelled|canceled|paid)$/.test(statusOf(record));
export const parentOf = record => valueOf(record, "parent_id", "parentId", "projectId", "projectID", "project_id");
export function assigneeOf(record) {
  const value = valueOf(record, "assigneeId", "assigneeID", "assignedToId", "assignedToID", "assignedTo", "responsibleId", "ownerId");
  return typeof value === "object" ? value?.id || "" : value;
}
export function isMine(record, userId) {
  const ids = valueOf(record, "assigneeIds", "assigneeIDs", "assignedMemberIDs", "participantIDs");
  return Boolean(userId && (assigneeOf(record) === userId || (Array.isArray(ids) && ids.includes(userId))));
}
export function dayKey(value, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : "";
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
  } catch { return dayKey(value, "Europe/Paris"); }
}
export function dueBucket(record, now = new Date(), timeZone) {
  const due = dayKey(dueOf(record), timeZone), today = dayKey(now, timeZone);
  return !due ? "undated" : due < today ? "overdue" : due === today ? "today" : "future";
}
export function dateLabel(value, timeZone) {
  const key = dayKey(value, timeZone);
  if (!key) return "Sans échéance";
  const [y,m,d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day:"numeric", month:"short", year:"numeric" }).format(new Date(y,m-1,d,12));
}
export const statusLabel = value => ({pending:"À faire",active:"En cours",in_progress:"En cours",completed:"Terminé",done:"Terminé",draft:"Brouillon",approved:"Validé",rejected:"Refusé",review:"À examiner",archived:"Archivé",blocked:"Bloqué",paid:"Payé",sent:"Envoyé"})[String(value).toLowerCase()] || String(value || "Non défini").replaceAll("_", " ");
export const domainLabels = {projects:"Projets",tasks:"Tâches",missions:"Missions",events:"Agenda",validations:"Validations",deliverables:"Livrables",documents:"Documents",resources:"Ressources",contracts:"Contrats",clients:"Clients",activities:"Activité"};
export const sectionForDomain = domain => ({events:"planning",activities:"activity",conversations:"messages"})[domain] || domain;
export function strictObject(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Le JSON n’est pas valide. Corrigez-le avant d’enregistrer ; votre saisie est conservée."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Les données doivent être un objet JSON, pas une liste ou une valeur seule.");
  const inspect = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__","prototype","constructor"].includes(key)) throw new Error("Une clé technique non autorisée a été détectée.");
      inspect(child);
    }
  };
  inspect(parsed); return parsed;
}
/** Update a known alias in place; preserve unrelated native fields. */
export function putValue(record, keys, value) {
  for (const source of [record, record.payload]) for (const key of keys) {
    if (source && Object.hasOwn(source,key)) { source[key]=value; return; }
  }
  (record.payload ||= {})[keys[0]]=value;
}
export function notificationTarget(record) {
  const kind = String(valueOf(record,"entityKind","entityType","targetType","sourceType") || "").toLowerCase();
  const domain = ({project:"projects",task:"tasks",mission:"missions",deliverable:"deliverables",validation:"validations",document:"documents",conversation:"conversations",event:"events"})[kind];
  const id = valueOf(record,"entityId","entityID","targetId","targetID","sourceId");
  return domain && typeof id === "string" && id ? {domain,id} : null;
}
