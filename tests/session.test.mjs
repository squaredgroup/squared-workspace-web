import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
async function harness(fetchImpl,options={}){
 const local=memory(),session=memory();
 if(options.preferences)local.setItem('sq-web-appearance',options.preferences);
 if(options.legacy)local.setItem('sq-workspace-web-refresh',options.legacy);
 const location=new URL('https://workspace.app.squaredgroup.studio'+(options.route||'/'));
 const window=Object.assign(new EventTarget(),{localStorage:local,sessionStorage:session,location,SQUARED_CONFIG:{apiBaseUrl:'https://workspace.squaredgroup.studio'}});
 if(options.blockStorage)for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw Error('blocked')}});
 const context=vm.createContext({window,location,history:{replaceState:(_a,_b,value)=>{window.historyPath=value},pushState(){}},navigator:{onLine:true},document:{documentElement:{dataset:{},style:{setProperty(){}}}},URL,URLSearchParams,AbortController,CustomEvent,Response,setTimeout,clearTimeout,console,fetch:fetchImpl});
 const cache=new Map();
 async function get(file){if(!cache.has(file))cache.set(file,new vm.SourceTextModule(await fs.readFile(file,'utf8'),{context,identifier:file}));return cache.get(file);}
 async function linker(spec,from){return get(path.resolve(path.dirname(from.identifier),spec));}
 const entry=await get(path.join(root,'js/session.js'));await entry.link(linker);await entry.evaluate();
 const state=cache.get(path.join(root,'js/store.js')).namespace.state;
 return {api:entry.namespace,state,window,local,session,context,async auth(){const m=await get(path.join(root,'js/auth-flow.js'));await m.link(linker);await m.evaluate();return m.namespace;}};
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const envelope={accessToken:'fresh',refreshToken:'refresh-secret-0123456789',sessionId:'s',user:{id:'1'}};
test('persistent refresh token is migrated to tab-only storage',async()=>{const h=await harness(()=>{}, {legacy:'legacy-secret'});assert.equal(h.local.getItem('sq-workspace-web-refresh'),null);assert.equal(h.session.getItem('sq-workspace-web-refresh'),'legacy-secret');});
test('blocked storage and malformed appearance do not crash state',async()=>{for(const opts of [{blockStorage:true},{preferences:'{broken'}]){const h=await harness(()=>{},opts);h.api.setSession(envelope);assert.equal(h.state.accessToken,'fresh');}});
test('empty and malformed routes are safe',async()=>{for(const route of ['/','/#/tasks/%ZZ']){const h=await harness(()=>{},{route});assert.ok(h.state.route.section);}});
test('login token never goes to localStorage',async()=>{const h=await harness(()=>{});h.api.setSession(envelope);assert.equal(h.local.getItem('sq-workspace-web-refresh'),null);assert.equal(h.session.getItem('sq-workspace-web-refresh'),envelope.refreshToken);});
test('concurrent 401s trigger a single refresh',async()=>{let refreshes=0;const h=await harness(async(url,opts)=>{if(url.endsWith('/auth/refresh')){refreshes++;await new Promise(r=>setTimeout(r,10));return json(envelope);}return opts.headers.Authorization==='Bearer old'?json({error:'unauthorized'},401):json({ok:true});});h.api.setSession({...envelope,accessToken:'old'});await Promise.all([h.api.request('/v1/me'),h.api.request('/v1/workspace')]);assert.equal(refreshes,1);assert.equal(h.state.accessToken,'fresh');});
test('network failure does not discard refresh session',async()=>{const h=await harness(async()=>{throw TypeError('network')});h.api.setSession(envelope);await assert.rejects(h.api.refreshSession(),e=>e.code==='network');assert.equal(h.session.getItem('sq-workspace-web-refresh'),envelope.refreshToken);});
test('invalid refresh removes private state and emits session-ended',async()=>{const h=await harness(async()=>json({error:'invalid_refresh_token'},401));h.api.setSession(envelope);h.state.workspace={secret:true};let ended=0;h.window.addEventListener('sq:session-ended',()=>ended++);await assert.rejects(h.api.refreshSession());assert.equal(h.state.workspace,null);assert.equal(h.session.getItem('sq-workspace-web-refresh'),null);assert.equal(ended,1);});
test('late refresh cannot reopen a closed session',async()=>{let finish;const h=await harness(()=>new Promise(r=>{finish=r}));h.api.setSession(envelope);const pending=h.api.refreshSession();h.api.clearSession('logout');finish(json(envelope));await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(h.state.accessToken,null);});
test('logout clears private state immediately and uses existing credentials for revocation',async()=>{let sent;const h=await harness(async(url,options)=>{sent=options.headers.Authorization;return new Response(null,{status:204})});h.api.setSession(envelope);h.state.workspace={secret:true};await h.api.logout();assert.equal(h.state.workspace,null);assert.equal(sent,'Bearer fresh');});
test('request times out instead of hanging',async()=>{const h=await harness((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})))));await assert.rejects(h.api.request('/health',{auth:false,timeoutMs:100}),e=>e.code==='timeout');});
test('unexpected HTML is not accepted as authenticated JSON',async()=>{const h=await harness(async()=>new Response('<html>not API</html>',{headers:{'content-type':'text/html'}}));await assert.rejects(h.api.request('/health',{auth:false}),e=>e.status===502);});
test('401 login errors do not refresh or erase another session',async()=>{let calls=0;const h=await harness(async()=>{calls++;return json({error:'invalid_credentials'},401)});await assert.rejects(h.api.request('/v1/auth/password',{auth:false,method:'POST',body:{email:'test',password:'test'}}),e=>e.message.includes('incorrect'));assert.equal(calls,1);});
test('all public auth links keep tokens only in memory',async()=>{for(const url of ['/activation?email=a%40b.fr&token=secret','/#/activation?email=a%40b.fr&token=secret','/reinitialisation?token=secret','/verification-email?token=secret']){const h=await harness(()=>{},{route:url});const a=await h.auth();assert.equal(a.authContext.token,'secret');assert.ok(!h.window.historyPath.includes('secret'));}});
