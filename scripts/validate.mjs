import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
const root=process.cwd();
async function walk(dir){const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);out.push(...(entry.isDirectory()?await walk(p):[p]));}return out;}
const paths=(await walk(path.join(root,"js"))).filter(p=>p.endsWith(".js"));
const modules=new Map();
async function getModule(file){if(!modules.has(file))modules.set(file,new vm.SourceTextModule(await fs.readFile(file,"utf8"),{identifier:file}));return modules.get(file);}
async function linker(specifier,from){if(!specifier.startsWith("."))throw new Error(`Import externe inattendu: ${specifier}`);const resolved=path.resolve(path.dirname(from.identifier),specifier);if(!resolved.startsWith(root+path.sep))throw new Error("Import hors du projet");return getModule(resolved);}
for(const p of paths){const module=await getModule(p);if(module.status==="unlinked")await module.link(linker);}
const sw=spawnSync(process.execPath,["--check","sw.js"],{stdio:"inherit"});if(sw.status!==0)process.exit(1);
const manifest=JSON.parse(await fs.readFile("manifest.webmanifest","utf8"));
for(const icon of manifest.icons||[])await fs.access(path.join(root,icon.src.replace(/^\//,"")));
const swSource=await fs.readFile("sw.js","utf8");for(const match of swSource.matchAll(/"(\/(?:js|css|assets)\/[^"*]+\.(?:js|css|png))"/g))await fs.access(path.join(root,match[1].slice(1)));
const config=await fs.readFile("js/config.js","utf8");const iconBlock=config.split("export const ICONS = {")[1].split("};")[0];
for(const match of iconBlock.matchAll(/:\s*"([A-Za-z0-9]+)"/g))await fs.access(path.join(root,`assets/icons/IconlyRegular${match[1]}.svg`));
console.log(`${paths.length} modules JavaScript liés, ressources, manifest et service worker validés.`);
