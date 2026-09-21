import type { AsyncState } from "./types";

export const workspaceVersion = "7.0.0";

export const stateCopy: Record<AsyncState, { title: string; description: string }> = {
  idle: { title: "Prêt", description: "Workspace est prêt à recevoir vos actions." },
  loading: { title: "Chargement", description: "Nous synchronisons les dernières données." },
  success: { title: "À jour", description: "Les informations sont synchronisées." },
  empty: { title: "Aucun élément", description: "Créez un premier élément pour commencer." },
  error: { title: "Action impossible", description: "Réessayez ou vérifiez votre connexion." }
};

export function applyProductMetadata(): void {
  document.documentElement.dataset.workspaceVersion = workspaceVersion;
  document.documentElement.classList.add("supports-v7");
}
