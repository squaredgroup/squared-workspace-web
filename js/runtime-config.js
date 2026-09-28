const workspaceOrigin = "https://workspace.squaredgroup.studio";
const directAPIHosts = new Set(["localhost", "127.0.0.1", "squaredgroup.github.io"]);

window.SQUARED_CONFIG = Object.freeze({
  // En production Cloudflare, les appels passent par le relais même origine /api.
  // Le backend reste accessible directement pour le développement et le miroir GitHub Pages.
  apiBaseUrl: directAPIHosts.has(location.hostname) ? workspaceOrigin : `${location.origin}/api`,
  webBaseUrl: location.origin,
  requestTimeoutMs: 20000
});
