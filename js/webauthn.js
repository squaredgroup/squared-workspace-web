function b64urlToBytes(value){
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw = atob(base64); return Uint8Array.from(raw, c=>c.charCodeAt(0));
}
function bytesToB64url(value){
  if(value == null) return null;
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : (ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value));
  let raw=""; for(const byte of bytes) raw+=String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
export function webauthnSupported(){ return Boolean(window.PublicKeyCredential && navigator.credentials); }
export function normalizeRequestOptions(publicKey){
  const result={...publicKey,challenge:b64urlToBytes(publicKey.challenge)};
  if(publicKey.allowCredentials) result.allowCredentials=publicKey.allowCredentials.map(c=>({...c,id:b64urlToBytes(c.id)}));
  return result;
}
export function normalizeCreationOptions(publicKey){
  const result={...publicKey,challenge:b64urlToBytes(publicKey.challenge),user:{...publicKey.user,id:b64urlToBytes(publicKey.user.id)}};
  if(publicKey.excludeCredentials) result.excludeCredentials=publicKey.excludeCredentials.map(c=>({...c,id:b64urlToBytes(c.id)}));
  return result;
}
export function serializeAuthenticationCredential(credential){
  return {
    id:credential.id, rawId:bytesToB64url(credential.rawId), type:credential.type,
    response:{
      clientDataJSON:bytesToB64url(credential.response.clientDataJSON),
      authenticatorData:bytesToB64url(credential.response.authenticatorData),
      signature:bytesToB64url(credential.response.signature),
      userHandle:credential.response.userHandle?bytesToB64url(credential.response.userHandle):null
    },
    clientExtensionResults:credential.getClientExtensionResults(),
    authenticatorAttachment:credential.authenticatorAttachment || undefined
  };
}
export function serializeRegistrationCredential(credential){
  return {
    id:credential.id, rawId:bytesToB64url(credential.rawId), type:credential.type,
    response:{
      clientDataJSON:bytesToB64url(credential.response.clientDataJSON),
      attestationObject:bytesToB64url(credential.response.attestationObject),
      transports:credential.response.getTransports?credential.response.getTransports():[]
    },
    clientExtensionResults:credential.getClientExtensionResults(), authenticatorAttachment:credential.authenticatorAttachment || undefined
  };
}
export async function getPasskey(publicKey){
  const credential=await navigator.credentials.get({publicKey:normalizeRequestOptions(publicKey)});
  if(!credential) throw new Error("Aucune passkey reçue.");
  return serializeAuthenticationCredential(credential);
}
export async function createPasskey(publicKey){
  const credential=await navigator.credentials.create({publicKey:normalizeCreationOptions(publicKey)});
  if(!credential) throw new Error("Aucune passkey créée.");
  return serializeRegistrationCredential(credential);
}
