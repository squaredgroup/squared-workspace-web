import { state, setState } from "./store.js";
import { apiURL } from "./config.js";
import { storage } from "./storage.js";

const tokenKey = "sq-workspace-web-refresh";
const tab = storage("session");
const legacy = storage("local");
// Migrate the old persistent refresh token without making it persistent again.
if (!tab.get(tokenKey) && legacy.get(tokenKey)) tab.set(tokenKey, legacy.get(tokenKey));
legacy.remove(tokenKey);
let refreshPromise = null;
let generation = 0;
const device = () => ({ name: "Navigateur Web", platform: "Web" });
const messages = {
  account_locked: "Compte temporairement verrouillé après plusieurs tentatives. Réessayez plus tard.",
  inactive_account: "Ce compte est désactivé. Contactez l’administrateur Workspace.",
  passkey_not_available: "Aucune passkey n’est disponible pour ce compte.",
  invalid_credentials: "Adresse e-mail ou mot de passe incorrect.",
  invalid_refresh_token: "Votre session a expiré. Reconnectez-vous.",
  invalid_or_expired_invitation: "Cette invitation est invalide ou expirée. Demandez une nouvelle invitation.",
  invalid_recovery_code: "Ce code de récupération est invalide ou a déjà été utilisé.",
  invalid_passkey: "La passkey n’a pas pu être vérifiée.",
  forbidden: "Votre compte ne dispose pas de cet accès.",
  member_already_exists: "Un compte utilise déjà cette adresse. Connectez-vous avec ce compte."
};
export class APIError extends Error {
  constructor(status, payload = {}) {
    const code = payload?.error || "";
    const defaults = { 400: "Vérifiez les informations saisies.", 401: "Votre session a expiré. Reconnectez-vous.", 403: "Cette action n’est pas autorisée pour votre compte.", 409: "Les données ont changé. Actualisez avant de recommencer.", 429: "Trop de tentatives. Patientez avant de réessayer." };
    super(messages[code] || payload?.message || defaults[status] || (status >= 500 ? "Le serveur rencontre un problème. Réessayez ultérieurement." : `La requête a échoué (HTTP ${status}).`));
    this.name = "APIError"; this.status = status; this.payload = payload; this.code = code;
  }
}
export function hasStoredSession() { return Boolean(tab.get(tokenKey)); }
export function setSession(envelope) {
  if (!envelope || typeof envelope.accessToken !== "string" || !envelope.accessToken) throw new APIError(502, { message: "La réponse de connexion du serveur est invalide." });
  if (envelope.refreshToken) tab.set(tokenKey, envelope.refreshToken);
  setState({ accessToken: envelope.accessToken, sessionId: envelope.sessionId || null, user: envelope.user || state.user, lastSyncAt: new Date() });
  return envelope;
}
export function clearSession(reason = "expired") {
  generation += 1;
  refreshPromise = null;
  const socket = state.realtime;
  tab.remove(tokenKey); legacy.remove(tokenKey);
  setState({ accessToken: null, sessionId: null, user: null, workspace: null, workspaceEtag: null, domainCatalog: null, realtime: null });
  try { socket?.close(); } catch { /* already closed */ }
  window.dispatchEvent(new CustomEvent("sq:session-ended", { detail: { reason } }));
}
function staleSession() { const error = new Error("Cette session a été fermée."); error.name = "AbortError"; return error; }

export async function request(path, options = {}) {
  const auth = options.auth !== false;
  const started = generation;
  const sentToken = state.accessToken;
  if (auth && !sentToken) throw new APIError(401);
  const headers = { Accept: "application/json", "X-Workspace-Client": "web", ...(options.headers || {}) };
  if (auth) headers.Authorization = `Bearer ${sentToken}`;
  let body = options.rawBody;
  if (options.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(options.body); }
  else if (options.contentType) headers["Content-Type"] = options.contentType;
  const controller = new AbortController();
  const delay = Number(options.timeoutMs ?? window.SQUARED_CONFIG?.requestTimeoutMs ?? 15000);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(120000, Math.max(100, Number.isFinite(delay) ? delay : 15000)));
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  let response, payload;
  try {
    response = await fetch(apiURL(path), { method: options.method || "GET", headers, body, credentials: "omit", cache: "no-store", mode: "cors", signal: controller.signal });
    if (started !== generation) throw staleSession();
    if (![204, 304].includes(response.status)) {
      const type = response.headers.get("content-type") || "";
      if (type.includes("application/json")) payload = await response.json();
      else if (!response.ok) payload = {};
      else throw new APIError(502, { message: "Le serveur n’a pas renvoyé les données attendues." });
    }
  } catch (error) {
    if (timedOut) throw new APIError(0, { error: "timeout", message: "Le serveur ne répond pas à temps. Réessayez sans fermer votre espace." });
    if (error instanceof APIError || error.name === "AbortError") throw error;
    throw new APIError(0, { error: "network", message: navigator.onLine === false ? "Vous êtes hors ligne. Rétablissez votre connexion, puis réessayez." : "Impossible de joindre l’API depuis cette page. Vérifiez votre connexion ; la configuration CORS ou HTTPS du serveur peut aussi bloquer l’accès." });
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener("abort", abort);
  }
  if (started !== generation) throw staleSession();
  if (response.status === 401 && auth && options.retry !== false) {
    // A concurrent request may have already renewed the same token.
    if (sentToken === state.accessToken) await refreshSession();
    return request(path, { ...options, retry: false });
  }
  if (response.status === 401 && auth) clearSession("expired");
  if (!response.ok && response.status !== 304) throw new APIError(response.status, payload);
  return { data: payload ?? null, response };
}
export async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  const token = tab.get(tokenKey);
  if (!token) throw new APIError(401);
  const started = generation;
  const promise = (async () => {
    try {
      const { data } = await request("/v1/auth/refresh", { method: "POST", auth: false, retry: false, body: { refreshToken: token, device: device() } });
      if (started !== generation) throw staleSession();
      return setSession(data);
    } catch (error) {
      if (started === generation && [401, 403].includes(error.status)) clearSession("expired");
      throw error; // Network failures never silently discard a valid refresh session.
    }
  })();
  refreshPromise = promise;
  try { return await promise; } finally { if (refreshPromise === promise) refreshPromise = null; }
}
export async function logout() {
  const id = state.sessionId;
  // Start server revocation while credentials still exist, then clear the UI immediately.
  const revocation = id ? request(`/v1/sessions/${encodeURIComponent(id)}`, { method: "DELETE", retry: false, timeoutMs: 8000 }) : Promise.resolve();
  clearSession("logout");
  try { await revocation; } catch { /* local logout is immediate, even offline */ }
}
export async function probeConnection() {
  await request("/health", { auth: false, retry: false, timeoutMs: 8000, headers: { "Content-Type": "application/json" } });
  return "L’API répond à ce navigateur. La connexion au compte reste à vérifier.";
}
