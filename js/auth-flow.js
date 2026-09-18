const actions = { "/activation": "activation", "/reinitialisation": "reset", "/verification-email": "verify" };
export function parseAuthLocation(locationLike) {
  const params = new URLSearchParams(locationLike.search || "");
  const [fragmentPath, fragmentQuery = ""] = (locationLike.hash || "").replace(/^#/, "").split("?");
  const fragment = new URLSearchParams(fragmentQuery);
  const action = params.get("auth") || actions[locationLike.pathname?.replace(/\/$/, "")] || actions[fragmentPath] || "";
  return { action: ["activation", "reset", "verify"].includes(action) ? action : "", email: params.get("email") || fragment.get("email") || "", token: params.get("token") || fragment.get("token") || "" };
}
export const authContext = parseAuthLocation(window.location);
if (authContext.action) {
  // Keep credentials only in this page's memory, not in history, logs or referrers.
  history.replaceState(null, "", `/?auth=${authContext.action}`);
}
export function clearAuthContext() { authContext.action = ""; authContext.email = ""; authContext.token = ""; history.replaceState(null, "", "/"); }
