import { h, button, field, input, icon, toast, errorMessage } from "../ui.js";
import { passwordLogin, passkeyOptions, verifyPasskey, verifyRecovery, activateAccount, requestPasswordReset, confirmPasswordReset, confirmEmailVerification, probeConnection } from "../api.js";
import { getPasskey, webauthnSupported } from "../webauthn.js";
import { authContext, clearAuthContext } from "../auth-flow.js";
import { setAppearance } from "../store.js";

let authFieldId = 0;

function authError(error) {
  if (error?.name === "NotAllowedError") return "Vérification annulée ou délai dépassé. Réessayez ou utilisez votre code de récupération.";
  if (error?.name === "SecurityError") return "La passkey n’est pas disponible sur cette adresse Web. Utilisez votre mot de passe et, si nécessaire, un code de récupération. Le serveur doit autoriser ce nouveau domaine.";
  return errorMessage(error);
}
function control(value, options = {}) {
  const element = input(value, { required: true, ...options });
  if (options.minLength) element.minLength = options.minLength;
  element.maxLength = options.maxLength || 200;
  return element;
}
function newPassword() {
  const element = control("", { name: "new-password", type: "password", autocomplete: "new-password", minLength: 10 });
  element.addEventListener("input", () => {
    element.setCustomValidity(element.value && (!/[a-z]/.test(element.value) || !/[A-Z]/.test(element.value) || !/\d/.test(element.value)) ? "Ajoutez une majuscule, une minuscule et un chiffre." : "");
  });
  return element;
}
const passwordHint = () => h("p", { class: "muted", text: "10 caractères minimum, avec une majuscule, une minuscule et un chiffre." });
const link = (text, onClick) => h("button", { class: "link-button", type: "button", text, onClick });
function authField(label, control, { iconName = "lock", trailing = null } = {}) {
  const id = control.id || `auth-control-${++authFieldId}`;
  control.id = id;
  return h("div", { class: "auth-field" },
    h("label", { for: id, text: label }),
    h("div", { class: "auth-control" }, icon(iconName, 17), control, trailing));
}
function passwordVisibility(control) {
  const toggle = h("button", { class: "auth-field-action", type: "button", "aria-label": "Afficher le mot de passe", title: "Afficher le mot de passe" }, icon("eyeOff", 17));
  toggle.addEventListener("click", () => {
    const reveal = control.type === "password";
    control.type = reveal ? "text" : "password";
    toggle.setAttribute("aria-label", reveal ? "Masquer le mot de passe" : "Afficher le mot de passe");
    toggle.title = reveal ? "Masquer le mot de passe" : "Afficher le mot de passe";
    toggle.setAttribute("aria-pressed", String(reveal));
    control.focus({ preventScroll: true });
  });
  return toggle;
}
function themeControl() {
  const control = h("button", { class: "auth-theme", type: "button" });
  const refresh = () => {
    const dark = document.documentElement.dataset.theme !== "light";
    control.replaceChildren(icon(dark ? "sun" : "moon", 16), h("span", { text: dark ? "Mode clair" : "Mode sombre" }));
    control.setAttribute("aria-label", dark ? "Activer le thème clair" : "Activer le thème sombre");
  };
  control.addEventListener("click", () => {
    setAppearance({ mode: document.documentElement.dataset.theme === "light" ? "dark" : "light" });
    refresh();
  });
  refresh();
  return control;
}
function show(panel, title, description, content, footer = null, notice = "") {
  const status = h("div", { class: "auth-status", role: "alert", "aria-live": "polite", text: notice });
  panel.replaceChildren(h("div", { class: "auth-box" },
    h("div", { class: "auth-card-kicker" }, h("span", { class: "auth-live-dot" }), "Identité sécurisée"),
    h("h2", { text: title }), h("p", { text: description }), content, status, footer));
  return status;
}
function busyForm(form, status, submitAction) {
  let busy = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    busy = true; status.textContent = "";
    const buttons = [...form.querySelectorAll("button")];
    const old = buttons.map(b => b.disabled);
    buttons.forEach(b => { b.disabled = true; }); form.setAttribute("aria-busy", "true");
    try { await submitAction(); } catch (error) { status.textContent = authError(error); }
    finally { buttons.forEach((b, i) => { b.disabled = old[i]; }); form.removeAttribute("aria-busy"); busy = false; }
  });
}
function back(panel, onAuthenticated) {
  return h("div", { class: "auth-secondary" }, link("Retour à la connexion", () => { clearAuthContext(); showLogin(panel, onAuthenticated); }));
}
export function renderAuth(onAuthenticated, { message = "", restoring = false } = {}) {
  const app = document.querySelector("#app");
  const stage = h("div", { class: "auth-stage" });
  const panel = h("section", { class: "auth-panel" },
    h("div", { class: "auth-panel-top" },
      h("div", { class: "auth-mobile-brand" }, h("img", { src: "/assets/squaredgroup-logo.png", alt: "" }), h("div", {}, h("strong", { text: "Squared Workspace" }), h("span", { text: "Executive operating system" }))),
      h("div", { class: "auth-panel-tools" }, h("div", { class: "auth-private" }, icon("lock", 14), h("span", { text: "Accès privé" })), themeControl())),
    stage,
    h("div", { class: "auth-panel-foot" }, h("span", { text: "Squared Group" }), h("span", { text: "Environnement sécurisé" })));
  const showGrid = !authContext.action || authContext.action === "activation";
  const visual = h("section", { class: "auth-visual" }, showGrid ? h("div", { class: "auth-grid" }) : null,
    h("div", { class: "auth-orb auth-orb-one" }), h("div", { class: "auth-orb auth-orb-two" }),
    h("div", { class: "auth-brand" }, h("img", { class: "auth-mark", src: "/assets/squaredgroup-logo.png", alt: "" }), h("div", {}, h("strong", { text: "Squared Workspace" }), h("span", { text: "Executive operating system" }))),
    h("div", { class: "auth-visual-copy" },
      h("div", { class: "auth-visual-status" }, h("span", { class: "auth-live-dot" }), "Espace opérationnel"),
      h("div", { class: "auth-kicker", text: "Le centre de commandement Squared" }),
      h("h1", {}, "Pilotez tout.", h("br"), h("span", { text: "Restez alignés." })),
      h("p", { text: "Projets, décisions, finances et communication réunis dans un environnement conçu pour faire avancer le groupe." }),
      h("div", { class: "auth-capabilities" },
        h("div", {}, icon("grid", 17), h("span", {}, h("strong", { text: "Vue unifiée" }), h("small", { text: "Toute l’activité au même endroit" }))),
        h("div", {}, icon("shield", 17), h("span", {}, h("strong", { text: "Accès maîtrisé" }), h("small", { text: "Permissions et sessions protégées" }))),
        h("div", {}, icon("sync", 17), h("span", {}, h("strong", { text: "Toujours synchronisé" }), h("small", { text: "Un espace commun, sur chaque appareil" })))))
  );
  app.replaceChildren(h("main", { id:"workspace-main", class: "auth-screen", tabindex:"-1" }, visual, panel));
  if (authContext.action === "activation") showActivation(stage, onAuthenticated);
  else if (authContext.action === "reset") showResetConfirm(stage, onAuthenticated);
  else if (authContext.action === "verify") showEmailVerification(stage, onAuthenticated);
  else showLogin(stage, onAuthenticated, message, restoring);
}
function showLogin(panel, onAuthenticated, message = "", restoring = false) {
  const email = control("", { name: "email", type: "email", autocomplete: "email", placeholder: "vous@squaredgroup.studio" });
  const password = control("", { name: "password", type: "password", autocomplete: "current-password" });
  const submit = button(restoring ? "Restauration de la session…" : "Se connecter", { kind: "primary", type: "submit", disabled: restoring });
  const form = h("form", { class: "form auth-login-form" }, authField("Adresse e-mail", email, { iconName: "mail" }), authField("Mot de passe", password, { iconName: "lock", trailing: passwordVisibility(password) }), submit);
  const footer = h("div", { class: "auth-secondary" }, link("Mot de passe oublié", () => showResetRequest(panel, onAuthenticated)), link("Activer un accès", () => showActivation(panel, onAuthenticated)));
  const status = show(panel, "Connexion", "Retrouvez votre espace de travail et reprenez là où vous vous étiez arrêté.", form, footer, message);
  if (restoring) { [...panel.querySelectorAll("input,button")].forEach(e => { e.disabled = true; }); return; }
  busyForm(form, status, async () => {
    const result = await passwordLogin(email.value.trim(), password.value);
    password.value = "";
    if (result?.mfaRequired) return showMFA(panel, result, email.value.trim(), onAuthenticated);
    clearAuthContext(); await onAuthenticated();
  });
  if (webauthnSupported()) {
    const passkey = button("Utiliser une passkey", { iconName: "key", onClick: async () => {
      status.textContent = ""; passkey.disabled = true; submit.disabled = true;
      try {
        if (!email.reportValidity()) return;
        const challenge = await passkeyOptions(email.value.trim());
        await verifyPasskey(challenge.challengeId, await getPasskey(challenge.publicKey));
        clearAuthContext(); await onAuthenticated();
      } catch (error) { status.textContent = authError(error); }
      finally { passkey.disabled = false; submit.disabled = false; }
    } });
    form.append(passkey);
  }
  const diagnostic = link("Vérifier la connexion au serveur", async () => {
    diagnostic.disabled = true; status.textContent = "Vérification de la connexion…";
    try { status.textContent = await probeConnection(); } catch (error) { status.textContent = authError(error); }
    finally { diagnostic.disabled = false; }
  });
  panel.querySelector(".auth-box").append(
    h("div", { class: "auth-trust" }, icon("shield", 16), h("div", {}, h("strong", { text: "Connexion protégée" }), h("span", { text: "Votre session reste privée et chiffrée." }))),
    h("div", { class: "auth-diagnostic" }, h("span", {}, h("i", { class: "auth-live-dot" }), "Services Workspace"), diagnostic));
}
function showMFA(panel, challenge, email, onAuthenticated) {
  const code = control("", { name: "recovery-code", autocomplete: "one-time-code", placeholder: "Code de récupération", minLength: 8, maxLength: 40 });
  const form = h("form", { class: "form" }, field("Code de récupération", code), button("Valider le code", { kind: "primary", type: "submit" }));
  const status = show(panel, "Vérification renforcée", `Une seconde vérification est requise pour ${email}.`, form, back(panel, onAuthenticated));
  busyForm(form, status, async () => { await verifyRecovery(challenge.challengeId, code.value.trim()); code.value = ""; clearAuthContext(); await onAuthenticated(); });
  if (webauthnSupported()) {
    const passkey = button("Valider avec ma passkey", { iconName: "key", onClick: async () => {
      passkey.disabled = true; status.textContent = "";
      try { await verifyPasskey(challenge.challengeId, await getPasskey(challenge.publicKey)); clearAuthContext(); await onAuthenticated(); }
      catch (error) { status.textContent = authError(error); }
      finally { passkey.disabled = false; }
    } });
    form.before(passkey, h("p", { class: "muted", text: "Ou utilisez l’un des codes de récupération remis à l’activation de votre sécurité renforcée." }));
  }
}
function showActivation(panel, onAuthenticated) {
  const first = control("", { name: "first-name", autocomplete: "given-name", minLength: 2, maxLength: 80 });
  const last = control("", { name: "last-name", autocomplete: "family-name", minLength: 2, maxLength: 80 });
  const email = control(authContext.email, { name: "email", type: "email", autocomplete: "email" });
  const token = control(authContext.token, { name: "invitation", autocomplete: "off", minLength: 12 });
  const password = newPassword();
  const terms = h("input", { type: "checkbox", required: true, name: "accepts-terms" });
  const form = h("form", { class: "form" }, h("div", { class: "form-row" }, field("Prénom", first), field("Nom", last)), field("Adresse e-mail", email), field("Code d’invitation", token), field("Mot de passe", password), passwordHint(),
    h("label", { class: "auth-terms" }, terms, "J’accepte les conditions d’utilisation de Squared Workspace."), button("Activer mon espace", { kind: "primary", type: "submit" }));
  const status = show(panel, "Activer votre accès", "Finalisez l’invitation reçue par e-mail.", form, back(panel, onAuthenticated));
  busyForm(form, status, async () => {
    await activateAccount({ firstName: first.value.trim(), lastName: last.value.trim(), email: email.value.trim(), password: password.value, token: token.value.trim(), acceptsTerms: terms.checked, termsVersion: "2026-09" });
    clearAuthContext(); password.value = ""; token.value = ""; await onAuthenticated();
  });
}
function showResetRequest(panel, onAuthenticated) {
  const email = control("", { name: "email", type: "email", autocomplete: "email" });
  const form = h("form", { class: "form" }, field("Adresse e-mail", email), button("Envoyer le lien", { kind: "primary", type: "submit" }));
  const status = show(panel, "Mot de passe oublié", "Indiquez l’adresse liée à votre compte.", form, back(panel, onAuthenticated));
  busyForm(form, status, async () => {
    await requestPasswordReset(email.value.trim()); authContext.email = email.value.trim();
    show(panel, "Consultez votre messagerie", "Si ce compte existe, un lien de réinitialisation a été envoyé. Pensez à vérifier les courriers indésirables.", button("Saisir un code reçu", { onClick: () => showResetConfirm(panel, onAuthenticated) }), back(panel, onAuthenticated));
  });
}
function showResetConfirm(panel, onAuthenticated) {
  const email = control(authContext.email, { name: "email", type: "email", autocomplete: "email" });
  const token = control(authContext.token, { name: "reset-token", minLength: 20 });
  const password = newPassword();
  const form = h("form", { class: "form" }, field("Adresse e-mail", email), field("Code reçu", token), field("Nouveau mot de passe", password), passwordHint(), button("Mettre à jour", { kind: "primary", type: "submit" }));
  const status = show(panel, "Nouveau mot de passe", "Utilisez votre lien de réinitialisation ou le code reçu.", form, back(panel, onAuthenticated));
  busyForm(form, status, async () => {
    await confirmPasswordReset(email.value.trim(), token.value.trim(), password.value); clearAuthContext(); password.value = ""; token.value = "";
    toast("Mot de passe mis à jour."); showLogin(panel, onAuthenticated);
  });
}
function showEmailVerification(panel, onAuthenticated) {
  const email = control(authContext.email, { name: "email", type: "email", autocomplete: "email" });
  const token = control(authContext.token, { name: "verification-token", minLength: 20 });
  const form = h("form", { class: "form" }, field("Adresse e-mail", email), field("Code de vérification", token), button("Vérifier mon adresse", { kind: "primary", type: "submit" }));
  const status = show(panel, "Vérifier votre adresse", "Confirmez cette adresse pour sécuriser votre compte.", form, back(panel, onAuthenticated));
  busyForm(form, status, async () => {
    await confirmEmailVerification(email.value.trim(), token.value.trim()); clearAuthContext(); token.value = "";
    toast("Adresse e-mail vérifiée."); showLogin(panel, onAuthenticated);
  });
}
