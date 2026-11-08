import { state } from '../store.js';
import { h,modal,field,select,toast } from '../ui.js';
import { sendConversationMessage } from '../api.js';
import { textOf } from './components.js';
export function shareRecords(domain,rows){
 const conversations=state.workspace?.conversations||[],choice=select('',[{value:'',label:'Choisir une conversation'},...conversations.map(c=>({value:c.id,label:c.name||c.title||'Conversation'}))]),kind={projects:'project',missions:'mission',tasks:'task',events:'event',documents:'document',contracts:'contract',clients:'client',validations:'validation',deliverables:'deliverable',resources:'resource'}[domain];
 if(!kind)throw new Error('Ce type de référence ne peut pas être partagé dans un message.');modal({title:'Partager '+rows.length+' élément(s)',content:h('div',{class:'form'},field('Conversation destinataire',choice),h('p',{text:'Chaque élément sera envoyé avec un lien vers sa fiche, selon les droits du destinataire.'})),actions:[{label:'Partager',kind:'primary',onClick:async close=>{if(!choice.value)return;for(const row of rows)await sendConversationMessage(choice.value,textOf(row),null,{linkedContext:{entityKind:kind,entityID:row.id,title:textOf(row),subtitle:domain,projectID:row.projectID||row.parentId||null}});toast('Éléments partagés');close();}}]});
}
