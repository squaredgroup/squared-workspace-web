export function formatMoney(value, currency = "EUR", fallback = "Montant non renseigné") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(normalized)) return raw;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return raw;
  if (!currency) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(numeric);
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR" }).format(numeric); }
  catch { return `${numeric} ${currency || "EUR"}`; }
}
