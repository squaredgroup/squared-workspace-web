const PREFIX = "squared-workspace-";
const RELEASE = "__SQUARED_RELEASE__";
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>{event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)).map(key=>caches.delete(key)));
  await self.clients.claim();
  const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  await Promise.all(windows.map(client=>client.navigate(client.url).catch(()=>null)));
})())});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
