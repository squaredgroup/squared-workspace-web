import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
const root=process.cwd();
async function walk(dir){const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);out.push(...(entry.isDirectory()?await walk(file):[file]));}return out;}
const jsFiles=(await walk(path.join(root,"js"))).filter(file=>file.endsWith(".js"));
const banned=[[".innerHTML","innerHTML interdit"],[".outerHTML","outerHTML interdit"],["insertAdjacentHTML","insertAdjacentHTML interdit"],["document.write","document.write interdit"],["eval(","eval interdit"],["new Function(","new Function interdit"]];
for(const file of jsFiles){const source=await fs.readFile(file,"utf8");for(const pair of banned)if(source.includes(pair[0]))throw new Error(path.relative(root,file)+": "+pair[1]);}
const index=await fs.readFile("index.html","utf8");
for(const required of ["Content-Security-Policy","class=\"skip-link\"","id=\"announcer\"","css/v3.css"])if(!index.includes(required))throw new Error("index.html: exigence manquante "+required);
const sw=await fs.readFile("sw.js","utf8");
if(!sw.includes("SKIP_WAITING"))throw new Error("Le service worker doit prendre en charge une activation explicite.");
if(/install[\s\S]{0,220}skipWaiting/.test(sw))throw new Error("Le service worker ne doit pas forcer skipWaiting pendant install.");
const cssFiles=["css/tokens.css","css/app.css","css/auth.css","css/v3.css"];
const criticalJs=["js/boot.js","js/app.js","js/api.js","js/session.js","js/storage.js","js/auth-flow.js","js/config.js","js/store.js","js/ui.js","js/webauthn.js","js/modules/auth.js"];
const gzipSize=async files=>{let total=0;for(const file of files)total+=zlib.gzipSync(await fs.readFile(file)).byteLength;return total};
const jsGzip=await gzipSize(criticalJs),cssGzip=await gzipSize(cssFiles);
if(jsGzip>75000)throw new Error("Budget JS initial dépassé: "+jsGzip+" octets gzip > 75000");
if(cssGzip>60000)throw new Error("Budget CSS dépassé: "+cssGzip+" octets gzip > 60000");
console.log("Budgets OK — JS initial gzip: "+jsGzip+" o ; CSS gzip: "+cssGzip+" o.");
