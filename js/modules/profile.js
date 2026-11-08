import { canAccessSection } from '../config.js';
import { state,setAppearance,setRoute } from "../store.js";
import { updateMe,loadSecurity,updateSecurity,changePassword,listSessions,revokeSession,loadSettings,saveSettings,createPasskeyOptions,registerPasskey } from "../api.js";
import { createPasskey } from "../webauthn.js";
import { profilePhotoControl } from "../profile-photo.js";
import { h,icon,pageHeader,card,button,field,input,select,validateControls,toast,errorMessage,row,emptyState,modal,confirmAction,badge,advancedEditor,profileAvatar,roleLabel } from "../ui.js";

function settingRow(title,copy,control){control.setAttribute("aria-label",title);return h("label",{class:"setting-row"},h("div",{},h("strong",{text:title}),h("span",{text:copy})),control)}
export async function renderProfile(){
  const u=state.user||{},root=h("div",{class:"sq-profile-page"});
  root.append(pageHeader({eyebrow:"Compte",title:"Profil",subtitle:"Identité, coordonnées et sécurité de votre compte Squared Workspace."}));
  const overview=h("div",{class:"studio-profile-overview"});
  const refreshIdentity=()=>overview.replaceChildren(profileAvatar(state.user,{size:64,ariaHidden:true}),h("div",{},h("strong",{text:`${state.user?.firstName||state.user?.first_name||""} ${state.user?.lastName||state.user?.last_name||""}`.trim()||"Mon compte"}),h("p",{text:[state.user?.email,state.user?.company].filter(Boolean).join(" · ")}),badge(roleLabel(state.user?.role))));
  refreshIdentity();root.append(overview);
  const email=input(u.email||"",{type:"email",required:true,autocomplete:"email"}),first=input(u.firstName||u.first_name||"",{required:true,autocomplete:"given-name"}),last=input(u.lastName||u.last_name||"",{required:true,autocomplete:"family-name"}),title=input(u.title||"",{autocomplete:"organization-title"}),company=input(u.company||"",{autocomplete:"organization"}),phone=input(u.phone||"",{type:"tel",autocomplete:"tel"});
  const identity=h("div",{class:"form"},profilePhotoControl(u,{onChange:refreshIdentity}),h("div",{class:"form-row"},field("Prénom",first),field("Nom",last)),field("Adresse e-mail",email),h("div",{class:"form-row"},field("Fonction",title),field("Entreprise",company)),field("Téléphone",phone),button("Enregistrer le profil",{kind:"primary",iconName:"check",onClick:async()=>{try{if(!validateControls(email,first,last))return;await updateMe({email:email.value.trim(),firstName:first.value.trim(),lastName:last.value.trim(),title:title.value.trim(),company:company.value.trim(),phone:phone.value.trim(),phoneCountryCode:u.phoneCountryCode||u.phone_country_code||"FR"});refreshIdentity();toast("Profil mis à jour")}catch(error){toast(errorMessage(error),"error")}}}));
  root.append(h("div",{class:"grid two"},
    card("Identité",`${roleLabel(u.role)} · informations visibles selon votre périmètre.`,identity,{iconName:"user"}),
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
        settingRow("Authentification multifacteur","Exige une passkey après le mot de passe lors de la connexion.",mfa),
        settingRow("Alertes de connexion","Signale les nouvelles connexions selon la politique de votre compte.",alerts)
      ),
      h("p",{class:"muted",text:"Pour utiliser la MFA sur ce site, ajoutez une passkey depuis ce navigateur avant de l’activer."}),
      h("div",{class:"card-actions"},
        button("Enregistrer",{kind:"primary",iconName:"check",onClick:async()=>{try{sec=await updateSecurity({multiFactorEnabled:mfa.checked,loginAlertsEnabled:alerts.checked});toast("Sécurité mise à jour")}catch(error){toast(errorMessage(error),"error")}}}),
        button("Ajouter une passkey pour ce site",{iconName:"key",onClick:async()=>{try{const challenge=await createPasskeyOptions();const response=await createPasskey(challenge.publicKey);await registerPasskey(challenge.challengeId,response,`Web · ${navigator.platform||"Navigateur"}`);toast("Passkey enregistrée")}catch(error){toast(errorMessage(error),"error",6000)}}}),
        button("Changer le mot de passe",{onClick:passwordModal})
      )
    );
  }catch(error){host.append(emptyState("Sécurité indisponible",errorMessage(error),"warning"))}
  return card("Sécurité","Passkeys et authentification multifacteur.",host,{iconName:"shield"});
}
function passwordModal(){
  const current=input("",{type:"password",autocomplete:"current-password",required:true}),next=input("",{type:"password",autocomplete:"new-password",required:true,minLength:10});
  modal({title:"Changer le mot de passe",content:h("div",{class:"form"},field("Mot de passe actuel",current),field("Nouveau mot de passe",next,"10 caractères minimum avec majuscule, minuscule et chiffre.")),actions:[{label:"Modifier",kind:"primary",icon:"check",onClick:async close=>{try{if(!validateControls(current,next))return;await changePassword(current.value,next.value);current.value="";next.value="";toast("Mot de passe modifié. Reconnectez-vous sur vos autres appareils.");close()}catch(error){toast(errorMessage(error),"error")}}}]});
}
const SETTINGS_DESTINATIONS=[
  ["Compte","Profil, identité et appareils","user","profile"],
  ["Notifications","Canaux, alertes et synthèses","notification","notifications"],
  ["Apparence","Thème, couleurs et interface","sparkles","settings","appearance"],
  ["Organisation","Identité et règles de l’espace","company","businessUnits"],
  ["Sécurité","Connexion, MFA, passkeys et sessions","shield","profile"],
  ["Intégrations","Connexions de service et CMS","grid","siteSystem"],
  ["Messagerie","Boîte mail, modèles et identité","mail","mailbox"],
  ["Données & stockage","Exports, reprise et conservation","archive","settings","data"],
  ["Membres & accès","Rôles, invitations et ressources humaines","users","team","members"],
  ["Confidentialité","Données personnelles et demandes","lock","settings","privacy"],
  ["Accessibilité","Mouvement, contraste et densité","eyeOff","settings","accessibility"],
  ["Tableau de bord","Pilotage et indicateurs","chart","dashboard"],
  ["Projets & missions","Portefeuille et règles de production","folder","projects","workspace"],
  ["Tâches","Exécution et priorités","check","tasks"],
  ["Calendrier","Agendas et rendez-vous","calendar","planning","calendar"],
  ["Fichiers","Documents, versions et ressources","document","documents"],
  ["Pôles & entités","Structure du groupe","company","businessUnits"],
  ["Workflows","Validations et circuits métier","sync","validations"],
  ["People & RH","Profils et développement","users","people"],
  ["Automatisations","Scénarios, exécutions et erreurs","sync","automations"],
  ["Données & conformité","Gouvernance et obligations","shield","governance"],
  ["Appareils & serveurs","Sessions, parc et infrastructure","cloud","securityOperations"],
  ["Activité & historique","Actions et journal d’audit","clock","activity"],
  ["Support","Demandes et incidents","phone","support"]
];

function settingsDirectory(){
  return h("section",{class:"settings-directory","aria-label":"Rubriques des paramètres"},...SETTINGS_DESTINATIONS.filter(([, , ,section])=>canAccessSection(section,state.user)).map(([title,copy,iconName,section,subpage])=>h("button",{type:"button",class:"settings-destination",onClick:()=>setRoute(section,subpage||"")},h("span",{class:"settings-destination-icon"},icon(iconName,18)),h("span",{},h("strong",{text:title}),h("small",{text:copy})),icon("ChevronRight",14))));
}

export async function renderSettings(subpage=""){
  const root=h("div",{class:"settings-page"});const directory=settingsDirectory();directory.classList.add("sq-settings-nav");const pane=h("div",{class:"sq-settings-content"}),layout=h("div",{class:"sq-settings-layout"},directory,pane);root.append(pageHeader({eyebrow:"Workspace",title:"Paramètres",subtitle:"Compte, expérience, accès, données et opérations.",actions:[button("Préférences complètes",{iconName:"sliders",onClick:async()=>{const{openOperation}=await import("../native/workflows.js");return openOperation("put_settings",{context:await loadSettings()});}})]}),layout);
  try{
    let settings=await loadSettings();
    const densityValue=String(settings.dashboardDensity||"balanced").toLowerCase().replace("équilibrée","balanced").replace("aérée","airy").replace("dense","dense");
    const theme=select(settings.appearanceMode==="light"?"light":"dark",[{value:"light",label:"Clair"},{value:"dark",label:"Sombre"}]);
    const density=select(densityValue,[{value:"airy",label:"Aérée"},{value:"balanced",label:"Équilibrée"},{value:"dense",label:"Dense"}]);
    const width=select(settings.contentWidth||"balanced",[{value:"focused",label:"Concentrée"},{value:"balanced",label:"Équilibrée"},{value:"wide",label:"Large"}]);
    const language=input(settings.language||"fr-FR"),timezone=input(settings.timezone||"Europe/Paris");
    const compact=h("input",{type:"checkbox",checked:Boolean(settings.compactSidebar)}),motion=h("input",{type:"checkbox",checked:Boolean(settings.reducedMotion)});
    const preview=()=>setAppearance({mode:theme.value,density:density.value,contentWidth:width.value,compactSidebar:compact.checked,reducedMotion:motion.checked});
    [theme,density,width,compact,motion].forEach(control=>control.addEventListener("change",preview));
    const experience=h("div",{class:"form"},
      h("div",{class:"form-row"},field("Thème",theme),field("Densité",density)),
      h("div",{class:"form-row"},field("Largeur du contenu",width),field("Langue",language)),
      field("Fuseau horaire",timezone),
      h("div",{class:"setting-list"},settingRow("Sidebar compacte","Réduit la largeur de la navigation sur les grands écrans.",compact),settingRow("Réduire les animations","Limite les transitions et mouvements de l’interface.",motion)),
      button("Enregistrer les paramètres",{kind:"primary",iconName:"check",onClick:async()=>{
        try{
          settings={...settings,appearanceMode:theme.value,dashboardDensity:density.value,contentWidth:width.value,language:language.value,timezone:timezone.value,compactSidebar:compact.checked,reducedMotion:motion.checked};
          await saveSettings(settings);
          preview();
          toast("Paramètres enregistrés");
        }catch(error){toast(errorMessage(error),"error",6000)}
      }})
    );
    pane.append(h("div",{class:"grid"},card("Apparence & expérience","Ces réglages s’appliquent immédiatement à la version Web.",experience,{iconName:"settings"}),await sessionsCard()));
  }catch(error){root.append(emptyState("Paramètres indisponibles",errorMessage(error),"warning"))}
  return root;
}
async function sessionsCard(){
  const host=h("div");
  try{
    const sessions=await listSessions();
    host.append(...(sessions.length?sessions.map(session=>{let entry;entry=row({
      title:session.device_name||"Appareil",
      subtitle:session.platform||"",
      status:session.id===state.sessionId?"active":"session",
      meta:new Date(session.last_seen_at||session.created_at).toLocaleString("fr-FR"),
      actions:[session.id!==state.sessionId?button("Révoquer",{small:true,kind:"ghost",onClick:()=>confirmAction({title:"Révoquer cette session ?",message:"Cet appareil devra se reconnecter à Squared Workspace.",confirmLabel:"Révoquer",danger:true,onConfirm:async()=>{await revokeSession(session.id);entry.remove();if(!host.children.length)host.append(emptyState("Aucune session","Aucune session active supplémentaire."));toast("Session révoquée")}})}):null].filter(Boolean)
    });return entry;}):[emptyState("Aucune session","Aucune session active supplémentaire.")]));
  }catch(error){host.append(emptyState("Sessions indisponibles",errorMessage(error),"warning"))}
  return card("Sessions actives","Contrôlez les navigateurs et appareils actuellement autorisés.",host,{iconName:"lock"});
}
