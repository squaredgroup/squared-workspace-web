import { state,setAppearance } from "../store.js";
import { updateMe,loadSecurity,updateSecurity,changePassword,listSessions,revokeSession,loadSettings,saveSettings,recoveryCodes,createPasskeyOptions,registerPasskey } from "../api.js";
import { createPasskey } from "../webauthn.js";
import { h,pageHeader,card,button,field,input,select,validateControls,toast,errorMessage,row,emptyState,modal,confirmAction,badge,advancedEditor } from "../ui.js";

function settingRow(title,copy,control){return h("div",{class:"setting-row"},h("div",{},h("strong",{text:title}),h("span",{text:copy})),control)}
export async function renderProfile(){
  const u=state.user||{},root=h("div");
  root.append(pageHeader({eyebrow:"Compte",title:"Profil",subtitle:"Identité, coordonnées et sécurité de votre compte Squared Workspace."}));
  const email=input(u.email||"",{type:"email",required:true,autocomplete:"email"}),first=input(u.firstName||u.first_name||"",{required:true,autocomplete:"given-name"}),last=input(u.lastName||u.last_name||"",{required:true,autocomplete:"family-name"}),title=input(u.title||"",{autocomplete:"organization-title"}),company=input(u.company||"",{autocomplete:"organization"}),phone=input(u.phone||"",{type:"tel",autocomplete:"tel"});
  const identity=h("div",{class:"form"},h("div",{class:"form-row"},field("Prénom",first),field("Nom",last)),field("Adresse e-mail",email),h("div",{class:"form-row"},field("Fonction",title),field("Entreprise",company)),field("Téléphone",phone),button("Enregistrer le profil",{kind:"primary",iconName:"check",onClick:async()=>{try{if(!validateControls(email,first,last))return;await updateMe({email:email.value.trim(),firstName:first.value.trim(),lastName:last.value.trim(),title:title.value.trim(),company:company.value.trim(),phone:phone.value.trim(),phoneCountryCode:u.phoneCountryCode||u.phone_country_code||"FR"});toast("Profil mis à jour")}catch(error){toast(errorMessage(error),"error")}}}));
  root.append(h("div",{class:"grid two"},
    card("Identité",`${u.role||"Membre"} · informations visibles selon votre périmètre.`,identity,{iconName:"user"}),
    await securityCard()
  ));
  return root;
}
async function securityCard(){
  const host=h("div",{class:"stack"});
  try{
    let sec=await loadSecurity();
    const mfa=h("input",{type:"checkbox",checked:Boolean(sec.multiFactorEnabled)}),alerts=h("input",{type:"checkbox",checked:Boolean(sec.loginAlertsEnabled)});
    host.append(
      h("div",{class:"setting-list"},
        settingRow("Authentification multifacteur","Exige une seconde vérification lors des connexions sensibles.",mfa),
        settingRow("Alertes de connexion","Signale les nouvelles connexions selon la politique de votre compte.",alerts)
      ),
      h("div",{class:"card-actions"},
        button("Enregistrer",{kind:"primary",iconName:"check",onClick:async()=>{try{sec=await updateSecurity({multiFactorEnabled:mfa.checked,loginAlertsEnabled:alerts.checked});toast("Sécurité mise à jour")}catch(error){toast(errorMessage(error),"error")}}}),
        button("Ajouter une passkey",{iconName:"key",onClick:async()=>{try{const challenge=await createPasskeyOptions();const response=await createPasskey(challenge.publicKey);await registerPasskey(challenge.challengeId,response,`Web · ${navigator.platform||"Navigateur"}`);toast("Passkey enregistrée")}catch(error){toast(errorMessage(error),"error",6000)}}}),
        button("Changer le mot de passe",{onClick:passwordModal})
      ),
      button("Générer de nouveaux codes de récupération",{kind:"ghost",iconName:"shield",onClick:async()=>{
        try{
          const data=await recoveryCodes(),codes=data.codes||data.recoveryCodes||data;
          const list=Array.isArray(codes)?codes:[];
          modal({title:"Codes de récupération",content:h("div",{class:"stack"},h("p",{class:"page-subtitle",text:"Conservez ces codes dans un endroit sûr. Un code utilisé ne doit pas être réutilisé."}),list.length?h("div",{class:"recovery-grid"},...list.map(code=>h("code",{text:String(code)}))):advancedEditor("Réponse serveur",h("pre",{class:"json-view",text:JSON.stringify(data,null,2)})))});
        }catch(error){toast(errorMessage(error),"error")}
      }})
    );
  }catch(error){host.append(emptyState("Sécurité indisponible",errorMessage(error),"warning"))}
  return card("Sécurité","Passkeys, MFA et récupération du compte.",host,{iconName:"shield"});
}
function passwordModal(){
  const current=input("",{type:"password",autocomplete:"current-password",required:true}),next=input("",{type:"password",autocomplete:"new-password",required:true,minLength:10});
  modal({title:"Changer le mot de passe",content:h("div",{class:"form"},field("Mot de passe actuel",current),field("Nouveau mot de passe",next,"10 caractères minimum avec majuscule, minuscule et chiffre.")),actions:[{label:"Modifier",kind:"primary",icon:"check",onClick:async close=>{try{if(!validateControls(current,next))return;await changePassword(current.value,next.value);current.value="";next.value="";toast("Mot de passe modifié. Reconnectez-vous sur vos autres appareils.");close()}catch(error){toast(errorMessage(error),"error")}}}]});
}
export async function renderSettings(){
  const root=h("div");root.append(pageHeader({eyebrow:"Workspace",title:"Paramètres",subtitle:"Préférences synchronisées et réglages d’affichage du navigateur."}));
  try{
    let settings=await loadSettings();
    const densityValue=String(settings.dashboardDensity||"balanced").toLowerCase().replace("équilibrée","balanced").replace("aérée","airy").replace("dense","dense");
    const theme=select(settings.appearanceMode||"dark",[{value:"system",label:"Système"},{value:"dark",label:"Sombre"},{value:"light",label:"Clair"}]);
    const density=select(densityValue,[{value:"airy",label:"Aérée"},{value:"balanced",label:"Équilibrée"},{value:"dense",label:"Dense"}]);
    const width=select(settings.contentWidth||"balanced",[{value:"focused",label:"Concentrée"},{value:"balanced",label:"Équilibrée"},{value:"wide",label:"Large"}]);
    const language=input(settings.language||"fr-FR"),timezone=input(settings.timezone||"Europe/Paris");
    const compact=h("input",{type:"checkbox",checked:Boolean(settings.compactSidebar)}),motion=h("input",{type:"checkbox",checked:Boolean(settings.reducedMotion)});
    const experience=h("div",{class:"form"},
      h("div",{class:"form-row"},field("Thème",theme),field("Densité",density)),
      h("div",{class:"form-row"},field("Largeur du contenu",width),field("Langue",language)),
      field("Fuseau horaire",timezone),
      h("div",{class:"setting-list"},settingRow("Sidebar compacte","Réduit la largeur de la navigation sur les grands écrans.",compact),settingRow("Réduire les animations","Limite les transitions et mouvements de l’interface.",motion)),
      button("Enregistrer les paramètres",{kind:"primary",iconName:"check",onClick:async()=>{
        try{
          settings={...settings,appearanceMode:theme.value,dashboardDensity:density.value,contentWidth:width.value,language:language.value,timezone:timezone.value,compactSidebar:compact.checked,reducedMotion:motion.checked};
          await saveSettings(settings);
          setAppearance({mode:theme.value,density:density.value,contentWidth:width.value,compactSidebar:compact.checked,reducedMotion:motion.checked});
          toast("Paramètres enregistrés");
        }catch(error){toast(errorMessage(error),"error",6000)}
      }})
    );
    root.append(card("Apparence & expérience","Ces réglages s’appliquent immédiatement à la version Web.",experience,{iconName:"settings"}),await sessionsCard());
  }catch(error){root.append(emptyState("Paramètres indisponibles",errorMessage(error),"warning"))}
  return root;
}
async function sessionsCard(){
  const host=h("div");
  try{
    const sessions=await listSessions();
    host.append(...(sessions.length?sessions.map(session=>row({
      title:session.device_name||"Appareil",
      subtitle:session.platform||"",
      status:session.id===state.sessionId?"active":"session",
      meta:new Date(session.last_seen_at||session.created_at).toLocaleString("fr-FR"),
      actions:[session.id!==state.sessionId?button("Révoquer",{small:true,kind:"ghost",onClick:()=>confirmAction({title:"Révoquer cette session ?",message:"Cet appareil devra se reconnecter à Squared Workspace.",confirmLabel:"Révoquer",danger:true,onConfirm:async()=>{await revokeSession(session.id);toast("Session révoquée")}})}):null].filter(Boolean)
    })):[emptyState("Aucune session","Aucune session active supplémentaire.")]));
  }catch(error){host.append(emptyState("Sessions indisponibles",errorMessage(error),"warning"))}
  return card("Sessions actives","Contrôlez les navigateurs et appareils actuellement autorisés.",host,{iconName:"lock"});
}
