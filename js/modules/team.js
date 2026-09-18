import { state } from "../store.js";
import { loadWorkspace, listInvitations, createInvitation, resendInvitation, revokeInvitation, changeMemberRole, changeMemberState, listCustomRoles, assignCustomRole, effectiveMemberAccess, memberSessions, revokeAdminSession } from "../api.js";
import { h,pageHeader,card,row,button,modal,field,input,select,toast,errorMessage,emptyState,badge,formatDate } from "../ui.js";

const ROLES=["OWNER","ADMIN","COLLABORATOR","PARTNER","CLIENT"];
const has=p=>state.user?.permissions?.includes(p);

function inviteDialog(reload){
  const email=input("",{type:"email",required:true,placeholder:"nom@entreprise.com"});
  const role=select("COLLABORATOR",ROLES);
  modal({title:"Inviter dans Workspace",content:h("div",{class:"form"},field("Adresse e-mail",email),field("Rôle socle",role),h("p",{class:"muted",text:"L’invitation expire après 7 jours. Les rôles métier et périmètres fins peuvent ensuite être appliqués depuis les accès du membre."})),actions:[{label:"Envoyer l’invitation",kind:"primary",icon:"send",onClick:async close=>{try{await createInvitation({email:email.value.trim(),role:role.value,customRoleIds:[],scopeType:null,scopeId:null,permissions:[],accessExpiresAt:null});toast("Invitation envoyée");close();await reload()}catch(e){toast(errorMessage(e),"error",6500)}}}]});
}

function memberDialog(member, customRoles, reload){
  const role=select(member.role||"COLLABORATOR",ROLES);
  const custom=select("",[{value:"",label:"Aucun rôle métier"},...customRoles.map(r=>({value:r.id,label:r.name}))]);
  const content=h("div",{class:"form"},h("div",{},h("strong",{text:member.name||member.email}),h("div",{class:"muted",text:member.email||""})),field("Rôle socle",role),field("Rôle métier principal",custom));
  const actions=[];
  if(has("manageAccess")) actions.push({label:"Enregistrer les rôles",kind:"primary",icon:"check",onClick:async close=>{try{if(role.value!==member.role)await changeMemberRole(member.id,role.value);await assignCustomRole(member.id,custom.value||null);toast("Accès du membre mis à jour");close();await loadWorkspace();await reload()}catch(e){toast(errorMessage(e),"error",6500)}}});
  if(has("manageAccess")) actions.push({label:"Voir l’accès effectif",icon:"key",onClick:async()=>{try{const value=await effectiveMemberAccess(member.id);modal({title:"Accès effectif",content:h("pre",{class:"json-view",text:JSON.stringify(value,null,2)}),wide:true})}catch(e){toast(errorMessage(e),"error")}}});
  if(has("manageTeam")) actions.push({label:"Sessions",icon:"user",onClick:async()=>{try{const sessions=await memberSessions(member.id);const host=h("div",{class:"list"},...(sessions.length?sessions.map(s=>row({title:s.device_name||"Appareil",subtitle:s.platform||"",status:"active",meta:formatDate(s.last_seen_at||s.created_at),actions:[state.user?.role==="OWNER"||state.user?.role==="ADMIN"?button("Révoquer",{small:true,kind:"ghost",onClick:async()=>{try{await revokeAdminSession(s.id);toast("Session révoquée")}catch(e){toast(errorMessage(e),"error")}}}):null].filter(Boolean)})):[emptyState("Aucune session","Aucune session active pour ce membre.") ]));modal({title:`Sessions · ${member.name||member.email}`,content:host,wide:true})}catch(e){toast(errorMessage(e),"error")}}});
  modal({title:"Membre & accès",content,actions,wide:true});
}

export async function renderTeam(subpage="members"){
  if(subpage!=="members") return null;
  const root=h("div");
  root.append(pageHeader({eyebrow:"Administration",title:"Équipe",subtitle:"Membres, rôles, invitations et sessions Workspace."}));
  const body=h("div",{class:"grid two"});root.append(body);
  const reload=async()=>{const next=await renderTeam("members");root.replaceChildren(...next.childNodes)};
  try{
    await loadWorkspace();
    const members=state.workspace?.team||[];
    let invitations=[],customRoles=[];
    if(has("manageAccess")) [invitations,customRoles]=await Promise.all([listInvitations().catch(()=>state.workspace?.enterprise?.invitations||[]),listCustomRoles().catch(()=>state.workspace?.enterprise?.customRoles||[])]);
    const membersHost=h("div",{class:"list"},...(members.length?members.map(member=>row({title:member.name||member.email,subtitle:[member.title,member.email].filter(Boolean).join(" · "),status:member.role,meta:member.availability||"",actions:[button("Gérer",{small:true,iconName:"settings",onClick:()=>memberDialog(member,customRoles,reload)}),has("manageTeam")&&member.id!==state.user?.id?button("Désactiver",{small:true,kind:"ghost",iconName:"lock",onClick:async()=>{if(!confirm(`Désactiver ${member.name||member.email} ?`))return;try{await changeMemberState(member.id,false);toast("Membre désactivé");await loadWorkspace();await reload()}catch(e){toast(errorMessage(e),"error")}}}):null].filter(Boolean)})):[emptyState("Aucun membre","Aucun membre visible dans votre périmètre.") ]));
    body.append(card("Membres",`${members.length} membre${members.length>1?"s":""} visible${members.length>1?"s":""}.`,membersHost,{iconName:"users"}));
    if(has("manageAccess")){
      const inviteHost=h("div",{},h("div",{class:"card-actions"},button("Inviter",{kind:"primary",iconName:"add",onClick:()=>inviteDialog(reload)})),h("div",{class:"list"},...(invitations.length?invitations.map(inv=>{const status=inv.accepted_at||inv.acceptedAt?"accepted":inv.revoked_at||inv.revokedAt?"revoked":new Date(inv.expires_at||inv.expiresAt)<new Date()?"expired":"pending";return row({title:inv.email,subtitle:`${inv.role} · expire ${formatDate(inv.expires_at||inv.expiresAt)}`,status,meta:inv.delivery_status||inv.deliveryState||"",actions:status==="pending"?[button("Renvoyer",{small:true,iconName:"send",onClick:async()=>{try{await resendInvitation(inv.id);toast("Invitation renvoyée");await reload()}catch(e){toast(errorMessage(e),"error")}}}),button("Révoquer",{small:true,kind:"ghost",iconName:"trash",onClick:async()=>{try{await revokeInvitation(inv.id);toast("Invitation révoquée");await reload()}catch(e){toast(errorMessage(e),"error")}}})]:[]})}):[emptyState("Aucune invitation","Aucune invitation active ou historique.") ])));
      body.append(card("Invitations","Accès initial des collaborateurs, partenaires et clients.",inviteHost,{iconName:"mail"}));
      body.append(card("Rôles métier",`${customRoles.length} rôle${customRoles.length>1?"s":""} personnalisé${customRoles.length>1?"s":""}.`,customRoles.length?h("div",{class:"list"},...customRoles.map(r=>row({title:r.name,subtitle:r.description||r.detail||`${(r.permissions||[]).length} permission(s)`,status:r.permission_mode||r.mode||"custom",meta:`${(r.permissions||[]).length} droits`}))):emptyState("Aucun rôle métier","Créez les rôles métier depuis la gestion avancée des accès."),{iconName:"key"}));
    }
  }catch(e){root.append(emptyState("Équipe indisponible",errorMessage(e),"warning"))}
  return root;
}
