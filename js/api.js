import { state, setState } from "./store.js";
import { request, setSession, refreshSession, APIError } from "./session.js";
import { apiURL } from "./config.js";
export { APIError, request, setSession, clearSession, refreshSession, logout, hasStoredSession, probeConnection } from "./session.js";
const DEVICE = () => ({ name: "Navigateur Web", platform: "Web" });

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
export async function loadMe() { const { data } = await request("/v1/me"); setState({ user: data }); return data; }
export async function updateMe(value) {
  const owner=state.user?.id;
  const avatar=state.user?.avatarData||state.user?.avatar_data||null;
  const body={...value,avatarData:Object.hasOwn(value,"avatarData")?value.avatarData:avatar};
  const { data } = await request("/v1/me", { method: "PATCH", body });
  if(state.user?.id===owner){
    const workspace=state.workspace?{...state.workspace,team:(state.workspace.team||[]).map(member=>(member.id||member.memberId)===owner?{...member,...data}:member)}:state.workspace;
    setState({user:data,workspace,profileRevision:(state.profileRevision||0)+1});
  }
  return data;
}
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
export async function loadPersonalPlanning() { return (await request("/v1/me/personal-planning")).data; }
export async function savePersonalPlanning(week, expectedVersion) {
  return (await request("/v1/me/personal-planning", { method: "PUT", body: { week, expectedVersion } })).data;
}

export async function loadWorkspace() {
  const { data, response } = await request("/v1/workspace", { headers: state.workspaceEtag ? { "If-None-Match": state.workspaceEtag } : {} });
  if (response?.status === 304) return state.workspace;
  const etag = response?.headers?.get("etag");
  // A slower read must never replace a newer workspace projection received
  // after a write or another realtime invalidation.
  const revision = value => /^"\d+"$/.test(value || "") ? Number(value.slice(1, -1)) : null;
  const incomingRevision = revision(etag), visibleRevision = revision(state.workspaceEtag);
  if (incomingRevision !== null && visibleRevision !== null && incomingRevision < visibleRevision) {
    return state.workspace;
  }
  setState({ workspace: data || state.workspace, workspaceEtag: etag || state.workspaceEtag, lastSyncAt: new Date() });
  return data || state.workspace;
}

async function writeWithFreshWorkspaceRevision(write) {
  try { return await write(); }
  catch (error) {
    if (error?.status !== 409 && error?.status !== 412 && error?.status !== 428) throw error;
    await loadWorkspace();
    return write();
  }
}
export async function loadDomainCatalog() { const { data } = await request("/v1/domain-data/catalog"); setState({ domainCatalog: data }); return data; }

function stableItems(items){
  const seen=new Set();
  return items.filter(item=>{const key=item?.id?String(item.id):"";if(!key)return true;if(seen.has(key))return false;seen.add(key);return true});
}
async function paginate(loadPage){
  const items=[],seenCursors=new Set();let cursor=null;
  for(let page=0;page<50;page+=1){
    const result=await loadPage(cursor);items.push(...(result.items||[]));cursor=result.cursor||null;
    if(!cursor)return stableItems(items);
    if(seenCursors.has(cursor))throw new Error("La pagination du serveur boucle sur la même page. Réessayez après synchronisation.");
    seenCursors.add(cursor);
  }
  throw new Error("Le périmètre dépasse la limite de chargement. Affinez la recherche ou ouvrez le module concerné.");
}
export async function listCoreDomain(domain,{signal}={}) {
  return paginate(async cursor=>{
    const url = `/v1/${domain}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const { data, response } = await request(url,{signal});
    return {items:Array.isArray(data)?data:[],cursor:response.headers.get("x-next-cursor")};
  });
}
export async function getCoreEntity(domain, id) { return (await request(`/v1/${domain}/${id}`)).data; }
export async function saveCoreEntity(domain, entity) {
  const isEdit = Boolean(entity.id && entity.version);
  const path = isEdit ? `/v1/${domain}/${entity.id}` : `/v1/${domain}`;
  return (await writeWithFreshWorkspaceRevision(() => request(path, { method: isEdit ? "PATCH" : "POST", headers: { "If-Match": state.workspaceEtag || '"0"' }, body: entity }))).data;
}
export async function archiveCoreEntity(domain, id) { await writeWithFreshWorkspaceRevision(() => request(`/v1/${domain}/${id}`, { method: "DELETE", headers: { "If-Match": state.workspaceEtag || '"0"' } })); }

export async function listSpecialized(kind,{signal}={}) {
  return paginate(async cursor=>{
    const { data } = await request(`/v1/domain-data/${kind}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,{signal});
    return {items:Array.isArray(data?.items)?data.items:[],cursor:data?.nextCursor};
  });
}
export async function getSpecialized(kind, id) { return (await request(`/v1/domain-data/${kind}/${id}`)).data; }
export async function saveSpecialized(kind, entity) {
  const edit = Boolean(entity.id && entity.version);
  const path = edit ? `/v1/domain-data/${kind}/${entity.id}` : `/v1/domain-data/${kind}`;
  return (await writeWithFreshWorkspaceRevision(() => request(path, { method: edit ? "PATCH" : "POST", headers: { "If-Match": state.workspaceEtag || '"0"' }, body: entity }))).data;
}
export async function archiveSpecialized(kind, id, version) { await writeWithFreshWorkspaceRevision(() => request(`/v1/domain-data/${kind}/${id}?version=${version}`, { method: "DELETE", headers: { "If-Match": state.workspaceEtag || '"0"' } })); }

export async function uploadFile(file, entityType, entityId) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Le fichier dépasse la limite de 25 Mo.");
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  const { data: upload } = await request("/v1/files/upload-url", { method: "POST", body: { fileName: file.name, contentType: file.type || "application/octet-stream", byteCount: file.size, entityType, entityId } });
  await request(`/v1/files/${upload.fileId}/content`, { method: "PUT", rawBody: bytes, contentType: file.type || "application/octet-stream", timeoutMs: 120000 });
  await request(`/v1/files/${upload.fileId}/complete`, { method: "POST", body: { checksum, byteCount: file.size }, timeoutMs: 120000 });
  return { id: upload.fileId, fileName: file.name, storageKey: upload.fileId, mediaType: file.type || "application/octet-stream", byteCount: file.size };
}
export async function fetchFileBlob(id, { signal } = {}) {
  const path = `/v1/files/${encodeURIComponent(id)}/content`;
  const fetchContent = () => fetch(apiURL(path), { headers: { Authorization: `Bearer ${state.accessToken}`, "X-Workspace-Client": "web" }, credentials: "omit", cache: "no-store", mode: "cors", signal });
  let response = await fetchContent();
  if (response.status === 401) { await refreshSession(); response = await fetchContent(); }
  if (!response.ok) {
    const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json().catch(() => ({})) : {};
    throw new APIError(response.status, payload);
  }
  return response.blob();
}
export async function downloadFile(id, fileName = "fichier") {
  const url = URL.createObjectURL(await fetchFileBlob(id));
  const link = document.createElement("a"); link.href = url; link.download = String(fileName || "fichier").replace(/[\\/\r\n]/g, "_");
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

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
export async function saveMailDraft(id, value) { return (await request(`/v1/mailbox/drafts/${id}`, { method: "PUT", body: value })).data; }
export async function previewMail(value) { return (await request("/v1/mailbox/style/preview", { method: "POST", body: value })).data; }
export async function cancelScheduledMail(id) { return (await request(`/v1/mailbox/${id}/cancel-schedule`, { method: "POST" })).data; }
export async function mailboxTemplates() { return (await request("/v1/mailbox/templates")).data; }
export async function saveMailboxTemplate(value) { return (await request("/v1/mailbox/templates", { method: "POST", body: value })).data; }
export async function deleteMailboxTemplate(id) { await request(`/v1/mailbox/templates/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export async function systemMailTemplates() { return (await request("/v1/mailbox/system-templates")).data; }
export async function previewSystemMailTemplate(key, draft, original = false) {
  return (await request(`/v1/mailbox/system-templates/${encodeURIComponent(key)}/preview`, { method: "POST", body: { ...draft, original } })).data;
}
export async function saveSystemMailTemplate(key, draft, expectedRevision) {
  return (await request(`/v1/mailbox/system-templates/${encodeURIComponent(key)}`, { method: "PUT", body: { ...draft, expectedRevision } })).data;
}
export async function restoreSystemMailTemplate(key, expectedRevision) {
  return (await request(`/v1/mailbox/system-templates/${encodeURIComponent(key)}`, { method: "DELETE", body: { expectedRevision } })).data;
}
export async function mailboxStyle() { return (await request("/v1/mailbox/style")).data; }
export async function saveMailboxStyle(value) { return (await request("/v1/mailbox/style", { method: "PUT", body: value })).data; }
export async function googleMailStatus() { return (await request("/v1/mailbox/google/status")).data; }
export async function connectGoogleMail() { return (await request("/v1/mailbox/google/connect", { method: "POST" })).data; }
export async function syncGoogleMail() { return (await request("/v1/mailbox/google/sync", { method: "POST" })).data; }
export async function disconnectGoogleMail() { return (await request("/v1/mailbox/google/connection", { method: "DELETE" })).data; }

export async function createConversation(value) { return (await request("/v1/conversations", { method: "POST", body: value })).data; }
export async function sendConversationMessage(conversationId, body, replyToMessageID = null, details = {}) {
  const { forwardedFromMessageID = null, ...messageDetails } = details;
  return (await request(`/v1/conversations/${conversationId}/messages`, { method: "POST", body: { message: { id: crypto.randomUUID(), body, time: "À l’instant", createdAt: new Date().toISOString(), ...messageDetails }, replyToMessageID, forwardedFromMessageID } })).data;
}
export async function markConversationRead(conversationId, lastReadMessageID = null) { return (await request(`/v1/conversations/${conversationId}/read`, { method: "PUT", body: { isRead: true, lastReadMessageID } })).data; }
export async function editConversationMessage(conversationId, messageId, body) { return (await request(`/v1/conversations/${conversationId}/messages/${messageId}`, { method: "PATCH", body: { body } })).data; }
export async function deleteConversationMessage(conversationId, messageId) { await request(`/v1/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }); }
export async function reactToConversationMessage(conversationId, messageId, emoji, active) { await request(`/v1/conversations/${conversationId}/messages/${messageId}/reaction`, { method: "PUT", body: { emoji, active } }); }
export async function flagConversationMessage(conversationId, messageId, flags) { await request(`/v1/conversations/${conversationId}/messages/${messageId}/flags`, { method: "PUT", body: flags }); }
export async function updateConversationPreferences(conversationId, preferences) { await request(`/v1/conversations/${conversationId}/preferences`, { method: "PUT", body: preferences }); }
export async function updateConversationDetails(conversationId, details) { return (await request(`/v1/conversations/${conversationId}`, { method: "PATCH", body: details })).data; }
export async function updateConversationParticipants(conversationId, participantIDs) { return (await request(`/v1/conversations/${conversationId}/participants`, { method: "PUT", body: { participantIDs } })).data; }
export async function deleteConversation(conversationId) { await request(`/v1/conversations/${conversationId}`, { method: "DELETE" }); }
export async function sendMessageProposal(conversationId, messageID, entityKind, entityID, recipientID) {
  return (await request(`/v1/conversations/${conversationId}/proposals`, {
    method: "POST", body: { messageID, entityKind, entityID, recipientID }
  })).data;
}
export async function decideMessageProposal(conversationId, messageID, decision) {
  return (await request(`/v1/conversations/${conversationId}/proposals/${messageID}/decision`, {
    method: "POST", body: { decision }
  })).data;
}

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
