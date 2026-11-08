import { sessionEpoch } from '../session.js';
import { state } from '../store.js';
import { apiURL } from '../config.js';
import { refreshSession,APIError } from '../api.js';
import { scope,downloadBlob } from './components.js';
export async function call(path,{method='GET',body,rawBody,headers={},signal,timeoutMs=120000,download=false,responseType,operationID}={}){
 if(!/^\/v1\//.test(path)||path.includes('://'))throw new Error('Cette adresse ne fait pas partie de Workspace.');
 if(!state.accessToken)throw new Error('Reconnectez-vous à Workspace.');
 const actor=scope(),epoch=sessionEpoch(),controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});
 const revision=[state.workspaceEtag,state.workspaceCommandEtag].filter(v=>/^"\d+"$/.test(v||'')).sort((a,b)=>Number(b.slice(1,-1))-Number(a.slice(1,-1)))[0]||'"0"';
 const send=()=>fetch(apiURL(path),{method,credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json','X-Workspace-Client':'web',Authorization:`Bearer ${state.accessToken}`,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'If-Match':revision}:{}),...(operationID?{'X-Workspace-Operation':operationID}:{}),...headers},body:body!==undefined?JSON.stringify(body):rawBody});
 try{
  let response=await send();if(response.status===401){await refreshSession();if(scope()!==actor||sessionEpoch()!==epoch)throw new Error('Le compte a changé. Rouvrez la page.');response=await send();}
  if(scope()!==actor||sessionEpoch()!==epoch)throw new Error('Le compte a changé. Rouvrez la page.');
  const type=response.headers.get('content-type')||'';let payload;
  if(type.includes('json')&&(!response.ok||responseType!=='blob'))payload=await response.json();
  if(scope()!==actor||sessionEpoch()!==epoch)throw new Error('Le compte a changé. Rouvrez la page.');
  if(!response.ok)throw new APIError(response.status,payload||{});
  const etag=response.headers.get('etag');if(method!=='GET'&&/^"\d+"$/.test(etag||''))state.workspaceCommandEtag=etag;
  if((responseType==='blob'||!type.includes('json'))&&![204,304].includes(response.status)){
   const blob=await response.blob();if(scope()!==actor||sessionEpoch()!==epoch)throw new Error('Le compte a changé.');const disposition=response.headers.get('content-disposition')||'',match=disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)/i);let name='export';try{name=decodeURIComponent(match?.[1]||match?.[2]||path.split('/').at(-1)||'export');}catch{}
   name=name.replace(/[\\/\u0000-\u001f]/g,'-').slice(0,160);if(download)downloadBlob(blob,name);return {blob,fileName:name,contentType:type};
  }
  return payload&&Array.isArray(payload.records)&&Object.hasOwn(payload,'data')?(payload.records.length?{...payload.data,records:payload.records}:payload.data):payload;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function pages(path,{key='items',cursorKey='nextCursor',signal}={}){
 const all=[],visited=new Set();let cursor;
 do{const separator=path.includes('?')?'&':'?',data=await call(path+(cursor?separator+'cursor='+encodeURIComponent(cursor):''),{signal});const items=Array.isArray(data)?data:data?.[key]||[];if(!Array.isArray(items))throw new Error('La liste reçue est incomplète.');all.push(...items);cursor=data?.[cursorKey]||null;if(cursor&&visited.has(cursor))throw new Error('La liste ne progresse plus. Actualisez avant de poursuivre.');if(cursor)visited.add(cursor);}while(cursor);
 return all.filter((r,i,rows)=>!r.id||rows.findIndex(v=>v.id===r.id)===i);
}
