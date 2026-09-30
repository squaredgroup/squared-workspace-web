import fs from "node:fs/promises";
await fs.access("dist/index.html");
await fs.rm("_site",{recursive:true,force:true});
await fs.cp("dist","_site",{recursive:true});
await fs.mkdir("_site/assets/pdfjs",{recursive:true});
for(const name of ["pdf.mjs","pdf.worker.mjs"])
  await fs.copyFile(`node_modules/pdfjs-dist/build/${name}`,`_site/assets/pdfjs/${name}`);
console.log("Site Vite préparé depuis dist, sans sources, workflows, tests ni documents internes.");
