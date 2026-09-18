import { state } from "../store.js";
import { loadWorkspace,sendConversationMessage,createConversation,markConversationRead } from "../api.js";
import { h,pageHeader,card,button,modal,field,input,textarea,toast,errorMessage,emptyState,formatDate } from "../ui.js";

function conversationMessages(conversation){
  return Array.isArray(conversation.messages) ? conversation.messages : [];
}

function newConversation(reload){
  const name=input("");
  const participants=input("",{placeholder:"UUID membre, UUID membre…"});

  modal({
    title:"Nouvelle conversation",
    content:h(
      "div",
      {class:"form"},
      field("Nom",name),
      field("Participants",participants)
    ),
    actions:[{
      label:"Créer",
      kind:"primary",
      icon:"add",
      onClick:async close=>{
        try{
          const ids=participants.value.split(",").map(value=>value.trim()).filter(Boolean);
          if(state.user?.id && !ids.includes(state.user.id)) ids.unshift(state.user.id);

          await createConversation({
            id:crypto.randomUUID(),
            name:name.value.trim() || "Nouvelle conversation",
            participants:[],
            unread:0,
            messages:[],
            participantIDs:ids,
            kind:ids.length===2 ? "direct" : "team",
            createdAt:new Date().toISOString()
          });

          toast("Conversation créée");
          close();
          await reload();
        }catch(error){
          toast(errorMessage(error),"error",6000);
        }
      }
    }]
  });
}

export async function renderMessages(){
  const root=h("div");
  let selected=null;
  const left=h("div");
  const right=h("div");

  let draw=()=>{};

  const reload=async()=>{
    await loadWorkspace();
    draw();
  };

  root.append(
    pageHeader({
      eyebrow:"Communication",
      title:"Messages",
      subtitle:"Conversations internes synchronisées en temps réel.",
      actions:[
        button("Nouvelle conversation",{
          kind:"primary",
          iconName:"add",
          onClick:()=>newConversation(reload)
        })
      ]
    }),
    h(
      "div",
      {class:"split-view"},
      card("Conversations","Canaux auxquels vous avez accès.",left,{iconName:"messages"}),
      card("Discussion","Sélectionnez une conversation.",right,{iconName:"mail"})
    )
  );

  await loadWorkspace();

  const open=async conversation=>{
    selected=conversation;
    const messages=conversationMessages(conversation);
    const messageBox=textarea("",{placeholder:"Écrire un message…"});

    const threadItems=messages.length
      ? messages.map(message=>h(
          "article",
          {class:"card"},
          h("div",{class:"row-title",text:message.authorName||message.author||"Membre"}),
          h("div",{class:"row-sub",text:message.createdAt?formatDate(message.createdAt):message.time||""}),
          h("div",{class:"mail-body",style:{marginTop:"10px"},text:message.body||""})
        ))
      : [emptyState("Aucun message","Commencez la conversation.")];

    const thread=h("div",{class:"list"},...threadItems);

    const composer=h(
      "div",
      {class:"form",style:{marginTop:"12px"}},
      field("Message",messageBox),
      button("Envoyer",{
        kind:"primary",
        iconName:"send",
        onClick:async()=>{
          const text=messageBox.value.trim();
          if(!text) return;

          try{
            await sendConversationMessage(conversation.id,text);
            messageBox.value="";
            toast("Message envoyé");
            await loadWorkspace();

            const refreshed=(state.workspace?.conversations||[]).find(item=>item.id===conversation.id) || conversation;
            draw();
            await open(refreshed);
          }catch(error){
            toast(errorMessage(error),"error");
          }
        }
      })
    );

    right.replaceChildren(
      h(
        "div",
        {},
        h(
          "div",
          {class:"card-head"},
          h(
            "div",
            {},
            h("div",{class:"card-title",text:conversation.name||"Conversation"}),
            h("div",{class:"card-subtitle",text:(conversation.participants||[]).join(" · ")})
          )
        ),
        thread,
        composer
      )
    );

    const last=messages.at(-1);
    markConversationRead(conversation.id,last?.id||null).catch(()=>{});
  };

  draw=()=>{
    const conversations=state.workspace?.conversations||[];

    const listContent=conversations.length
      ? h(
          "div",
          {class:"mail-list"},
          ...conversations.map(conversation=>h(
            "button",
            {
              class:`mail-item ${conversation.unread?"unread":""}`,
              type:"button",
              onClick:()=>open(conversation)
            },
            h("strong",{text:conversation.name||"Conversation"}),
            h("p",{text:`${conversation.participants?.length||conversation.participantIDs?.length||0} participant(s) · ${conversationMessages(conversation).length} message(s)`})
          ))
        )
      : emptyState("Aucune conversation","Créez une conversation avec un membre Workspace.");

    left.replaceChildren(listContent);

    if(!selected){
      right.replaceChildren(
        emptyState("Sélectionnez une conversation","Les messages apparaîtront ici.")
      );
    }
  };

  draw();
  return root;
}
