import { state } from "../store.js";
import { loadWorkspace,listInvitations,createInvitation,resendInvitation,revokeInvitation,changeMemberRole,changeMemberState,listCustomRoles,assignCustomRole,effectiveMemberAccess,memberSessions,revokeAdminSession } from "../api.js";
import { h,pageHeader,card,row,button,modal,field,input,select,validateControls,toast,errorMessage,emptyState,formatDate,confirmAction,statCard,advancedEditor,pretty } from "../ui.js";

const ROLES=["OWNER","ADMIN","COLLABORATOR","PARTNER","CLIENT"];
const has=permission=>state.user?.permissions?.includes(permission);
const memberName=member=>member.name||`${member.firstName||member.first_name||""} ${member.lastName||member.last_name||""}`.trim()||member.email||"Membre";
function inviteDialog(reload){
  const email=input("",{type:"email",required:true,placeholder:"nom@entreprise.com"}),role=select("COLLABORATOR",ROLES);
  modal({title:"Inviter dans Workspace",content:h("div",{class:"form"},field("Adresse e-mail",email),field("Rôle socle",role),h("p",{class:"muted",text:"L’invitation expire après 7 jours. Vous pourrez ensuite affiner le rôle métier et le périmètre du membre."})),actions:[{label:"Envoyer l’invitation",kind:"primary",icon:"send",onClick:async close=>{
    try{if(!validateControls(email,role))return;await createInvitation({email:email.value.trim(),role:role.value,customRoleIds:[],scopeType:null,scopeId:null,permissions:[],accessExpiresAt:null});toast("Invitation envoyée");close();await reload()}
    catch(error){toast(errorMessage(error),"error",6500)}
  }}]});
}
function accessView(value){
  const permissions=value?.permissions||value?.effectivePermissions||[];
  const scopes=value?.scopes||value?.effectiveScopes||[];
  return h("div",{class:"stack"},
    h("div",{class:"grid two"},
      card("Permissions",`${permissions.length} droit${permissions.length>1?"s":""} effectif${permissions.length>1?"s":""}.`,permissions.length?h("div",{class:"chip-list"},...permissions.map(permission=>h("span",{class:"chip",text:pretty(permission)}))):emptyState("Aucune permission","Aucun droit spécifique n’est exposé.","shield")),
      card("Périmètres",`${scopes.length} périmètre${scopes.length>1?"s":""}.`,scopes.length?h("div",{class:"chip-list"},...scopes.map(scope=>h("span",{class:"chip",text:typeof scope==="string"?scope:(scope.name||scope.id||pretty(scope.type))}))):emptyState("Périmètre global","Aucun périmètre détaillé n’est exposé.","grid"))
    ),
    advancedEditor("Réponse technique",h("pre",{class:"json-view",text:JSON.stringify(value,null,2)}))
  );
}
function memberDialog(member,customRoles,reload){
  const role=select(member.role||"COLLABORATOR",ROLES),custom=select(member.customRoleId||"",[{value:"",label:"Aucun rôle métier"},...customRoles.map(item=>({value:item.id,label:item.name}))]);
  const content=h("div",{class:"form"},h("div",{class:"detail-list"},
    h("div",{class:"detail-row"},h("span",{text:"Membre"}),h("strong",{text:memberName(member)})),
    h("div",{class:"detail-row"},h("span",{text:"E-mail"}),h("strong",{text:member.email||"—"}))
  ),field("Rôle socle",role),field("Rôle métier principal",custom));
  const actions=[];
  if(has("manageAccess"))actions.push({label:"Enregistrer les rôles",kind:"primary",icon:"check",onClick:async close=>{
    try{if(role.value!==member.role)await changeMemberRole(member.id,role.value);await assignCustomRole(member.id,custom.value||null);toast("Accès du membre mis à jour");close();await loadWorkspace();await reload()}
    catch(error){toast(errorMessage(error),"error",6500)}
  }});
  if(has("manageAccess"))actions.push({label:"Accès effectif",icon:"key",onClick:async()=>{try{const value=await effectiveMemberAccess(member.id);modal({title:`Accès · ${memberName(member)}`,content:accessView(value),wide:true})}catch(error){toast(errorMessage(error),"error")}}});
  if(has("manageTeam"))actions.push({label:"Sessions",icon:"user",onClick:async()=>{
    try{
      const sessions=await memberSessions(member.id);
      const host=sessions.length?h("div",{class:"list"},...sessions.map(session=>row({
        title:session.device_name||"Appareil",subtitle:session.platform||"",status:"active",meta:formatDate(session.last_seen_at||session.created_at),
        actions:[state.user?.role==="OWNER"||state.user?.role==="ADMIN"?button("Révoquer",{small:true,kind:"ghost",onClick:()=>confirmAction({title:"Révoquer cette session ?",message:"Cet appareil devra se reconnecter.",confirmLabel:"Révoquer",danger:true,onConfirm:async()=>{try{await revokeAdminSession(session.id);toast("Session révoquée")}catch(error){toast(errorMessage(error),"error")}}})}):null].filter(Boolean)
      }))):emptyState("Aucune session","Aucune session active pour ce membre.");
      modal({title:`Sessions · ${memberName(member)}`,content:host,wide:true});
    }catch(error){toast(errorMessage(error),"error")}
  }});
  modal({title:"Membre & accès",content,actions,wide:true});
}
export async function renderTeam(subpage="members"){
  if(subpage!=="members")return null;
  const root=h("div");root.append(pageHeader({eyebrow:"Administration",title:"Équipe",subtitle:"Membres, rôles, invitations et sessions de Squared Workspace."}));
  try{
    await loadWorkspace();
    const members=state.workspace?.team||[];let invitations=[],customRoles=[];
    if(has("manageAccess"))[invitations,customRoles]=await Promise.all([listInvitations().catch(()=>state.workspace?.enterprise?.invitations||[]),listCustomRoles().catch(()=>state.workspace?.enterprise?.customRoles||[])]);
    const activeInvitations=invitations.filter(inv=>!(inv.accepted_at||inv.acceptedAt||inv.revoked_at||inv.revokedAt)&&new Date(inv.expires_at||inv.expiresAt)>new Date()).length;
    root.append(h("div",{class:"grid stats"},
      statCard("Membres",members.length,"Visible dans votre périmètre","users"),
      statCard("Invitations",activeInvitations,"En attente","mail"),
      statCard("Rôles métier",customRoles.length,"Rôles personnalisés","key"),
      statCard("Votre rôle",1,state.user?.role||"Workspace","shield")
    ));
    const body=h("div",{class:"grid two section-gap"});root.append(body);
    const reload=async()=>{const next=await renderTeam("members");root.replaceChildren(...next.childNodes)};
    const membersHost=members.length?h("div",{class:"list"},...members.map(member=>row({
      title:memberName(member),
      subtitle:[member.title,member.email].filter(Boolean).join(" · "),
      status:member.role,
      meta:member.availability||"",
      actions:[
        button("Gérer",{small:true,iconName:"settings",onClick:()=>memberDialog(member,customRoles,reload)}),
        has("manageTeam")&&member.id!==state.user?.id?button(member.isActive===false?"Réactiver":"Désactiver",{small:true,kind:"ghost",iconName:"lock",onClick:()=>confirmAction({title:member.isActive===false?"Réactiver ce membre ?":"Désactiver ce membre ?",message:`${memberName(member)} ${member.isActive===false?"retrouvera":"perdra"} l’accès selon les politiques Workspace.`,confirmLabel:member.isActive===false?"Réactiver":"Désactiver",danger:member.isActive!==false,onConfirm:async()=>{try{await changeMemberState(member.id,member.isActive===false);toast(member.isActive===false?"Membre réactivé":"Membre désactivé");await loadWorkspace();await reload()}catch(error){toast(errorMessage(error),"error")}}})}):null
      ].filter(Boolean)
    }))):emptyState("Aucun membre","Aucun membre visible dans votre périmètre.");
    body.append(card("Membres",`${members.length} membre${members.length>1?"s":""} visible${members.length>1?"s":""}.`,membersHost,{iconName:"users"}));

    if(has("manageAccess")){
      const inviteRows=invitations.length?h("div",{class:"list"},...invitations.map(inv=>{
        const status=inv.accepted_at||inv.acceptedAt?"accepted":inv.revoked_at||inv.revokedAt?"revoked":new Date(inv.expires_at||inv.expiresAt)<new Date()?"expired":"pending";
        return row({
          title:inv.email,subtitle:`${inv.role} · expire ${formatDate(inv.expires_at||inv.expiresAt)}`,status,meta:inv.delivery_status||inv.deliveryState||"",
          actions:status==="pending"?[
            button("Renvoyer",{small:true,iconName:"send",onClick:async()=>{try{await resendInvitation(inv.id);toast("Invitation renvoyée");await reload()}catch(error){toast(errorMessage(error),"error")}}}),
            button("Révoquer",{small:true,kind:"ghost",iconName:"trash",onClick:()=>confirmAction({title:"Révoquer cette invitation ?",message:`${inv.email} ne pourra plus utiliser ce lien d’invitation.`,confirmLabel:"Révoquer",danger:true,onConfirm:async()=>{try{await revokeInvitation(inv.id);toast("Invitation révoquée");await reload()}catch(error){toast(errorMessage(error),"error")}}})})
          ]:[]
        });
      })):emptyState("Aucune invitation","Aucune invitation active ou historique.");
      body.append(card("Invitations","Accès initial des collaborateurs, partenaires et clients.",h("div",{},h("div",{class:"card-actions"},button("Inviter",{kind:"primary",iconName:"add",onClick:()=>inviteDialog(reload)})),inviteRows),{iconName:"mail"}));
      body.append(card("Rôles métier",`${customRoles.length} rôle${customRoles.length>1?"s":""} personnalisé${customRoles.length>1?"s":""}.`,customRoles.length?h("div",{class:"list"},...customRoles.map(role=>row({title:role.name,subtitle:role.description||role.detail||`${(role.permissions||[]).length} permission(s)`,status:role.permission_mode||role.mode||"custom",meta:`${(role.permissions||[]).length} droits`}))):emptyState("Aucun rôle métier","Créez les rôles métier depuis la gestion avancée des accès."),{iconName:"key"}));
    }
  }catch(error){root.append(emptyState("Équipe indisponible",errorMessage(error),"warning"))}
  return root;
}
