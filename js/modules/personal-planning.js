import { loadPersonalPlanning, savePersonalPlanning } from "../api.js";
import { validatePlanningWeek } from "../personal-planning-model.js";
import { state } from "../store.js";
import { h, pageHeader, card, button, modal, field, input, textarea, toast, errorMessage, emptyState, confirmAction } from "../ui.js";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CATEGORIES = { work: "Travail", squared: "Squared", strength: "Musculation", running: "Course", meals: "Repas", personal: "Personnel" };
const time = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minute = value => { const match = /^(\d{2}):(\d{2})$/.exec(value); return match ? Number(match[1]) * 60 + Number(match[2]) : NaN; };
const initialWeek = () => ({ version: 1, slots: [], footer: "", updatedAt: null });

export async function renderPersonalPlanning() {
  const owner = state.user?.id;
  const root = h("div", { class: "personal-planning" });
  let envelope;
  try { envelope = await loadPersonalPlanning(); }
  catch (error) { return h("div", {}, pageHeader({ eyebrow: "Planning", title: "Planning personnel" }), emptyState("Planning indisponible", errorMessage(error), "warning")); }
  if (owner !== state.user?.id) return root;
  let week = envelope.week || initialWeek(), version = Number(envelope.version) || 0;
  const content = h("div");
  const persist = async next => {
    const problem = validatePlanningWeek(next); if (problem) { toast(problem, "error"); return false; }
    try {
      const saved = await savePersonalPlanning({ ...next, updatedAt: new Date().toISOString() }, version);
      if (owner !== state.user?.id) return false;
      week = { ...next, updatedAt: new Date().toISOString() }; version = Number(saved.version);
      draw(); toast("Planning personnel synchronisé"); return true;
    } catch (error) {
      if (error.status === 409 || error.statusCode === 409) toast("Le planning a changé sur un autre appareil. Actualisez la page avant de modifier.", "error", 7000);
      else toast(errorMessage(error), "error", 6000);
      return false;
    }
  };
  const edit = (slot = null) => {
    const title = input(slot?.title || "", { required: true, maxLength: 100 });
    const category = h("select", {}, ...Object.entries(CATEGORIES).map(([value, label]) => h("option", { value, selected: (slot?.category || "personal") === value, text: label })));
    const start = input(time(slot?.startMinute ?? 540), { type: "time", required: true });
    const end = input(time(slot?.endMinute ?? 600), { type: "time", required: true });
    const nextDay = h("input", { type: "checkbox", checked: slot?.endsNextDay || false });
    const startOnly = h("input", { type: "checkbox", checked: slot?.isStartOnly || false });
    const notes = textarea(slot?.notes || "", { maxLength: 2000, rows: 3 });
    const selectedDays = new Set(slot?.weekdays || [0]);
    const days = h("div", { class: "planning-days", role: "group", "aria-label": "Jours de la semaine" }, ...DAYS.map((day, index) => {
      const check = h("input", { type: "checkbox", checked: selectedDays.has(index) });
      check.addEventListener("change", () => check.checked ? selectedDays.add(index) : selectedDays.delete(index));
      return h("label", {}, check, h("span", { text: day }));
    }));
    modal({ title: slot ? "Modifier le créneau" : "Nouveau créneau", wide: true,
      content: h("div", { class: "form" }, field("Nom", title), field("Catégorie", category), days, h("div", { class: "form-grid" }, field("Début", start), field("Fin", end)), h("div", { class: "planning-options" }, h("label", {}, nextDay, " Fin le lendemain"), h("label", {}, startOnly, " Heure de début uniquement")), field("Notes", notes)),
      actions: [{ label: "Enregistrer", kind: "primary", onClick: async close => {
        if (!title.reportValidity() || !start.reportValidity() || !end.reportValidity()) return;
        const candidate = { id: slot?.id || crypto.randomUUID(), title: title.value.trim(), category: category.value, weekdays: [...selectedDays].sort(), startMinute: minute(start.value), endMinute: minute(end.value), endsNextDay: nextDay.checked, isStartOnly: startOnly.checked, notes: notes.value };
        if (await persist({ ...week, slots: slot ? week.slots.map(item => item.id === slot.id ? candidate : item) : [...week.slots, candidate] })) close();
      } }]
    });
  };
  const exportWeek = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(week, null, 2)], { type: "application/json" }));
    const link = h("a", { href: url, download: "Mon-planning-personnel.json" }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const picker = h("input", { type: "file", accept: "application/json,.json", class: "sr-only" });
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0]; picker.value = ""; if (!file) return;
    if (file.size > 2_000_000) { toast("Le fichier doit faire moins de 2 Mo.", "error"); return; }
    let parsed; try { parsed = JSON.parse(await file.text()); } catch { toast("Fichier JSON invalide.", "error"); return; }
    const problem = validatePlanningWeek(parsed); if (problem) { toast(problem, "error"); return; }
    confirmAction({ title: "Importer cette semaine type ?", message: `${parsed.slots.length} créneau(x) remplaceront le planning personnel actuel.`, confirmLabel: "Importer", onConfirm: async () => { await persist(parsed); } });
  });
  root.append(pageHeader({ eyebrow: "Planning · privé", title: "Ma semaine type", subtitle: "Vos créneaux personnels se synchronisent sur votre compte et ne sont pas partagés avec l’équipe.", actions: [button("Importer", { iconName: "upload", onClick: () => picker.click() }), button("Exporter", { iconName: "download", onClick: exportWeek }), button("Nouveau créneau", { kind: "primary", iconName: "add", onClick: () => edit() })] }), picker, content);
  function draw() {
    const columns = DAYS.map((day, index) => {
      const slots = week.slots.filter(slot => slot.weekdays.includes(index)).sort((a, b) => a.startMinute - b.startMinute);
      const cards = slots.map(slot => {
        const remove = () => confirmAction({ title: "Supprimer ce créneau ?", message: `« ${slot.title} » sera retiré de chaque jour sélectionné.`, confirmLabel: "Supprimer", danger: true, onConfirm: () => persist({ ...week, slots: week.slots.filter(item => item.id !== slot.id) }) });
        const label = slot.isStartOnly ? `Dès ${time(slot.startMinute)}` : `${time(slot.startMinute)} – ${time(slot.endMinute)}${slot.endsNextDay ? " +1 j" : ""}`;
        return h("article", { class: `planning-slot category-${slot.category}` },
          h("span", { class: "planning-slot-time", text: label }), h("strong", { text: slot.title }),
          h("small", { text: CATEGORIES[slot.category] }), slot.notes ? h("p", { text: slot.notes }) : null,
          h("div", { class: "planning-slot-actions" }, button("Modifier", { small: true, onClick: () => edit(slot) }), button("Supprimer", { small: true, kind: "ghost", onClick: remove })));
      });
      return h("section", { class: "planning-day" }, h("h3", { text: day }), cards.length ? h("div", { class: "planning-day-slots" }, ...cards) : h("p", { class: "muted", text: "Aucun créneau" }));
    });
    content.replaceChildren(card("EMPLOI DU TEMPS", `${week.slots.length} créneau(x) · ${week.slots.reduce((sum, slot) => sum + slot.weekdays.length, 0)} occurrence(s)`, h("div", { class: "planning-grid" }, ...columns), { className: "planning-poster" }), card("Note de la semaine", "Visible uniquement dans votre planning personnel.", h("div", { class: "form" }, field("Note", textarea(week.footer, { maxLength: 500, rows: 2 })), button("Enregistrer la note", { onClick: async event => { const value = event.currentTarget.parentElement.querySelector("textarea").value; await persist({ ...week, footer: value }); } }))));
  }
  draw(); return root;
}
