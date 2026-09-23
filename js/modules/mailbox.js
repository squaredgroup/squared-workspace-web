import { viewContext } from "../focus-state.js";
import { mailbox,mailboxThread,updateMailboxMessage,sendMail,mailboxTemplates,mailboxStyle,saveMailboxStyle } from "../api.js";
import { state } from "../store.js";
import { h,pageHeader,card,button,toolbar,modal,field,input,textarea,select,validateControls,toast,errorMessage,emptyState,formatDate,relativeDate,row,profileAvatar } from "../ui.js";

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
const fromEmail=mail=>mail.fromEmail||mail.from_email||"";
const textBodyOf=mail=>mail.textBody||mail.text_body||mail.body||mail.preview||"";
const htmlBodyOf=mail=>mail.htmlBody||mail.html_body||"";
const previewOf=mail=>mail.preview||textBodyOf(mail).replace(/\s+/g," ").trim();
const mailDate=mail=>mail.receivedAt||mail.received_at||mail.sentAt||mail.sent_at||mail.createdAt||mail.created_at;
const listOf=(mail,...keys)=>{for(const key of keys){const value=mail?.[key];if(Array.isArray(value))return value.filter(Boolean);if(typeof value==="string"&&value.trim())return addresses(value)}return[]};
const recipients=mail=>listOf(mail,"toEmails","to_emails","to");
const ccRecipients=mail=>listOf(mail,"ccEmails","cc_emails","cc");
const attachmentsOf=mail=>Array.isArray(mail.attachments)?mail.attachments:[];
const isOutbound=mail=>String(mail.direction||"").toUpperCase()==="OUTBOUND"||String(mail.folder||"").toUpperCase()==="SENT";
const listContact=mail=>isOutbound(mail)?(recipients(mail).join(", ")||"Destinataire"):sender(mail);
const statusLabel=mail=>({DRAFT:"Brouillon",SCHEDULED:"Planifié",RECEIVED:"Reçu",SENDING:"Envoi…",SENT:"Envoyé",FAILED:"Échec"})[String(mail.status||"").toUpperCase()]||"";
const senderPerson=mail=>isOutbound(mail)?state.user:{name:sender(mail),avatarData:mail.fromAvatarData||mail.from_avatar_data||mail.avatarData||mail.avatar_data};
const listPerson=mail=>({name:listContact(mail),avatarData:isOutbound(mail)?(mail.recipientAvatarData||mail.recipient_avatar_data):(mail.fromAvatarData||mail.from_avatar_data||mail.avatarData||mail.avatar_data)});
const trustedSender=mail=>{const email=fromEmail(mail).toLowerCase();return email.endsWith("@squaredgroup.studio")||email.endsWith("@squaredgroup.fr")};
const formatBytes=value=>{const bytes=Number(value);if(!Number.isFinite(bytes)||bytes<=0)return"";if(bytes<1024)return`${bytes} o`;if(bytes<1048576)return`${Math.round(bytes/1024)} Ko`;return`${(bytes/1048576).toFixed(1).replace(".",",")} Mo`};
const can=permission=>state.user?.permissions?.includes(permission);

function safeEmailDocument(mail,showRemote=false,plain=false){
  const baseStyle="html{color-scheme:light}*,*::before,*::after{box-sizing:border-box}body{max-width:100%;margin:0;padding:28px;background:#fff;color:#171817;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#317d19;text-decoration:underline;pointer-events:none}blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #d9ded6;color:#5f655c}pre{white-space:pre-wrap}hr{border:0;border-top:1px solid #e3e7e1}@media(max-width:480px){body{padding:16px!important}table{width:100%!important;max-width:100%!important}td{max-width:100%!important}h1,h2,h3,p{overflow-wrap:anywhere}}";
  const imgPolicy=showRemote?"https: http: data: blob:":"data: blob:";
  const csp=`default-src 'none'; img-src ${imgPolicy}; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`;
  if(plain||!htmlBodyOf(mail)){
    const escaped=String(textBodyOf(mail)||"Aucun contenu textuel disponible.").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\n","<br>");
    return`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${baseStyle}</style></head><body>${escaped}</body></html>`;
  }
  const doc=new DOMParser().parseFromString(htmlBodyOf(mail),"text/html");
  doc.querySelectorAll("script,noscript,iframe,frame,frameset,object,embed,form,input,textarea,select,button,video,audio,source,meta,base,link").forEach(node=>node.remove());
  for(const node of doc.querySelectorAll("*")){
    for(const attribute of [...node.attributes]){
      const name=attribute.name.toLowerCase(),value=attribute.value.trim();
      if(name.startsWith("on")||["action","formaction","srcdoc","sandbox","ping"].includes(name)){node.removeAttribute(attribute.name);continue}
      if(["href","src","xlink:href"].includes(name)){
        const lower=value.toLowerCase(),remote=/^https?:\/\//.test(lower),localImage=/^(data:image\/|blob:)/.test(lower);
        if(name==="href"||(!localImage&&(!remote||!showRemote)))node.removeAttribute(attribute.name);
      }
      if(name==="target")node.removeAttribute(attribute.name);
    }
  }
  const bodyMarkup=new XMLSerializer().serializeToString(doc.body);
  return`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${baseStyle}</style></head>${bodyMarkup}</html>`;
}

function attachmentView(attachment,index){
  const name=attachment.fileName||attachment.file_name||attachment.name||`Pièce jointe ${index+1}`;
  return h("div",{class:"mail-attachment"},h("span",{class:"mail-attachment-mark","aria-hidden":"true",text:"↗"}),h("div",{},h("strong",{text:name}),h("span",{text:[attachment.contentType||attachment.content_type,formatBytes(attachment.byteCount||attachment.byte_count||attachment.size)].filter(Boolean).join(" · ")||"Pièce jointe"})));
}

function bodyPreview(mail){
  let mode=htmlBodyOf(mail)?"original":"text",showRemote=trustedSender(mail);
  const root=h("section",{class:"mail-preview","aria-label":"Aperçu réel de l’e-mail"}),frame=h("iframe",{class:"mail-preview-frame",title:"Aperçu de l’e-mail",sandbox:"",loading:"eager"});
  const controls=h("div",{class:"mail-preview-controls"});
  const draw=()=>{
    const hasHTML=Boolean(htmlBodyOf(mail)),hasRemote=/<(?:img|table|td|div|span)[^>]+(?:src|style)=["'][^"']*(?:https?:\/\/|url\()/i.test(htmlBodyOf(mail));
    const modeButtons=hasHTML?h("div",{class:"mail-preview-switch","aria-label":"Format du message"},button("Original",{small:true,pressed:mode==="original",onClick:()=>{mode="original";draw()}}),button("Version texte",{small:true,pressed:mode==="text",onClick:()=>{mode="text";draw()}})):h("span",{class:"mail-preview-format",text:"VERSION TEXTE"});
    controls.replaceChildren(h("div",{class:"mail-preview-kicker"},h("strong",{text:mode==="original"?"E-MAIL ORIGINAL":"VERSION TEXTE"}),h("span",{text:mode==="original"?"Mise en page reçue depuis le service de messagerie":"Contenu accessible sans mise en page"})),h("div",{class:"mail-preview-actions"},modeButtons,hasRemote&&mode==="original"?button(showRemote?"Masquer les images":"Afficher les images",{small:true,pressed:showRemote,onClick:()=>{showRemote=!showRemote;draw()}}):null));
    frame.srcdoc=safeEmailDocument(mail,showRemote,mode==="text");
  };
  root.append(controls,frame);draw();return root;
}

function conversationMessage(mail,index,total){
  const senderName=isOutbound(mail)?"Vous":sender(mail),to=recipients(mail),cc=ccRecipients(mail),attachments=attachmentsOf(mail);
  const details=h("details",{class:"mail-conversation",open:index===total-1});
  const addressLine=isOutbound(mail)?`À : ${to.join(", ")||"—"}`:`De : ${fromEmail(mail)||sender(mail)}`;
  details.append(h("summary",{class:"mail-conversation-summary"},profileAvatar(senderPerson(mail),{className:"mail-avatar",size:36,ariaHidden:true}),h("span",{class:"mail-conversation-identity"},h("strong",{text:senderName}),h("span",{text:addressLine})),h("span",{class:"mail-conversation-date",text:formatDate(mailDate(mail))}),h("span",{class:`mail-read-dot ${mail.isRead?"":"unread"}`,title:mail.isRead?"Message lu":"Message non lu","aria-label":mail.isRead?"Message lu":"Message non lu"})));
  details.append(h("div",{class:"mail-conversation-content"},(to.length||cc.length)?h("div",{class:"mail-recipient-line"},to.length?h("span",{text:`À ${to.join(", ")}`}):null,cc.length?h("span",{text:`Cc ${cc.join(", ")}`}):null):null,bodyPreview(mail),attachments.length?h("section",{class:"mail-attachments","aria-label":`${attachments.length} pièce${attachments.length>1?"s":""} jointe${attachments.length>1?"s":""}`},h("h4",{text:`${attachments.length} pièce${attachments.length>1?"s":""} jointe${attachments.length>1?"s":""}`}),h("div",{class:"mail-attachment-grid"},...attachments.map(attachmentView))):null,h("div",{class:"mail-message-footer"},h("span",{text:statusLabel(mail)||"Synchronisé"}),h("span",{text:formatDate(mailDate(mail))}))));
  return details;
}
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
  const context=viewContext("mailbox",{folder:"INBOX",query:"",filter:"ALL",selectedId:""});
  let {folder,query,filter}=context,selected=null,searchTimer=null,generation=0,reading=0,listY=0;
  const root=h("div",{class:"focus-mail"}),listHost=h("div"),detailHost=h("div"),results=h("div");
  const folderNav=h("nav",{class:"subnav","aria-label":"Dossiers de messagerie"});
  const search=h("input",{class:"search-input",type:"search","aria-label":"Rechercher dans les e-mails",placeholder:"Rechercher un e-mail…",value:query});
  const readFilter=select(filter,[{value:"ALL",label:"Tous les messages"},{value:"UNREAD",label:"Non lus"},{value:"ATTACHMENTS",label:"Avec pièces jointes"},{value:"RECENT",label:"7 derniers jours"}]);readFilter.setAttribute("aria-label","Filtrer les messages");
  const layout=h("div",{class:"mail-workspace",dataset:{focusManaged:"true"}},h("section",{class:"mail-pane mail-list-pane","aria-label":"Liste des e-mails"},listHost),h("section",{class:"mail-pane mail-detail-pane","aria-label":"Lecture de l’e-mail"},detailHost));
  const saveContext=()=>Object.assign(context,{folder,query,filter,selectedId:selected?.id||""});
  const back=()=>{reading++;selected=null;context.selectedId="";layout.classList.remove("sq-mail-open");root.classList.remove("focus-reading");drawSelection();requestAnimationFrame(()=>{window.scrollTo({top:listY,behavior:"instant"});search.focus({preventScroll:true});});};
  const drawFolders=()=>folderNav.replaceChildren(...folders.map(item=>button(item.label,{small:true,pressed:folder===item.id,onClick:()=>{folder=item.id;back();drawFolders();void load();}})));
  root.append(pageHeader({eyebrow:"Communication",title:"E-mails",subtitle:"Vos échanges externes.",actions:can("sendMail")?[button("Nouveau message",{kind:"primary",iconName:"add",onClick:()=>compose(load)})]:[]}),folderNav,layout);
  listHost.append(h("div",{class:"toolbar"},search,readFilter),results);
  search.addEventListener("input",()=>{query=search.value;context.query=query;clearTimeout(searchTimer);searchTimer=setTimeout(()=>void load(),260);});
  readFilter.addEventListener("change",()=>{filter=readFilter.value;void load();});
  const drawSelection=()=>{for(const node of results.querySelectorAll(".mail-item")){const active=node.dataset.id===String(selected?.id||"");node.classList.toggle("active",active);node.setAttribute("aria-pressed",String(active));}};
  const open=async mail=>{
    const version=++reading;selected=mail;saveContext();drawSelection();listY=window.scrollY;
    layout.classList.add("sq-mail-open");root.classList.add("focus-reading");
    const backButton=()=>button("Retour aux e-mails",{className:"sq-mail-back",iconName:"ArrowLeft",onClick:back});
    detailHost.replaceChildren(backButton(),h("p",{class:"focus-summary",role:"status",text:"Chargement du message…"}));
    try{
      const data=await mailboxThread(mail.id);if(version!==reading)return;
      const messages=data.messages?.length?data.messages:[mail],latest=messages.at(-1)||mail;
      const secondary=h("details",{class:"focus-filters"},h("summary",{text:"Plus d’actions"}));
      if(can("organizeMail"))secondary.append(button(mail.isStarred?"Retirer le favori":"Favori",{iconName:"star",onClick:async()=>{await updateMailboxMessage(mail.id,{isStarred:!mail.isStarred});mail.isStarred=!mail.isStarred;await open(mail);}}),button("Archiver",{iconName:"archive",onClick:async()=>{await updateMailboxMessage(mail.id,{folder:"ARCHIVED"});back();await load();}}));
      detailHost.replaceChildren(h("div",{class:"mail-reader"},backButton(),h("header",{class:"mail-reader-head"},h("div",{class:"mail-reader-copy"},h("h2",{text:mailTitle(latest)}),h("p",{text:`${sender(latest)} · ${mailDate(latest)?formatDate(mailDate(latest)):""}`})),h("div",{class:"mail-reader-actions"},can("sendMail")?button("Répondre",{kind:"primary",iconName:"send",onClick:()=>compose(load,latest)}):null,can("organizeMail")?secondary:null)),h("div",{class:"mail-thread"},...messages.map((message,index)=>conversationMessage(message,index,messages.length)))));
      if(matchMedia("(max-width:880px)").matches){window.scrollTo({top:0,behavior:"instant"});detailHost.querySelector(".sq-mail-back")?.focus({preventScroll:true});}
      if(!mail.isRead){await updateMailboxMessage(mail.id,{isRead:true}).then(()=>{mail.isRead=true;drawSelection();}).catch(()=>{});}
    }catch(e){if(version===reading)detailHost.replaceChildren(backButton(),emptyState("Lecture impossible",errorMessage(e),"warning"));}
  };
  async function load(){
    const current=++generation;saveContext();
    try{
      const data=await mailbox(folder,query,filter);if(current!==generation)return;
      const messages=data.messages||[];
      results.replaceChildren(messages.length?h("div",{class:"mail-list"},...messages.map(mail=>h("button",{class:`mail-item ${mail.isRead?"":"unread"}`,dataset:{id:String(mail.id)},type:"button","aria-pressed":String(selected?.id===mail.id),onClick:()=>open(mail)},profileAvatar(listPerson(mail),{className:"mail-avatar",size:36,ariaHidden:true}),h("span",{class:"mail-item-content"},h("span",{class:"mail-item-line"},h("strong",{text:listContact(mail)}),h("time",{text:relativeDate(mailDate(mail))})),h("span",{class:"mail-item-subject",text:mailTitle(mail)}),h("span",{class:"mail-item-preview",text:previewOf(mail).slice(0,150)||"Aucun aperçu disponible"}))))):emptyState("Boîte vide","Aucun message ne correspond à ce dossier et à ces filtres.","mail"));
      if(!selected)detailHost.replaceChildren(emptyState("Sélectionnez un message","Le contenu et les pièces jointes s’afficheront ici.","mail"));
      drawSelection();
    }catch(e){if(current===generation)results.replaceChildren(emptyState("Boîte indisponible",errorMessage(e),"warning"));}
  }
  drawFolders();await load();return root;
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
