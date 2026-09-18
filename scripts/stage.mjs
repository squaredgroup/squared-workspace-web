import fs from "node:fs/promises";
await fs.rm("_site",{recursive:true,force:true});await fs.mkdir("_site");
for(const name of ["index.html","404.html","CNAME",".nojekyll","manifest.webmanifest","sw.js","assets","css","js"]){
  await fs.cp(name,`_site/${name}`,{recursive:true});
}
console.log("Site préparé sans workflows, scripts de déploiement, tests ni documents internes.");
