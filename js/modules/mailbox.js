import { mailbox,mailboxThread,updateMailboxMessage,sendMail,mailboxTemplates,mailboxStyle,saveMailboxStyle } from "../api.js";
import { state } from "../store.js";
import { h,pageHeader,card,button,toolbar,modal,field,input,textarea,select,validateControls,toast,errorMessage,emptyState,formatDate,row } from "../ui.js";

const folders=[
  {id:"INBOX",label:"Réception"},
  {id:"SENT",label:"Envoyés"},
  {id:"DRAFTS",label:"Brouillons"},
  {id:"STARRED",label:"Favoris"},
  {id:"ARCHIVED",label:"Archives"},
  {id:"TRASH",label:"Corbeille"}
];
const addresses=value=>String(value||"").split(/[;,]/).map(v=>v.trim()).filter(Boolean);
const mailTitle=mail=>mail.subject||"(Sans objet)";
const sender=mail=>mail.fromName||mail.from_name||mail.fromEmail||mail.from_email||"Expéditeur";
const bodyOf=mail=>mail.body||mail.textBody||mail.text_body||mail.preview||"";
const mailDate=mail=>mail.receivedAt||mail.received_at||mail.sentAt||mail.sent_at||mail.createdAt||mail.created_at;
const can=permission=>state.user?.permissions?.includes(permission);
function compose(reload,replyTo=null){
  const to=input(replyTo?.fromEmail||replyTo?.from_email||"",{placeholder:"nom@entreprise.com",required:true,autocomplete:"email"});
  const subject=input(replyTo?`Re: ${String(replyTo.subject||"").replace(/^Re:\s*/i,"")}`:"",{placeholder:"Objet",required:true});
  const body=textarea("",{placeholder:"Votre message…",required:true});
  const cc=input("",{placeholder:"cc@entreprise.com"});
  const bcc=input("",{placeholder:"cci@entreprise.com"});
  const advanced=h("details",{class:"advanced-panel"},h("summary",{text:"Copie & copie cachée"}),h("div",{class:"advanced-panel-body form"},field("Cc",cc),field("Cci",bcc)));
  modal({title:replyTo?"Répondre":"Nouveau message",content:h("div",{class:"form"},field("À",to),field("Objet",subject),field("Message",body),advanced),wide:true,actions:[{label:"Envoyer",kind:"primary",icon:"send",onClick:async close=>{
    try{
      if(!validateControls(to,subject,body))return;
      const text=body.value.trim();if(!addresses(to.value).length){toast("Ajoutez au moins un destinataire.","error");return}if(!text){toast("Le message est vide.","error");return}
      await sendMail({to:addresses(to.value),cc:addresses(cc.value),bcc:addresses(bcc.value),subject:subject.value.trim(),body:text,blocks:[{id:crypto.randomUUID(),kind:"PARAGRAPH",text,url:"",alternativeText:""}],...(replyTo?.providerThreadID?{providerThreadID:replyTo.providerThreadID}:{})});
      toast("E-mail envoyé");close();await reload();
    }catch(error){toast(errorMessage(error),"error",6000)}
  }}]});
}
async function mailboxMain(){
  const root=h("div"),listHost=h("div"),detailHost=h("div");let folder="INBOX",query="",filter="ALL",selected=null,searchTimer=null;
  const folderNav=h("nav",{class:"subnav","aria-label":"Dossiers de messagerie"});
  const drawFolders=()=>folderNav.replaceChildren(...folders.map(item=>button(item.label,{small:true,pressed:folder===item.id,onClick:()=>{folder=item.id;selected=null;drawFolders();load()}})));
  drawFolders();
  root.append(pageHeader({eyebrow:"Communication",title:"E-mails",subtitle:"Boîte Workspace connectée aux services de messagerie de votre organisation.",actions:can("sendMail")?[button("Nouveau message",{kind:"primary",iconName:"add",onClick:()=>compose(load)})]:[]}),folderNav,h("div",{class:"split-view"},card("Boîte mail","Messages synchronisés.",listHost,{iconName:"mail"}),card("Lecture","Sélectionnez un message.",detailHost,{iconName:"document"})));

  const open=async mail=>{
    selected=mail;drawSelection();
    try{
      const data=await mailboxThread(mail.id),thread=data.messages||[];
      detailHost.replaceChildren(h("div",{},
        h("div",{class:"toolbar"},can("sendMail")?button("Répondre",{kind:"primary",iconName:"send",onClick:()=>compose(load,thread.at(-1)||mail)}):null,can("organizeMail")?button(mail.isStarred?"Retirer le favori":"Favori",{iconName:"star",onClick:async()=>{await updateMailboxMessage(mail.id,{isStarred:!mail.isStarred});await load()}}):null,can("organizeMail")?button("Archiver",{iconName:"archive",onClick:async()=>{await updateMailboxMessage(mail.id,{folder:"ARCHIVED"});selected=null;await load()}}):null),
        ...thread.map(message=>h("article",{class:"card",style:{marginBottom:"10px"}},h("div",{class:"card-title",text:mailTitle(message)}),h("div",{class:"card-subtitle",text:`${sender(message)} · ${formatDate(mailDate(message))}`}),h("div",{class:"mail-body",style:{marginTop:"14px"},text:bodyOf(message)})))
      ));
      if(!mail.isRead){mail.isRead=true;drawSelection();await updateMailboxMessage(mail.id,{isRead:true}).catch(()=>{})}
    }catch(error){detailHost.replaceChildren(emptyState("Lecture impossible",errorMessage(error),"warning"))}
  };
  const drawSelection=()=>{for(const node of listHost.querySelectorAll(".mail-item")){const active=node.dataset.id===String(selected?.id||"");node.classList.toggle("active",active);node.setAttribute("aria-pressed",String(active));if(active&&selected?.isRead)node.classList.remove("unread")}};
  const load=async()=>{
    try{
      const data=await mailbox(folder,query,filter),messages=data.messages||[];
      const readFilter=select(filter,[{value:"ALL",label:"Tous les messages"},{value:"UNREAD",label:"Non lus"}]);readFilter.setAttribute("aria-label","Filtrer les messages");readFilter.addEventListener("change",()=>{filter=readFilter.value;load()});
      listHost.replaceChildren(
        toolbar(query,value=>{query=value;clearTimeout(searchTimer);searchTimer=setTimeout(load,260)},[readFilter],"Rechercher dans les e-mails"),
        messages.length?h("div",{class:"mail-list"},...messages.map(mail=>h("button",{class:`mail-item ${mail.isRead?"":"unread"} ${selected?.id===mail.id?"active":""}`,dataset:{id:String(mail.id)},type:"button","aria-pressed":String(selected?.id===mail.id),onClick:()=>open(mail)},h("strong",{text:mailTitle(mail)}),h("p",{text:`${sender(mail)} · ${bodyOf(mail).slice(0,110)}`}),h("p",{text:formatDate(mailDate(mail))})))):emptyState("Boîte vide",filter==="UNREAD"?"Aucun message non lu dans ce dossier.":"Aucun message dans ce dossier.","mail")
      );
      if(!selected)detailHost.replaceChildren(emptyState("Sélectionnez un message","Le fil complet apparaîtra ici.","document"));
    }catch(error){listHost.replaceChildren(emptyState("Boîte indisponible",errorMessage(error),"warning"))}
  };
  await load();return root;
}
async function templatesView(){
  const root=h("div");root.append(pageHeader({eyebrow:"E-mails",title:"Modèles",subtitle:"Réponses et messages réutilisables disponibles dans Workspace."}));
  try{
    const data=await mailboxTemplates(),values=Array.isArray(data)?data:(data.templates||[]);
    root.append(card("Modèles",`${values.length} modèle${values.length>1?"s":""} disponible${values.length>1?"s":""}.`,values.length?h("div",{class:"list"},...values.map((value,index)=>row({title:value.name||value.title||value.subject||`Modèle ${index+1}`,subtitle:value.description||value.preview||"",status:value.status||"active",meta:value.updatedAt?formatDate(value.updatedAt):""}))):emptyState("Aucun modèle","Créez vos modèles depuis l’app native ou l’administration mail.","document"),{iconName:"document"}));
  }catch(error){root.append(emptyState("Modèles indisponibles",errorMessage(error),"warning"))}
  return root;
}
async function styleView(){
  const root=h("div");root.append(pageHeader({eyebrow:"E-mails",title:"Identité & style",subtitle:"Paramètres de marque utilisés par les e-mails Squared Workspace."}));
  try{
    const data=await mailboxStyle(),form=h("div",{class:"form"}),controls={};
    for(const [key,value] of Object.entries(data||{})){controls[key]=typeof value==="boolean"?h("input",{type:"checkbox",checked:value}):input(value??"");form.append(field(key,controls[key]))}
    root.append(card("Identité e-mail","Valeurs actuellement actives côté serveur.",form,{iconName:"image"}),button("Enregistrer",{kind:"primary",iconName:"check",onClick:async()=>{const next={};for(const [key,control] of Object.entries(controls))next[key]=control.type==="checkbox"?control.checked:control.value;try{await saveMailboxStyle(next);toast("Style e-mail enregistré")}catch(error){toast(errorMessage(error),"error")}}}));
  }catch(error){root.append(emptyState("Style indisponible",errorMessage(error),"warning"))}
  return root;
}
export async function renderMailbox(subpage="mailbox"){
  if(subpage==="templates")return templatesView();
  if(subpage==="appearance")return styleView();
  if(subpage==="connections"){
    const root=h("div");root.append(pageHeader({eyebrow:"E-mails",title:"Connexion",subtitle:"La connexion Google Workspace est administrée par le backend Squared."}),emptyState("Connexion gérée côté serveur","Les connexions OAuth et leurs secrets restent volontairement hors du navigateur.","shield"));return root;
  }
  return mailboxMain();
}
