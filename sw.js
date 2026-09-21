const PREFIX = "squared-workspace-";
const CACHE = `${PREFIX}workspace-v7-2-greeting-emoji`;
const BUILD_ASSETS = []; // @vite-assets
const APP_SHELL = [
  "/", "/index.html", "/manifest.webmanifest", "/assets/squaredgroup-logo.png", "/assets/appicon-256.png", "/assets/appicon-512.png",
  ...BUILD_ASSETS
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
async function networkFirst(request,path){
  try{
    const response=await fetch(request);
    if(response.ok){const copy=response.clone();await caches.open(CACHE).then(cache=>cache.put(path,copy))}
    return response;
  }catch{return await caches.match(path)||new Response("Ressource hors ligne",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})}
}
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith("/v1/")||url.pathname==="/health"||url.pathname==="/ready")return;
  if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put("/index.html",copy)))}return response}).catch(()=>caches.match("/index.html").then(hit=>hit||new Response("Workspace est hors ligne.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))));return}
  if(url.pathname.startsWith("/js/")){event.respondWith(networkFirst(event.request,url.pathname));return}
  const allowed=APP_SHELL.includes(url.pathname)||url.pathname.startsWith("/assets/");if(!allowed)return;
  event.respondWith(caches.match(url.pathname).then(async hit=>{if(hit)return hit;try{const response=await fetch(event.request);if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)))}return response}catch{return new Response("Ressource hors ligne",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})}}));
});
