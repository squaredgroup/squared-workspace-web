const CACHE = "squared-workspace-github-pages-v1";
const APP_SHELL = [
  "/", "/index.html", "/manifest.webmanifest", "/css/tokens.css", "/css/app.css",
  "/js/runtime-config.js", "/js/app.js", "/js/api.js", "/js/config.js", "/js/store.js", "/js/ui.js", "/js/webauthn.js",
  "/js/modules/auth.js", "/js/modules/dashboard.js", "/js/modules/data.js", "/js/modules/publication.js",
  "/js/modules/cms.js", "/js/modules/mailbox.js", "/js/modules/messages.js", "/js/modules/training.js",
  "/js/modules/profile.js", "/js/modules/people.js", "/js/modules/newsletter.js", "/js/modules/security.js", "/js/modules/team.js",
  "/assets/squaredgroup-logo.png", "/assets/appicon-256.png", "/assets/appicon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/v1/") || url.pathname === "/health" || url.pathname === "/ready") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return caches.match("/index.html");
    throw new Error("offline");
  }));
});
