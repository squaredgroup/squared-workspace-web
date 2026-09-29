const CATEGORIES = new Set(["work", "squared", "strength", "running", "meals", "personal"]);

export function validatePlanningWeek(week) {
  if (week?.version !== 1 || !Array.isArray(week.slots) || week.slots.length > 500 || typeof week.footer !== "string" || week.footer.length > 500) return "Format de semaine non pris en charge.";
  const ids = new Set();
  for (const slot of week.slots) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slot.id) || ids.has(slot.id)) return "Identifiants de créneaux invalides ou en double.";
    ids.add(slot.id);
    if (typeof slot.title !== "string" || !slot.title.trim() || slot.title.length > 100 || typeof slot.notes !== "string" || slot.notes.length > 2000 || !CATEGORIES.has(slot.category)) return "Vérifiez le nom, la catégorie et les notes des créneaux.";
    if (!Array.isArray(slot.weekdays) || !slot.weekdays.length || slot.weekdays.length > 7 || new Set(slot.weekdays).size !== slot.weekdays.length || slot.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return "Choisissez des jours valides sans doublon.";
    if (![slot.startMinute, slot.endMinute].every(value => Number.isInteger(value) && value >= 0 && value < 1440) || typeof slot.endsNextDay !== "boolean" || typeof slot.isStartOnly !== "boolean") return "Vérifiez les horaires du créneau.";
    const duration = slot.endMinute + (slot.endsNextDay ? 1440 : 0) - slot.startMinute;
    if (!slot.isStartOnly && (duration < 5 || duration > 1440)) return "La durée doit être comprise entre 5 minutes et 24 heures. Activez « Fin le lendemain » si nécessaire.";
  }
  return "";
}
