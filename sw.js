const PREFIX = "squared-workspace-github-pages-";
const CACHE = `${PREFIX}workspace-v5-auth-experience`;
const APP_SHELL = [
  "/index.html", "/manifest.webmanifest", "/css/tokens.css", "/css/app.css", "/css/auth.css", "/css/v3.css", "/css/v4.css",
  "/js/runtime-config.js", "/js/boot.js", "/js/app.js", "/js/api.js", "/js/session.js", "/js/storage.js", "/js/auth-flow.js",
  "/js/config.js", "/js/store.js", "/js/ui.js", "/js/webauthn.js",
  "/js/modules/auth.js", "/js/modules/dashboard.js", "/js/modules/data.js", "/js/modules/publication.js",
  "/js/modules/cms.js", "/js/modules/mailbox.js", "/js/modules/messages.js", "/js/modules/training.js",
  "/js/modules/profile.js", "/js/modules/people.js", "/js/modules/newsletter.js", "/js/modules/security.js", "/js/modules/team.js", "/js/modules/notifications.js",
  "/assets/squaredgroup-logo.png", "/assets/appicon-256.png", "/assets/appicon-512.png"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith("/v1/")||url.pathname==="/health"||url.pathname==="/ready")return;
  if(event.request.mode==="navigate"){if(url.pathname!=="/"&&url.pathname!=="/index.html")return;event.respondWith(fetch(event.request).catch(()=>caches.match("/index.html").then(hit=>hit||new Response("Workspace est hors ligne.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))));return}
  const allowed=APP_SHELL.includes(url.pathname)||/^\/assets\/icons\/Iconly[A-Za-z0-9]+\.svg$/.test(url.pathname);if(!allowed)return;
  event.respondWith(caches.match(url.pathname).then(async hit=>{if(hit)return hit;try{const response=await fetch(event.request);if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)))}return response}catch{return new Response("Ressource hors ligne",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})}}));
});
