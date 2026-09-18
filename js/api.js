import { state, setState } from "./store.js";
import { apiURL } from "./config.js";

const DEVICE = () => ({ name: navigator.userAgentData?.platform ? `Web · ${navigator.userAgentData.platform}` : "Navigateur Web", platform: "Web" });
let refreshPromise = null;
const REFRESH_TOKEN_KEY = "sq-workspace-web-refresh";

export class APIError extends Error {
  constructor(status, payload) {
    super(payload?.message || payload?.error || `HTTP ${status}`);
    this.status = status;
    this.payload = payload || {};
    this.code = this.payload.error;
  }
}

function baseHeaders(extra = {}) { return { Accept: "application/json", "X-Workspace-Client": "web", ...extra }; }
async function parseResponse(response) {
  if (response.status === 204 || response.status === 304) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  if (type.startsWith("text/")) return response.text();
  return response.blob();
}
function captureRevision(response) {
  const etag = response.headers.get("etag");
  if (etag) state.workspaceEtag = etag;
}

export async function request(path, options = {}) {
  const original = {
    method: options.method || "GET",
    body: options.body,
    rawBody: options.rawBody,
    contentType: options.contentType,
    auth: options.auth !== false,
    retry: options.retry !== false,
    headers: { ...(options.headers || {}) }
  };
  const h = baseHeaders(original.headers);
  if (original.auth && state.accessToken) h.Authorization = `Bearer ${state.accessToken}`;
  let payloadBody;
  if (original.body !== undefined) {
    h["Content-Type"] = "application/json";
    payloadBody = JSON.stringify(original.body);
  } else if (original.rawBody !== undefined) {
    payloadBody = original.rawBody;
    if (original.contentType) h["Content-Type"] = original.contentType;
  }
  const response = await fetch(apiURL(path), { method: original.method, headers: h, body: payloadBody, credentials: "omit", cache: "no-store", mode: "cors" });
  captureRevision(response);
  if (response.status === 401 && original.auth && original.retry) {
    try {
      await refreshSession();
      return request(path, { ...original, retry: false });
    } catch {
      clearSession();
    }
  }
  const payload = await parseResponse(response).catch(() => null);
  if (!response.ok && response.status !== 304) throw new APIError(response.status, payload);
  return { data: payload, response };
}

export function setSession(envelope) {
  if (envelope?.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, envelope.refreshToken);
  setState({ accessToken: envelope.accessToken || null, sessionId: envelope.sessionId || null, user: envelope.user || state.user, lastSyncAt: new Date() });
  return envelope;
}
export function clearSession() {
  try { state.realtime?.close(); } catch { /* noop */ }
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  setState({ accessToken: null, sessionId: null, user: null, workspace: null, workspaceEtag: null, domainCatalog: null, realtime: null });
}

export async function passwordLogin(email, password) {
  const { data } = await request("/v1/auth/password", { method: "POST", auth: false, retry: false, body: { email, password, device: DEVICE() } });
  if (data?.mfaRequired) return data;
  return setSession(data);
}
export async function passkeyOptions(email) { return (await request("/v1/auth/passkey/options", { method: "POST", auth: false, retry: false, body: { email } })).data; }
export async function verifyPasskey(challengeId, response) { return setSession((await request("/v1/auth/passkey/verify", { method: "POST", auth: false, retry: false, body: { challengeId, response, device: DEVICE() } })).data); }
export async function verifyRecovery(challengeId, recoveryCode) { return setSession((await request("/v1/auth/mfa/recovery", { method: "POST", auth: false, retry: false, body: { challengeId, recoveryCode, device: DEVICE() } })).data); }
export async function activateAccount(payload) { return setSession((await request("/v1/auth/activate", { method: "POST", auth: false, retry: false, body: { ...payload, device: DEVICE() } })).data); }
export async function requestPasswordReset(email) { await request("/v1/auth/password-reset/request", { method: "POST", auth: false, retry: false, body: { email } }); }
export async function confirmPasswordReset(email, token, newPassword) { await request("/v1/auth/password-reset/confirm", { method: "POST", auth: false, retry: false, body: { email, token, newPassword } }); }
export async function confirmEmailVerification(email, token) { await request("/v1/auth/email-verification/confirm", { method: "POST", auth: false, retry: false, body: { email, token } }); }
export async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error("Aucune session persistante.");
  refreshPromise = (async () => setSession((await request("/v1/auth/refresh", { method: "POST", auth: false, retry: false, body: { refreshToken, device: DEVICE() } })).data))().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export async function logout() {
  try { if (state.sessionId) await request(`/v1/sessions/${state.sessionId}`, { method: "DELETE" }); } catch { /* clear locally anyway */ }
  clearSession();
}

export async function loadMe() { const { data } = await request("/v1/me"); setState({ user: data }); return data; }
export async function updateMe(value) { const { data } = await request("/v1/me", { method: "PATCH", body: value }); setState({ user: data }); return data; }
export async function loadSecurity() { return (await request("/v1/me/security")).data; }
export async function updateSecurity(value) { return (await request("/v1/me/security", { method: "PUT", body: value })).data; }
export async function changePassword(currentPassword, newPassword) { await request("/v1/me/password", { method: "PUT", body: { currentPassword, newPassword } }); }
export async function createPasskeyOptions() { return (await request("/v1/me/passkeys/options", { method: "POST" })).data; }
export async function registerPasskey(challengeId, response, name) { return (await request("/v1/me/passkeys", { method: "POST", body: { challengeId, response, name } })).data; }
export async function recoveryCodes() { return (await request("/v1/me/recovery-codes", { method: "POST" })).data; }
export async function listSessions() { return (await request("/v1/sessions")).data || []; }
export async function revokeSession(id) { await request(`/v1/sessions/${id}`, { method: "DELETE" }); }
export async function loadSettings() { return (await request("/v1/settings")).data; }
export async function saveSettings(value) { return (await request("/v1/settings", { method: "PUT", body: value })).data; }

export async function loadWorkspace() {
  const { data, response } = await request("/v1/workspace", { headers: state.workspaceEtag ? { "If-None-Match": state.workspaceEtag } : {} });
  if (response?.status === 304) return state.workspace;
  const etag = response?.headers?.get("etag");
  setState({ workspace: data || state.workspace, workspaceEtag: etag || state.workspaceEtag, lastSyncAt: new Date() });
  return data || state.workspace;
}
export async function loadDomainCatalog() { const { data } = await request("/v1/domain-data/catalog"); setState({ domainCatalog: data }); return data; }

export async function listCoreDomain(domain) {
  const items = []; let cursor = null; let guard = 0;
  do {
    const url = `/v1/${domain}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const { data, response } = await request(url);
    items.push(...(Array.isArray(data) ? data : []));
    cursor = response.headers.get("x-next-cursor"); guard += 1;
  } while (cursor && guard < 50);
  return items;
}
export async function getCoreEntity(domain, id) { return (await request(`/v1/${domain}/${id}`)).data; }
export async function saveCoreEntity(domain, entity) {
  const isEdit = Boolean(entity.id && entity.version);
  const path = isEdit ? `/v1/${domain}/${entity.id}` : `/v1/${domain}`;
  return (await request(path, { method: isEdit ? "PATCH" : "POST", headers: { "If-Match": state.workspaceEtag || '"0"' }, body: entity })).data;
}
export async function archiveCoreEntity(domain, id) { await request(`/v1/${domain}/${id}`, { method: "DELETE", headers: { "If-Match": state.workspaceEtag || '"0"' } }); }

export async function listSpecialized(kind) {
  const items = []; let cursor = null; let guard = 0;
  do {
    const { data } = await request(`/v1/domain-data/${kind}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    items.push(...(data.items || [])); cursor = data.nextCursor; guard += 1;
  } while (cursor && guard < 50);
  return items;
}
export async function getSpecialized(kind, id) { return (await request(`/v1/domain-data/${kind}/${id}`)).data; }
export async function saveSpecialized(kind, entity) {
  const edit = Boolean(entity.id && entity.version);
  const path = edit ? `/v1/domain-data/${kind}/${entity.id}` : `/v1/domain-data/${kind}`;
  return (await request(path, { method: edit ? "PATCH" : "POST", headers: { "If-Match": state.workspaceEtag || '"0"' }, body: entity })).data;
}
export async function archiveSpecialized(kind, id, version) { await request(`/v1/domain-data/${kind}/${id}?version=${version}`, { method: "DELETE", headers: { "If-Match": state.workspaceEtag || '"0"' } }); }

export async function uploadFile(file, entityKind, entityId) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  const { data: upload } = await request("/v1/files/upload-url", { method: "POST", body: { fileName: file.name, contentType: file.type || "application/octet-stream", byteCount: file.size, checksum, entityKind, entityId } });
  await request(`/v1/files/${upload.fileId}/content`, { method: "PUT", rawBody: bytes, contentType: file.type || "application/octet-stream" });
  return (await request(`/v1/files/${upload.fileId}/complete`, { method: "POST", body: { checksum, byteCount: file.size } })).data;
}
export async function downloadFile(id) { const { data } = await request(`/v1/files/${id}/download-url`); location.href = data.url; }

export async function getProjectPublication(projectId) { return (await request(`/v1/projects/${projectId}/publication`)).data; }
export async function saveProjectPublication(projectId, value) { return (await request(`/v1/projects/${projectId}/publication`, { method: "PUT", body: value })).data; }
export async function projectPublicationCommand(projectId, command) { return (await request(`/v1/projects/${projectId}/publication/${command}`, { method: "POST" })).data; }

export async function cmsCollections(noCache = false) { return (await request(`/v1/cms/collections${noCache ? "?includeCounts=true" : ""}`, { headers: noCache ? { "Cache-Control": "no-cache" } : {} })).data; }
export async function cmsItems(collectionId, limit = 100, offset = 0) { return (await request(`/v1/cms/collections/${encodeURIComponent(collectionId)}/items?limit=${limit}&offset=${offset}`)).data; }
export async function cmsItem(collectionId, itemId) { return (await request(`/v1/cms/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`)).data; }
export async function saveCMSItem(collectionId, itemId, value) { return (await request(`/v1/cms/collections/${encodeURIComponent(collectionId)}/items${itemId ? `/${encodeURIComponent(itemId)}` : ""}`, { method: itemId ? "PATCH" : "POST", body: value })).data; }
export async function deleteCMSItem(collectionId, itemId) { await request(`/v1/cms/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }); }

export async function trainingCatalog() { return (await request("/v1/training/catalog")).data; }
export async function trainingLesson(id) { return (await request(`/v1/training/lessons/${id}`)).data; }
export async function setTrainingProgress(id, completed) { return (await request(`/v1/training/lessons/${id}/progress`, { method: "PUT", body: { completed } })).data; }

export async function mailbox(folder = "INBOX", search = "", filter = "ALL", cursor = null) {
  const qs = new URLSearchParams({ folder, search, filter, limit: "100" }); if (cursor) qs.set("cursor", cursor);
  return (await request(`/v1/mailbox?${qs}`)).data;
}
export async function mailboxThread(id) { return (await request(`/v1/mailbox/${id}/thread`)).data; }
export async function mailboxMessage(id) { return (await request(`/v1/mailbox/${id}`)).data; }
export async function updateMailboxMessage(id, value) { return (await request(`/v1/mailbox/${id}`, { method: "PATCH", body: value })).data; }
export async function sendMail(value) { return (await request("/v1/mailbox/send", { method: "POST", body: value })).data; }
export async function mailboxTemplates() { return (await request("/v1/mailbox/templates")).data; }
export async function mailboxStyle() { return (await request("/v1/mailbox/style")).data; }
export async function saveMailboxStyle(value) { return (await request("/v1/mailbox/style", { method: "PUT", body: value })).data; }

export async function createConversation(value) { return (await request("/v1/conversations", { method: "POST", body: value })).data; }
export async function sendConversationMessage(conversationId, body, replyToMessageID = null) {
  return (await request(`/v1/conversations/${conversationId}/messages`, { method: "POST", body: { message: { id: crypto.randomUUID(), body, time: "À l’instant", createdAt: new Date().toISOString() }, replyToMessageID, forwardedFromMessageID: null } })).data;
}
export async function markConversationRead(conversationId, lastReadMessageID = null) { return (await request(`/v1/conversations/${conversationId}/read`, { method: "PUT", body: { isRead: true, lastReadMessageID } })).data; }

export async function adminSecurityOverview() { return (await request("/v1/admin/security-overview")).data; }

export async function listInvitations() { return (await request("/v1/invitations")).data || []; }
export async function createInvitation(value) { return (await request("/v1/invitations", { method: "POST", body: value })).data; }
export async function resendInvitation(id) { return (await request(`/v1/invitations/${id}/resend`, { method: "POST" })).data; }
export async function revokeInvitation(id) { await request(`/v1/invitations/${id}`, { method: "DELETE" }); }
export async function changeMemberRole(id, role) { await request(`/v1/members/${id}/role`, { method: "PUT", body: { role } }); }
export async function changeMemberState(id, isActive) { await request(`/v1/members/${id}/state`, { method: "PATCH", body: { isActive } }); }
export async function listCustomRoles() { return (await request("/v1/custom-roles")).data || []; }
export async function assignCustomRole(id, customRoleId) { await request(`/v1/members/${id}/custom-role`, { method: "PUT", body: { customRoleId } }); }
export async function effectiveMemberAccess(id) { return (await request(`/v1/members/${id}/effective-access`)).data; }
export async function memberSessions(id) { return (await request(`/v1/members/${id}/sessions`)).data || []; }
export async function revokeAdminSession(id) { await request(`/v1/admin/sessions/${id}`, { method: "DELETE" }); }
export async function listAPIKeys() { return (await request("/v1/api-keys")).data || []; }
export async function integrationHealth() { return (await request("/v1/integrations/health")).data; }
