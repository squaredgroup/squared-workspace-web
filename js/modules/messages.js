import { state } from "../store.js";
import { loadWorkspace,sendConversationMessage,createConversation,markConversationRead } from "../api.js";
import { h,pageHeader,card,button,modal,field,input,textarea,toast,errorMessage,emptyState,formatDate } from "../ui.js";

const conversationMessages=conversation=>Array.isArray(conversation.messages)?conversation.messages:[];
const memberId=member=>member.id||member.memberId||member.member_id;
const memberName=member=>member.name||`${member.firstName||member.first_name||""} ${member.lastName||member.last_name||""}`.trim()||member.email||"Membre";
function messageAuthorId(message){return message.authorId||message.authorID||message.author_id||message.senderId||message.senderID}
function messageDate(message){return message.createdAt||message.created_at||message.time}
function messageBody(message){return message.body||message.text||""}
function participantNames(conversation){
  if(Array.isArray(conversation.participants)&&conversation.participants.length)return conversation.participants.map(value=>typeof value==="string"?value:memberName(value)).join(" · ");
  return `${conversation.participantIDs?.length||0} participant(s)`;
}
function newConversation(reload){
  const members=(state.workspace?.team||[]).filter(member=>memberId(member)&&memberId(member)!==state.user?.id);
  const name=input("",{placeholder:"Nom de la conversation"});
  const selected=new Set();
  const picker=members.length?h("div",{class:"member-picker"},...members.map(member=>{
    const id=memberId(member),check=h("input",{type:"checkbox"});
    check.addEventListener("change",()=>check.checked?selected.add(id):selected.delete(id));
    return h("label",{class:"member-choice"},check,h("span",{},h("strong",{text:memberName(member)}),h("small",{text:member.title||member.role||member.email||""})));
  })):emptyState("Aucun membre disponible","Aucun autre membre n’est actuellement visible dans votre périmètre.","users");
  modal({
    title:"Nouvelle conversation",
    content:h("div",{class:"form"},field("Nom",name,"Optionnel pour une conversation directe."),h("div",{},h("div",{class:"card-title",text:"Participants"}),h("div",{class:"card-subtitle",text:"Sélectionnez les membres au lieu de manipuler leurs identifiants techniques."})),picker),
    wide:true,
    actions:[{label:"Créer",kind:"primary",icon:"add",onClick:async close=>{
      try{
        const ids=[...selected];if(!ids.length){toast("Sélectionnez au moins un participant.","error");return}
        if(state.user?.id&&!ids.includes(state.user.id))ids.unshift(state.user.id);
        await createConversation({id:crypto.randomUUID(),name:name.value.trim()||"Nouvelle conversation",participants:[],unread:0,messages:[],participantIDs:ids,kind:ids.length===2?"direct":"team",createdAt:new Date().toISOString()});
        toast("Conversation créée");close();await reload();
      }catch(error){toast(errorMessage(error),"error",6000)}
    }}]
  });
}
export async function renderMessages(){
  const root=h("div"),left=h("div"),right=h("div");let selected=null;let draw=()=>{};
  const reload=async()=>{await loadWorkspace();draw()};
  root.append(pageHeader({eyebrow:"Communication",title:"Messages",subtitle:"Conversations internes synchronisées avec Squared Workspace.",actions:[button("Nouvelle conversation",{kind:"primary",iconName:"add",onClick:()=>newConversation(reload)})]}),h("div",{class:"split-view"},card("Conversations","Canaux auxquels vous avez accès.",left,{iconName:"messages"}),card("Discussion","Sélectionnez une conversation.",right,{iconName:"mail"})));
  await loadWorkspace();

  const open=async conversation=>{
    selected=conversation;draw();
    const messages=conversationMessages(conversation),messageBox=textarea("",{placeholder:"Écrire un message…"});
    const threadItems=messages.length?messages.map(message=>{
      const mine=messageAuthorId(message)===state.user?.id;
      return h("article",{class:`message-bubble ${mine?"mine":""}`},h("div",{class:"message-bubble-head"},h("strong",{text:mine?"Vous":message.authorName||message.author||"Membre"}),h("span",{text:messageDate(message)?formatDate(messageDate(message)):""})),h("p",{text:messageBody(message)}));
    }):[emptyState("Aucun message","Commencez la conversation.")];
    const thread=h("div",{class:"message-thread"},...threadItems);
    const send=async()=>{
      const text=messageBox.value.trim();if(!text)return;
      sendButton.disabled=true;
      try{
        await sendConversationMessage(conversation.id,text);messageBox.value="";await loadWorkspace();
        const refreshed=(state.workspace?.conversations||[]).find(item=>item.id===conversation.id)||conversation;draw();await open(refreshed);
      }catch(error){toast(errorMessage(error),"error")}finally{sendButton.disabled=false}
    };
    const sendButton=button("Envoyer",{kind:"primary",iconName:"send",onClick:send});
    messageBox.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.metaKey||event.ctrlKey)){event.preventDefault();send()}});
    right.replaceChildren(h("div",{},
      h("div",{class:"card-head"},h("div",{},h("div",{class:"card-title",text:conversation.name||"Conversation"}),h("div",{class:"card-subtitle",text:participantNames(conversation)}))),
      thread,
      h("div",{class:"composer"},messageBox,sendButton),
      h("div",{class:"muted",style:{marginTop:"7px"},text:"⌘/Ctrl + Entrée pour envoyer"})
    ));
    requestAnimationFrame(()=>thread.scrollTo({top:thread.scrollHeight,behavior:"smooth"}));
    const last=messages.at(-1);markConversationRead(conversation.id,last?.id||null).catch(()=>{});
  };
  draw=()=>{
    const conversations=state.workspace?.conversations||[];
    const listContent=conversations.length?h("div",{class:"mail-list"},...conversations.map(conversation=>{
      const messages=conversationMessages(conversation),last=messages.at(-1);
      return h("button",{class:`mail-item ${conversation.unread?"unread":""} ${selected?.id===conversation.id?"active":""}`,type:"button",onClick:()=>open(conversation)},h("strong",{text:conversation.name||"Conversation"}),h("p",{text:last?messageBody(last).slice(0,90):participantNames(conversation)}),h("p",{text:last&&messageDate(last)?formatDate(messageDate(last)):`${messages.length} message(s)`}));
    })):emptyState("Aucune conversation","Créez une conversation avec un membre Workspace.");
    left.replaceChildren(listContent);
    if(!selected)right.replaceChildren(emptyState("Sélectionnez une conversation","Les messages et le champ de réponse apparaîtront ici.","mail"));
  };
  draw();return root;
}
