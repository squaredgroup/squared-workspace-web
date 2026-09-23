import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const root = join(process.cwd(), "_site");
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json" };
const server = createServer(async (request,response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = normalize(join(root, relative));
    if (!file.startsWith(root) || !(await stat(file)).isFile()) throw new Error("not found");
    response.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});response.end(await readFile(file));
  } catch { response.writeHead(404);response.end("Not found"); }
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const address=server.address();
if(!address||typeof address==="string")throw new Error("Serveur de test indisponible");
const origin=`http://127.0.0.1:${address.port}`;
const user={id:"a11y-user",firstName:"Test",lastName:"Accessibilité",email:"a11y@example.invalid",role:"OWNER",permissions:["readWorkspace","manageProjects","manageTasks","sendMessages"]};
const session={accessToken:"fixture-access",refreshToken:"fixture-refresh-token-long-enough",sessionId:"fixture",user};
const workspace={projects:[{id:"p1",title:"Projet accessible",status:"active"}],tasks:[],missions:[],validations:[],deliverables:[],notifications:[],conversations:[]};
const richBlock={id:"block-1",kind:"CALLOUT",text:"Une information importante publiée depuis Workspace.",tone:"INFO",presentation:"HIGHLIGHT",alignment:"LEADING",width:"STANDARD",size:"MEDIUM",marks:[{id:"mark-1",style:"BOLD",location:16,length:10,url:""}]};
const publicContent=path=>path.endsWith("/announcements")?{items:[{id:"announcement-1",data:{title:"Nouveauté Workspace",summary:"Le contenu enrichi est actif.",contentBlocks:[richBlock]}}]}:path.endsWith("/faqs")?{items:[{id:"faq-1",data:{title:"Comment fonctionne le contenu enrichi ?",question:"Comment fonctionne le contenu enrichi ?",body:"Réponse de secours.",contentBlocks:[richBlock]}}]}:{items:[]};
const payloadFor=path=>path==="/v1/auth/password"?session:path==="/v1/me"?user:path==="/v1/workspace"?workspace:path==="/v1/domain-data/catalog"?{kinds:[]}:path.includes("/v1/public/web-content/workspace-web/")?publicContent(path):{};
const violationSummary=violations=>violations.map(value=>`${value.id} (${value.nodes.length}) ${value.nodes.map(node=>node.target.join(" ")+": "+node.failureSummary).join(" | ")}`).join(", ");
async function audit(page,name){
  // Inspect the final rendered state, not an arbitrary frame of an opacity transition.
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
  });
  const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag22aa"]).analyze();
  await mkdir("output/playwright/accessibility",{recursive:true});
  await writeFile(`output/playwright/accessibility/${name}.json`,JSON.stringify({violations:result.violations,passes:result.passes.length},null,2));
  if(result.violations.length){await page.screenshot({path:`output/playwright/accessibility/${name}.png`,fullPage:true});throw new Error(`${name}: ${violationSummary(result.violations)}`);}
}

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:"block"});
  await context.route("https://workspace.squaredgroup.studio/**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payloadFor(new URL(route.request().url()).pathname))}));
  const page=await context.newPage();
  await page.goto(origin);
  await audit(page,"auth");
  await page.getByLabel("Adresse e-mail",{exact:true}).fill(user.email);
  await page.getByLabel("Mot de passe",{exact:true}).fill("FixturePassword123");
  await page.getByRole("button",{name:"Se connecter",exact:true}).click();
  await page.getByRole("heading",{name:"Tableau de bord",exact:true}).waitFor();
  await page.locator(".managed-rich-block.is-callout.presentation-highlight").first().waitFor();
  if(await page.locator(".managed-rich-block.is-callout.presentation-highlight strong",{hasText:"importante"}).count()<1)throw new Error("Le contenu enrichi public ne restitue pas le texte en gras.");
  await audit(page,"dashboard");
  await page.setViewportSize({width:390,height:844});
  for(const mode of ["dark","light"]){
    await page.evaluate(async mode=>{const m=await import('/js/store.js');m.setAppearance({mode,reducedMotion:true});},mode);
    for(const section of ["dashboard","tasks","notifications","spaces"]){
      await page.evaluate(async section=>{const m=await import('/js/store.js');m.setRoute(section);},section);
      await page.waitForFunction(()=>document.querySelector('#workspace-main')?.getAttribute('aria-busy')==='false');
      await audit(page,`mobile-${section}-${mode}`);
    }
  }
  console.log("Audits axe : connexion, tableau de bord et 8 états mobiles clair/sombre.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
