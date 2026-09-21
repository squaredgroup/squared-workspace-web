import fs from "node:fs/promises";
await fs.access("dist/index.html");
await fs.rm("_site",{recursive:true,force:true});
await fs.cp("dist","_site",{recursive:true});
console.log("Site Vite préparé depuis dist, sans sources, workflows, tests ni documents internes.");
