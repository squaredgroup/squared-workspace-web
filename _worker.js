const API_ORIGIN = "https://workspace.squaredgroup.studio";
const FORWARDED_PREFIX = "/api";
const ALLOWED_PATHS = [/^\/health$/, /^\/ready$/, /^\/\.well-known\/webauthn$/, /^\/v1(?:\/|$)/];
const REQUEST_HEADERS_TO_DROP = ["cookie", "host", "origin", "referer"];
const RESPONSE_HEADERS_TO_DROP = [
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-origin",
  "set-cookie"
];

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

function upstreamPath(url) {
  if (!url.pathname.startsWith(`${FORWARDED_PREFIX}/`)) return null;
  const path = url.pathname.slice(FORWARDED_PREFIX.length);
  return ALLOWED_PATHS.some(pattern => pattern.test(path)) ? path : null;
}

async function proxyAPI(request, url, path) {
  const target = new URL(`${path}${url.search}`, API_ORIGIN);
  const headers = new Headers(request.headers);
  for (const name of REQUEST_HEADERS_TO_DROP) headers.delete(name);
  headers.set("X-Workspace-Proxy", "cloudflare-pages");

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual"
    });
    if (upstream.status === 101) return upstream;

    const responseHeaders = new Headers(upstream.headers);
    for (const name of RESPONSE_HEADERS_TO_DROP) responseHeaders.delete(name);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return json({ error: "upstream_unavailable", message: "Le service Workspace est momentanément indisponible." }, 503, { "Retry-After": "10" });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = upstreamPath(url);
    if (path) return proxyAPI(request, url, path);
    if (url.pathname.startsWith(FORWARDED_PREFIX)) return json({ error: "not_found", message: "Route API inconnue." }, 404);
    return env.ASSETS.fetch(request);
  }
};
