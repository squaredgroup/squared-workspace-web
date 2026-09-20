const root = document.querySelector("#app");
function failure(error) {
  console.error("Squared Workspace startup", error?.name || "Error");
  const page = document.createElement("main"); page.className = "sq-boot";
  const card = document.createElement("section"); card.className = "sq-boot-card";
  const title = document.createElement("h1"); title.textContent = "Impossible de démarrer Workspace";
  const copy = document.createElement("p"); copy.textContent = "Une ressource n’a pas pu être chargée. Rechargez cette page pour récupérer la dernière version.";
  const retry = document.createElement("button"); retry.textContent = "Recharger";
  retry.addEventListener("click", async () => {
    if ("serviceWorker" in navigator) { try { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); } catch { /* offline */ } }
    location.reload();
  });
  card.append(title, copy, retry); page.append(card); root.replaceChildren(page);
}
import("./app.js?v=20260920-workspace-v4").catch(failure);
