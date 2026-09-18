import { h, button, field, input, toast, errorMessage, icon } from "../ui.js";
import { passwordLogin, passkeyOptions, verifyPasskey, verifyRecovery, activateAccount, requestPasswordReset, confirmPasswordReset, confirmEmailVerification } from "../api.js";
import { getPasskey, webauthnSupported } from "../webauthn.js";

export function renderAuth(onAuthenticated){
  const app=document.querySelector("#app"); app.replaceChildren();
  const visual=h("section",{class:"auth-visual"},h("div",{class:"auth-grid"}),h("img",{class:"auth-mark",src:"/assets/squaredgroup-logo.png",alt:"Squared Group"}),h("div",{class:"auth-visual-copy"},h("div",{class:"auth-kicker",text:"Squared Executive Workspace"}),h("h1",{text:"Tout le groupe. Un seul système."}),h("p",{text:"Projets, finance, clients, opérations, contenus et décisions dans un espace conçu pour garder Squared Group aligné, traçable et rapide."})));
  const panel=h("section",{class:"auth-panel"});
  app.append(h("main",{class:"auth-screen"},visual,panel));
  const params=new URLSearchParams(location.search);
  const action=params.get("auth") || (location.pathname==="/reinitialisation"?"reset":location.pathname==="/verification-email"?"verify":"");
  if(action==="activation") showActivation(panel,onAuthenticated);
  else if(action==="reset") showResetConfirm(panel,params.get("email")||"",onAuthenticated,params.get("token")||"");
  else if(action==="verify") showEmailVerification(panel,onAuthenticated,params.get("email")||"",params.get("token")||"");
  else showLogin(panel,onAuthenticated);
}

function showLogin(panel,onAuthenticated){
  const status=h("div",{class:"auth-status"});
  const email=input("",{type:"email",autocomplete:"email",placeholder:"vous@squaredgroup.studio"});
  const password=input("",{type:"password",autocomplete:"current-password",placeholder:"••••••••••"});
  const form=h("form",{class:"form",onSubmit:async e=>{e.preventDefault();status.textContent="";submit.disabled=true;try{const result=await passwordLogin(email.value.trim(),password.value);if(result?.mfaRequired){showMFA(panel,result,email.value,onAuthenticated);return;}await onAuthenticated();}catch(error){status.textContent=errorMessage(error)}finally{submit.disabled=false}}},field("Adresse e-mail",email),field("Mot de passe",password));
  const submit=button("Se connecter",{kind:"primary",iconName:"send",type:"submit"}); submit.style.width="100%"; form.append(submit);
  if(webauthnSupported()) form.append(button("Utiliser une passkey",{iconName:"key",onClick:async()=>{status.textContent="";try{const challenge=await passkeyOptions(email.value.trim());const response=await getPasskey(challenge.publicKey);await verifyPasskey(challenge.challengeId,response);await onAuthenticated();}catch(error){status.textContent=errorMessage(error)}}}));
  panel.replaceChildren(h("div",{class:"auth-box"},h("h2",{text:"Connexion"}),h("p",{text:"Accédez à votre espace Squared Workspace sécurisé."}),form,status,h("div",{class:"auth-secondary"},buttonLink("Mot de passe oublié",()=>showResetRequest(panel,onAuthenticated)),buttonLink("Activer un accès",()=>showActivation(panel,onAuthenticated)))));
}

function showMFA(panel,challenge,email,onAuthenticated){
  const status=h("div",{class:"auth-status"});
  const recovery=input("",{placeholder:"XXXX-XXXX-XXXX",autocomplete:"one-time-code"});
  const box=h("div",{class:"auth-box"},h("h2",{text:"Vérification renforcée"}),h("p",{text:`Une seconde vérification est requise pour ${email}.`}),status);
  if(webauthnSupported()) box.append(button("Valider avec ma passkey",{kind:"primary",iconName:"key",onClick:async()=>{try{const response=await getPasskey(challenge.publicKey);await verifyPasskey(challenge.challengeId,response);await onAuthenticated();}catch(error){status.textContent=errorMessage(error)}}}));
  box.append(h("div",{style:{height:"14px"}}),field("Code de récupération",recovery),h("div",{style:{height:"8px"}}),button("Utiliser ce code",{onClick:async()=>{try{await verifyRecovery(challenge.challengeId,recovery.value);await onAuthenticated();}catch(error){status.textContent=errorMessage(error)}}}),h("div",{class:"auth-secondary"},buttonLink("Retour",()=>showLogin(panel,onAuthenticated))));
  panel.replaceChildren(box);
}

function showActivation(panel,onAuthenticated){
  const params=new URLSearchParams(location.search); const status=h("div",{class:"auth-status"});
  const first=input("",{autocomplete:"given-name"}),last=input("",{autocomplete:"family-name"}),email=input(params.get("email")||"",{type:"email",autocomplete:"email"}),token=input(params.get("token")||"",{placeholder:"Code d’invitation"}),password=input("",{type:"password",autocomplete:"new-password"});
  const terms=h("input",{type:"checkbox",required:true});
  const form=h("form",{class:"form",onSubmit:async e=>{e.preventDefault();status.textContent="";try{await activateAccount({firstName:first.value,lastName:last.value,email:email.value,password:password.value,token:token.value,acceptsTerms:true,termsVersion:"2026-09"});await onAuthenticated();}catch(error){status.textContent=errorMessage(error)}}},h("div",{class:"form-row"},field("Prénom",first),field("Nom",last)),field("Adresse e-mail",email),field("Code d’invitation",token),field("Mot de passe",password),h("label",{style:{display:"flex",gap:"9px",alignItems:"center",fontSize:"10px",color:"var(--sq-muted)"}},terms,"J’accepte les conditions d’utilisation de Squared Workspace."),button("Activer mon espace",{kind:"primary",type:"submit"}));
  panel.replaceChildren(h("div",{class:"auth-box"},h("h2",{text:"Activer votre accès"}),h("p",{text:"Finalisez l’invitation reçue par e-mail pour créer votre espace sécurisé."}),form,status,h("div",{class:"auth-secondary"},buttonLink("Retour à la connexion",()=>showLogin(panel,onAuthenticated)))));
}

function showResetRequest(panel,onAuthenticated){
  const email=input("",{type:"email",autocomplete:"email"}); const status=h("div",{class:"auth-status"});
  const send=async()=>{try{await requestPasswordReset(email.value);toast("Si ce compte existe, un lien de réinitialisation vient d’être envoyé.");showResetConfirm(panel,email.value,onAuthenticated);}catch(error){status.textContent=errorMessage(error)}};
  panel.replaceChildren(h("div",{class:"auth-box"},h("h2",{text:"Réinitialiser le mot de passe"}),h("p",{text:"Indiquez l’adresse liée à votre compte."}),h("div",{class:"form"},field("Adresse e-mail",email),button("Envoyer le lien",{kind:"primary",onClick:send})),status,h("div",{class:"auth-secondary"},buttonLink("Retour",()=>showLogin(panel,onAuthenticated)))));
}
function showResetConfirm(panel,defaultEmail,onAuthenticated,defaultToken=""){
  const email=input(defaultEmail||"",{type:"email"}),token=input(defaultToken||"",{placeholder:"Jeton reçu"}),password=input("",{type:"password",autocomplete:"new-password"}),status=h("div",{class:"auth-status"});
  panel.replaceChildren(h("div",{class:"auth-box"},h("h2",{text:"Nouveau mot de passe"}),h("p",{text:"Collez le jeton reçu et choisissez un nouveau mot de passe."}),h("div",{class:"form"},field("Adresse e-mail",email),field("Jeton",token),field("Nouveau mot de passe",password),button("Mettre à jour",{kind:"primary",onClick:async()=>{try{await confirmPasswordReset(email.value,token.value,password.value);toast("Mot de passe mis à jour.");showLogin(panel,onAuthenticated);}catch(error){status.textContent=errorMessage(error)}}})),status));
}
function showEmailVerification(panel,onAuthenticated,emailValue,tokenValue){
  const status=h("div",{class:"auth-status"});
  const email=input(emailValue||"",{type:"email",autocomplete:"email"});
  const token=input(tokenValue||"",{placeholder:"Jeton de vérification"});
  const verify=async()=>{status.textContent="";try{await confirmEmailVerification(email.value.trim(),token.value.trim());toast("Adresse e-mail vérifiée.");history.replaceState({},"","/");showLogin(panel,onAuthenticated)}catch(error){status.textContent=errorMessage(error)}};
  panel.replaceChildren(h("div",{class:"auth-box"},h("h2",{text:"Vérifier votre adresse"}),h("p",{text:"Confirmez que cette adresse e-mail vous appartient afin de sécuriser votre profil Workspace."}),h("div",{class:"form"},field("Adresse e-mail",email),field("Jeton",token),button("Vérifier mon adresse",{kind:"primary",iconName:"check",onClick:verify})),status,h("div",{class:"auth-secondary"},buttonLink("Retour à la connexion",()=>{history.replaceState({},"","/");showLogin(panel,onAuthenticated)}))));
  if(emailValue&&tokenValue) setTimeout(verify,30);
}

function buttonLink(label,onClick){ return h("button",{class:"link-button",type:"button",onClick,text:label}); }
