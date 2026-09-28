import test from "node:test";
import assert from "node:assert/strict";
import worker from "../_worker.js";

test("le relais envoie les routes Workspace autorisées vers le backend", async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let received;
  globalThis.fetch = async (url, init) => {
    received = { url: String(url), init };
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  };

  const response = await worker.fetch(new Request("https://workspace.app.squaredgroup.studio/api/health", {
    headers: { Origin: "https://workspace.app.squaredgroup.studio", Cookie: "private=1" }
  }), { ASSETS: { fetch: () => assert.fail("Le contenu statique ne doit pas être utilisé") } });

  assert.equal(received.url, "https://workspace.squaredgroup.studio/health");
  assert.equal(received.init.headers.get("origin"), null);
  assert.equal(received.init.headers.get("cookie"), null);
  assert.equal(received.init.headers.get("x-workspace-proxy"), "cloudflare-pages");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("le relais conserve méthode, corps, authentification et paramètres", async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let received;
  globalThis.fetch = async (url, init) => {
    received = { url: String(url), init, body: await new Response(init.body).text() };
    return new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401, headers: { "Content-Type": "application/json" } });
  };

  const response = await worker.fetch(new Request("https://workspace.app.squaredgroup.studio/api/v1/auth/password?source=web", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test", "X-Workspace-Client": "web" },
    body: JSON.stringify({ email: "test@example.invalid" })
  }), { ASSETS: { fetch: () => assert.fail("Le contenu statique ne doit pas être utilisé") } });

  assert.equal(received.url, "https://workspace.squaredgroup.studio/v1/auth/password?source=web");
  assert.equal(received.init.method, "POST");
  assert.equal(received.init.headers.get("authorization"), "Bearer test");
  assert.equal(received.init.headers.get("x-workspace-client"), "web");
  assert.deepEqual(JSON.parse(received.body), { email: "test@example.invalid" });
  assert.equal(response.status, 401);
});

test("le relais refuse les chemins hors périmètre et délègue les pages", async () => {
  const assets = { fetch: async () => new Response("site", { status: 200 }) };
  const refused = await worker.fetch(new Request("https://workspace.app.squaredgroup.studio/api/admin"), { ASSETS: assets });
  const page = await worker.fetch(new Request("https://workspace.app.squaredgroup.studio/connexion"), { ASSETS: assets });
  assert.equal(refused.status, 404);
  assert.equal(await page.text(), "site");
});
