import { h,button,field,input,select,textarea,card,emptyState,modal,call,stack,actions,notice,toggle,confirmDialog,uid,clone,choices,state,setRoute } from './operation-kit.js';
import { openMailComposer } from '../modules/mail-composer.js';
const base='/v1/site-integration';
const categories=[['general','Question générale'],['project','Projet ou devis'],['partnership','Partenariat'],['press','Presse'],['support','Assistance'],['newsletter','Newsletter'],['unclassified','Usage à qualifier']];
const states=[['new','Nouvelle'],['inProgress','En cours'],['qualified','Qualifiée'],['processed','Traitée'],['archived','Archivée'],['deleted','Retirée de Workspace']];
const opts=(values,all=false)=>[...(all?[{value:'',label:'Tous'}]:[]),...values.map(([value,label])=>({value,label}))];
const stringify=v=>v===null||v===undefined?'Non renseigné':Array.isArray(v)?v.map(stringify).join(', '):typeof v==='object'?Object.entries(v).map(([k,v])=>k+' : '+stringify(v)).join('\n'):String(v);
function editable(title,body,render,save,{danger=false}={}){
 const content=stack(),feedback=h('div');let busy=false;
 render(content,body);content.append(feedback);
 const dialog=modal({title,content,wide:true,beforeClose:()=>!busy,actions:[button('Fermer',{onClick:()=>dialog.close()}),button('Enregistrer',{kind:'primary',onClick:async()=>{
  if(busy)return;if(![...content.querySelectorAll('input,select,textarea')].every(e=>e.checkValidity())){content.querySelector(':invalid')?.reportValidity();return;}
  if(danger&&!await confirmDialog({title:'Confirmer l’action Wix',message:'Cette opération peut modifier le site, supprimer définitivement des données ou déclencher les automatisations Wix associées. Vérifiez l’action sélectionnée et son contenu.',danger:true}))return;
  busy=true;feedback.replaceChildren(notice('Enregistrement…'));
  try{await save(body);dialog.close();}catch(e){feedback.replaceChildren(notice(e.message,'error'));}finally{busy=false;}
 }})]});return dialog;
}
function controls(root,d,specs){
 for(const spec of specs){const[label,key,type='text',options]=spec;
  if(type==='check'){root.append(toggle(label,d[key],v=>d[key]=v));continue;}
  const control=type==='select'?select(d[key]??'',options):type==='long'?textarea(d[key]??'',{rows:5}):input(d[key]??'',{type:type==='number'?'number':type});
  control.addEventListener(type==='select'?'change':'input',()=>d[key]=type==='number'?Number(control.value):control.value);root.append(field(label,control));
 }
}
function answerControls(root,fields,values){
 for(const f of fields){if(f.readOnly){root.append(h('p',{text:f.label+' : '+stringify(values[f.key])}));continue;}
  if(f.inputType==='ARRAY'){root.append(h('strong',{text:f.label}));for(const o of f.options||[])root.append(toggle(o.label,(values[f.key]||[]).includes(o.value),checked=>{values[f.key]=(values[f.key]||[]).filter(v=>v!==o.value);if(checked)values[f.key].push(o.value);}));}
  else if(f.inputType==='BOOLEAN')root.append(toggle(f.label,values[f.key],v=>values[f.key]=v));
  else if(f.inputType==='STRING'&&(f.options||[]).length)controls(root,values,[[f.label,f.key,'select',[{value:'',label:'Choisir'},...f.options.map(o=>({value:o.value,label:o.label}))]]]);
  else if(['STRING','NUMBER'].includes(f.inputType))controls(root,values,[[f.label,f.key,f.inputType==='NUMBER'?'number':f.kind==='CONTACTS_EMAIL'?'email':f.kind==='TEXT_AREA'?'long':'text']]);
  else root.append(notice(f.label+' : ce type avancé se modifie dans Wix. Sa valeur sera conservée.'));
 }
}
export async function renderSiteIntegration(initial='requests'){
 let meta=await call(base),section=initial,offset=0,next=null,filters={},records=[];
 const root=stack(),header=h('div'),feedback=h('div'),content=stack(),navigation=select(section,opts([['requests','Demandes'],['forms','Formulaires'],['contacts','Contacts'],['bookings','Réservations'],['automations','E-mails et rappels'],['settings','Connexion']]));
 const permissions=()=>meta.permissions||{},connection=()=>meta.connections?.[0],members=()=>choices(meta.members||[],'Non affecté');
 const command=async(path,body={},method='POST')=>call(base+path,{method,body});
 const refresh=async(append=false)=>{try{meta=await call(base);await draw(append);}catch(e){feedback.replaceChildren(notice(e.message,'error'));}};
 const act=(label,fn)=>button(label,{onClick:async()=>{try{const result=await fn();if(result?.message)feedback.replaceChildren(notice(result.message));await refresh();}catch(e){feedback.replaceChildren(notice(e.message,'error'));}}});
 root.append(h('h1',{text:'Squared Group · Wix'}),field('Espace',navigation),header,feedback,content);
 navigation.addEventListener('change',()=>{section=navigation.value;offset=0;records=[];void refresh();});
 function contactEditor(id,connectionID){
  const open=contact=>{const info=contact?.info||{},body={operationID:uid(),connectionID,action:id?'update':'create',...(id?{id,revision:contact.revision}:{}),firstName:info.name?.first||'',lastName:info.name?.last||'',company:info.company||'',email:info.emails?.items?.find(v=>v.primary)?.email||contact?.primaryInfo?.email||'',confirmed:true};
   editable('Contact Wix',body,(r,d)=>{controls(r,d,[['Prénom','firstName'],['Nom','lastName'],['Organisation','company'],['E-mail','email','email'],...(id?[['Action','action','select',opts([['update','Enregistrer'],['delete','Supprimer définitivement']])]]:[])]);r.append(notice('Les autres adresses, réglages et consentements sont conservés. Wix peut refuser la suppression d’un membre ou d’un contact facturé.'));},async d=>{if(!d.email)delete d.email;await command('/contacts/command',d);await refresh();},{danger:true});};
  if(id)void command('/contacts/command',{operationID:uid(),connectionID,action:'read',id}).then(v=>open(v.contact)).catch(e=>feedback.replaceChildren(notice(e.message,'error')));else open(null);
 }
 async function requestEditor(row){
  const current=await call(base+'/requests/'+row.id),r=current.request;
  const body={version:r.version,category:r.category,state:r.state,priority:r.priority,ownerID:r.owner_id||'',dueAt:r.due_at?r.due_at.slice(0,16):'',notes:r.notes,internalValues:clone(r.internal_values),confirmed:true};
  editable('Traiter la demande',body,(pane,d)=>{
   const source=r.source_snapshot?.submissions||{};
   pane.append(notice('Reçue le '+r.received_at+' · Wix '+r.source_id));
   for(const[k,v]of Object.entries(source))pane.append(h('strong',{text:r.labels[k]||k}),h('p',{text:stringify(v)}));
   controls(pane,d,[['Catégorie','category','select',opts(categories)],['État','state','select',opts(states)],['Priorité','priority','select',opts([['low','Faible'],['normal','Normale'],['high','Élevée'],['urgent','Urgente']])],['Responsable','ownerID','select',members()],['Échéance (heure UTC)','dueAt','datetime-local'],['Notes internes','notes','long']]);
   pane.append(h('h3',{text:'Corrections internes'}));
   for(const[k,v]of Object.entries(source))if(typeof v==='string'){const i=input(d.internalValues[k]??v);i.addEventListener('input',()=>d.internalValues[k]=i.value);pane.append(field(r.labels[k]||k,i));}
   if(permissions().manageForms)pane.append(actions(button('Modifier la soumission Wix',{onClick:()=>submissionEditor(meta.forms.find(f=>f.wix_id===r.form_id),r)}),r.contact_source_id?button('Gérer le contact Wix',{onClick:()=>contactEditor(r.contact_source_id,r.connection_id)}):null));
   pane.append(act('Qualifier dans le CRM',()=>command('/requests/'+r.id+'/qualify',{version:r.version})),button('Répondre dans Mail Workspace',{onClick:()=>{const email=source.email||source.email_adress||source.e_mail_03e2||source.email_443e;openMailComposer(()=>{},null,{toEmails:email?[email]:[],subject:'Votre demande auprès de Squared Group'});} }));
   const details=h('details',{},h('summary',{text:'Historique et contenu d’origine'}),h('p',{text:stringify(r.original_snapshot?.submissions)}));
   for(const event of current.history)details.append(h('p',{text:event.created_at+' · '+event.action}));pane.append(details);
  },async d=>{d.ownerID||=null;d.dueAt=d.dueAt?new Date(d.dueAt+'Z').toISOString():null;if(d.state==='deleted'&&!await confirmDialog({title:'Retirer de Workspace ?',message:'La soumission Wix et l’historique sont conservés.',danger:true}))return;await command('/requests/'+r.id,d,'PUT');await refresh();});
 }
 function submissionEditor(f,r){
  if(!f)return;const body={operationID:uid(),connectionID:f.connection_id,action:r?'update':'create',formID:f.wix_id,...(r?{id:r.source_id,revision:r.source_revision}:{}),values:clone(r?.source_snapshot?.submissions||{}),confirmed:true};
  editable('Soumission Wix',body,(root,d)=>{root.append(notice('Une création peut déclencher les envois Wix existants. La suppression retire définitivement la soumission de Wix.'));if(r)controls(root,d,[['Action','action','select',opts([['update','Enregistrer dans Wix'],['delete','Supprimer de Wix']])]]);answerControls(root,f.fields,d.values);},async d=>{await command('/submissions/command',d);await refresh();},{danger:true});
 }
 function formEditor(f){
  const body={operationID:uid(),connectionID:f?.connection_id||connection()?.id,action:f?'update':'create',...(f?{id:f.wix_id,revision:f.revision,enabled:f.enabled??true}:{}),name:f?.name||'',confirmed:true};
  editable('Formulaire Wix',body,(r,d)=>{
   controls(r,d,[['Nom','name'],...(f?[['Actif','enabled','check'],['Action','action','select',opts([['update','Enregistrer'],['delete','Mettre à la corbeille Wix']])]]:[])]);
   r.append(notice('Schéma et insertion sur une page sont distincts. Un formulaire créé ici reste désactivé jusqu’à sa configuration. Sa publication dans Wix Studio doit être vérifiée. Une suppression conserve le schéma 90 jours dans la corbeille Wix avant suppression définitive de ses soumissions.'));
   if(f){for(const field of f.fields)r.append(button(field.label,{onClick:()=>fieldEditor(f,field)}));r.append(button('Ajouter un champ',{onClick:()=>fieldEditor(f)}),button('Créer une soumission manuelle',{onClick:()=>submissionEditor(f)}));
    const routing={category:f.routing?.category||'',ownerID:f.routing?.ownerID||''};controls(r,routing,[['Routage des prochaines demandes','category','select',opts(categories,true)],['Responsable par défaut','ownerID','select',members()]]);r.append(act('Enregistrer le routage',()=>command('/forms/'+f.id+'/routing',{category:routing.category||null,ownerID:routing.ownerID||null},'PUT')));
   }
  },async d=>{await command('/forms/command',d);await refresh();},{danger:true});
 }
 function fieldEditor(form,f){
  const body={id:f?.id||uid(),key:f?.key||'',label:f?.label||'',kind:f?.kind||'TEXT_INPUT',required:f?.required||false,hidden:f?.hidden||false,remove:false,position:form.fields.findIndex(v=>v.id===f?.id),minLength:f?.validation?.minLength||0,maxLength:f?.validation?.maxLength||0,minimum:f?.validation?.minimum,maximum:f?.validation?.maximum,choices:(f?.options||[]).map(o=>o.label+'='+o.value).join('\n')};if(body.position<0)body.position=form.fields.length;
  editable('Champ Wix',body,(r,d)=>{controls(r,d,[['Libellé','label'],...(!f?[['Clé stable (minuscules, underscores)','key']]:[]),['Type','kind','select',opts(['TEXT_INPUT','TEXT_AREA','CONTACTS_EMAIL','URL_INPUT','NUMBER_INPUT','DATE_INPUT','TIME_INPUT','DROPDOWN','RADIO_GROUP','CHECKBOX_GROUP','CHECKBOX'].map(v=>[v,v]))],['Obligatoire','required','check'],['Masqué','hidden','check'],['Retirer ce champ','remove','check'],['Position (à partir de zéro)','position','number'],['Longueur minimale','minLength','number'],['Longueur maximale (0 : inchangée)','maxLength','number'],['Valeur minimale (nombre)','minimum','number'],['Valeur maximale (nombre)','maximum','number'],['Choix : un libellé=valeur par ligne','choices','long']]);r.append(notice('La clé existante, les champs non modifiés et leurs réglages inconnus sont conservés. Un type avancé non pris en charge doit être modifié dans Wix.'));},async d=>{
   const field={id:d.id,...(!f?{key:d.key}:{}),label:d.label,kind:d.kind,required:d.required,hidden:d.hidden,remove:d.remove,position:d.position};
   if(['DROPDOWN','RADIO_GROUP','CHECKBOX_GROUP'].includes(d.kind))field.options=d.choices.split('\n').filter(Boolean).map(line=>{const i=line.indexOf('='),label=i<0?line:line.slice(0,i),value=i<0?line:line.slice(i+1);return{id:f?.options?.find(o=>o.value===value)?.id||uid(),label,value};});
   field.validation=d.kind==='NUMBER_INPUT'?Object.fromEntries(['minimum','maximum'].filter(k=>Number.isFinite(d[k])).map(k=>[k,d[k]])):{minLength:d.minLength,...(d.maxLength?{maxLength:d.maxLength}:{})};
   await command('/forms/command',{operationID:uid(),connectionID:form.connection_id,action:'update',id:form.wix_id,revision:form.revision,field,confirmed:true});await refresh();
  },{danger:true});
 }
 function typeEditor(t){
  const d=t?{id:t.id,connectionID:t.connection_id,version:t.version,title:t.title,description:t.description,durationMinutes:t.duration_minutes,location:t.location,timezone:t.timezone,ownerID:t.owner_id,collaboratorIDs:clone(t.collaborator_ids),beforeMinutes:t.before_minutes,afterMinutes:t.after_minutes,noticeMinutes:t.notice_minutes,horizonDays:t.horizon_days,dailyLimit:t.daily_limit,weeklyLimit:t.weekly_limit,weekly:clone(t.weekly),exceptions:clone(t.exceptions),enabled:t.enabled,availabilityValidated:t.availability_validated}:{id:uid(),connectionID:connection()?.id,version:0,title:'',description:'',durationMinutes:30,location:'',timezone:'Europe/Paris',ownerID:'',collaboratorIDs:[],beforeMinutes:0,afterMinutes:0,noticeMinutes:1440,horizonDays:60,dailyLimit:4,weeklyLimit:20,weekly:[],exceptions:[],enabled:false,availabilityValidated:false};
  editable('Type de rendez-vous',d,(r,d)=>{
   controls(r,d,[['Titre','title'],['Description','description','long'],['Modalités et lieu','location'],['Fuseau IANA','timezone'],['Responsable','ownerID','select',members()],['Durée en minutes','durationMinutes','number'],['Pause avant','beforeMinutes','number'],['Pause après','afterMinutes','number'],['Préavis minimum en minutes','noticeMinutes','number'],['Horizon en jours','horizonDays','number'],['Limite par jour','dailyLimit','number'],['Limite par semaine','weeklyLimit','number']]);
   for(const m of meta.members||[])r.append(toggle('Collaborateur : '+m.name,d.collaboratorIDs.includes(m.id),checked=>{d.collaboratorIDs=d.collaboratorIDs.filter(v=>v!==m.id);if(checked)d.collaboratorIDs.push(m.id);}));
   r.append(notice(meta.calendarCoverage));const windows=stack(),exceptions=stack();
   const drawWeekly=()=>{windows.replaceChildren();for(const w of d.weekly){const row=stack();controls(row,w,[['Jour','weekday','select',opts(['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'].map((v,i)=>[String(i),v]))],['Début','start','time'],['Fin','end','time']]);row.append(button('Retirer',{onClick:()=>{d.weekly=d.weekly.filter(v=>v!==w);drawWeekly();}}));windows.append(row);}};
   const drawExceptions=()=>{exceptions.replaceChildren();for(const ex of d.exceptions){const row=stack();controls(row,ex,[['Date','date','date'],['Fermeture complète','closed','check']]);ex.windows||=[];if(!ex.closed&&!ex.windows.length)ex.windows.push({start:'',end:''});for(const window of ex.windows)controls(row,window,[['Début exceptionnel','start','time'],['Fin exceptionnelle','end','time']]);row.append(button('Ajouter une plage exceptionnelle',{onClick:()=>{ex.closed=false;ex.windows.push({start:'',end:''});drawExceptions();}}),button('Retirer cette exception',{onClick:()=>{d.exceptions=d.exceptions.filter(v=>v!==ex);drawExceptions();}}));exceptions.append(row);}};
   r.append(h('h3',{text:'Disponibilités hebdomadaires'}),windows,button('Ajouter une plage',{onClick:()=>{d.weekly.push({weekday:1,start:'',end:''});drawWeekly();}}),h('h3',{text:'Exceptions et fermetures'}),exceptions,button('Ajouter une exception',{onClick:()=>{d.exceptions.push({date:'',closed:true,windows:[]});drawExceptions();}}));drawWeekly();drawExceptions();
   controls(r,d,[['J’ai validé les horaires et la couverture','availabilityValidated','check'],['Ouvrir les réservations publiques','enabled','check'],...(t?[['Retirer ce type du catalogue, conserver ses rendez-vous','archive','check']]:[])]);
  },async d=>{if(d.archive){if(!await confirmDialog({title:'Retirer ce type ?',message:'Les réservations publiques sont fermées pour ce type. Les rendez-vous existants restent conservés et annulables.',danger:true}))return;await command('/booking-types/'+d.id,{version:d.version,confirmed:true},'DELETE');}else{delete d.archive;d.weekly.forEach(w=>w.weekday=Number(w.weekday));await command('/booking-types/'+d.id,d,'PUT');}await refresh();});
 }
 function bookingEditor(b,types){
  const d=b?{version:b.version,action:'reschedule',startsAt:b.starts_at.slice(0,16),confirmed:true}:{idempotencyKey:uid(),typeID:'',startsAt:'',name:'',email:'',context:'',requestID:'',clientID:'',projectID:''};
  editable(b?'Gérer le rendez-vous':'Créer un rendez-vous',d,(r,d)=>{if(b)r.append(h('p',{text:b.name+' · '+b.email+' · '+b.starts_at}));controls(r,d,b?[['Action','action','select',opts([['reschedule','Déplacer'],['cancel','Annuler et libérer le créneau'],['completed','Terminé'],['noShow','Absence']])],['Nouvel horaire UTC','startsAt','datetime-local']]:[['Type','typeID','select',choices(types)],['Horaire UTC','startsAt','datetime-local'],['Nom','name'],['E-mail','email','email'],['Contexte','context','long'],['Demande liée (ID facultatif)','requestID'],['Client lié (ID facultatif)','clientID'],['Projet lié (ID facultatif)','projectID']]);r.append(notice('Le serveur vérifie le créneau et le verrouille à la confirmation. Les anciens rappels sont annulés après déplacement ou annulation.'));},async d=>{if(d.startsAt)d.startsAt=new Date(d.startsAt+'Z').toISOString();for(const k of ['requestID','clientID','projectID'])if(!d[k])delete d[k];await command('/bookings'+(b?'/'+b.id:''),d);await refresh();},{danger:!!b});
 }
 function ruleEditor(rule){
  const d=rule?{id:rule.id,connectionID:rule.connection_id,version:rule.version,name:rule.name,enabled:rule.enabled,trigger:rule.trigger,recipient:rule.recipient,offsetMinutes:rule.offset_minutes,subject:rule.subject,body:rule.body,formID:rule.conditions.formID||'',category:rule.conditions.category||'',typeID:rule.conditions.typeID||'',senderOwner:rule.sender_owner,ownershipConfirmed:false}:{id:uid(),connectionID:connection()?.id,version:0,name:'',enabled:false,trigger:'booking.reminder',recipient:'visitor',offsetMinutes:-1440,subject:'Votre rendez-vous · {{title}}',body:'Bonjour {{name}}, votre rendez-vous aura lieu le {{startsAt}}. Gérer le rendez-vous : {{manageURL}}',formID:'',category:'',typeID:'',senderOwner:'wix',ownershipConfirmed:false};
  editable('Règle d’e-mail',d,(r,d)=>{controls(r,d,[['Nom','name'],['Déclencheur','trigger','select',opts(['form.received','request.internal','booking.confirmed','booking.reminder','booking.cancelled','booking.rescheduled','booking.followup'].map(v=>[v,v]))],['Destinataire','recipient','select',opts([['visitor','Visiteur'],['owner','Responsable']])],['Chargé de l’envoi','senderOwner','select',opts([['wix','Wix'],['workspace','Workspace']])],['Formulaire','formID','select',[{value:'',label:'Tous'},...(meta.forms||[]).map(f=>({value:f.wix_id,label:f.name}))]],['Catégorie','category','select',opts(categories,true)],['Type de rendez-vous (ID facultatif)','typeID'],['Minutes relatives au rendez-vous (négatif avant)','offsetMinutes','number'],['Objet','subject'],['Contenu','body','long'],['Inventaire Wix vérifié, aucun envoi concurrent','ownershipConfirmed','check'],['Active','enabled','check']]);const preview=h('div');r.append(notice('Variables : {{name}}, {{email}}, {{title}}, {{startsAt}}, {{timezone}}, {{location}}, {{context}}, {{manageURL}}. Aucun envoi marketing n’est créé ici.'),button('Aperçu avec données fictives',{onClick:async()=>{try{const p=await command('/automations/preview',{subject:d.subject,body:d.body});preview.replaceChildren(h('strong',{text:p.subject}),h('p',{text:p.body}));}catch(e){preview.replaceChildren(notice(e.message,'error'));}}}),preview);},async d=>{for(const k of ['formID','category','typeID'])d[k]||=null;await command('/automations/'+d.id,d,'PUT');await refresh();});
 }
 async function draw(append=false){
  content.replaceChildren();header.replaceChildren();next=null;
  if(section==='requests'){
   const controlsRoot=stack();controls(controlsRoot,filters,[['Rechercher','query'],['Formulaire','formID','select',[{value:'',label:'Tous'},...(meta.forms||[]).map(f=>({value:f.wix_id,label:f.name}))]],['Catégorie','category','select',opts(categories,true)],['État','state','select',opts(states,true)],['Responsable','ownerID','select',members()],['Depuis (UTC)','from','datetime-local'],['Jusqu’à (UTC)','until','datetime-local']]);header.append(controlsRoot,act('Filtrer',async()=>{offset=0;}));const q=new URLSearchParams({offset:String(offset)});for(const[k,v]of Object.entries(filters))if(v)q.set(k,['from','until'].includes(k)?new Date(v+'Z').toISOString():v);const data=await call(base+'/requests?'+q);records=append?[...records,...data.items]:data.items;next=data.nextOffset;
   for(const r of records)content.append(card(r.form_name,r.received_at+' · '+r.category+' · '+r.state,stack(h('p',{text:stringify(r.source_snapshot.submissions)}),button('Ouvrir et traiter',{onClick:()=>requestEditor(r).catch(e=>feedback.replaceChildren(notice(e.message,'error')))}))));
  }else if(section==='forms'){
   if(permissions().manageForms)header.append(actions(button('Créer un formulaire',{onClick:()=>formEditor()}),button('Créer un contact Wix',{onClick:()=>contactEditor(null,connection()?.id)})));
   for(const f of meta.forms||[])content.append(card(f.name,'Révision '+f.revision+' · Insertion sur le site à vérifier',stack(...f.fields.map(v=>h('p',{text:v.label+' · '+v.kind})),permissions().manageForms?button('Gérer le formulaire',{onClick:()=>formEditor(f)}):null)));
  }else if(section==='contacts'){
   controls(header,filters,[['Rechercher (correspondance exacte)','query']]);header.append(act('Rechercher',async()=>{offset=0;}),button('Créer un contact',{onClick:()=>contactEditor(null,connection()?.id)}));
   const d=await call(base+'/contacts?'+new URLSearchParams({query:filters.query||'',offset:String(offset)}));records=append?[...records,...d.items]:d.items;next=d.nextOffset;
   for(const c of records)content.append(card([c.info?.name?.first,c.info?.name?.last].filter(Boolean).join(' ')||'Contact Wix',c.primaryInfo?.email||'',button('Gérer le contact',{onClick:()=>contactEditor(c.id,c.connection_id)})));
  }else if(section==='bookings'){
   const d=await call(base+'/bookings?offset='+offset);records=append?[...records,...d.items]:d.items;next=d.nextOffset;header.append(notice(d.calendarCoverage));if(permissions().manageBooking)header.append(actions(button('Nouveau type',{onClick:()=>typeEditor()}),button('Rendez-vous manuel',{onClick:()=>bookingEditor(null,d.types)})));
   for(const t of d.types)content.append(card(t.title,t.enabled?'Ouvert au public':'Fermé au public',button('Horaires et paramètres',{onClick:()=>typeEditor(t)})));
   for(const b of records)content.append(card(b.title+' · '+b.name,b.starts_at+' · '+b.state,button('Gérer',{onClick:()=>bookingEditor(b,d.types)})));
  }else if(section==='automations'){
   const d=await call(base+'/automations?offset='+offset);records=append?[...records,...d.jobs]:d.jobs;next=d.nextOffset;if(permissions().manageRules)header.append(button('Nouvelle règle',{onClick:()=>ruleEditor()}));
   for(const rule of d.rules)content.append(card(rule.name,rule.trigger+' · '+rule.sender_owner+' · '+(rule.enabled?'active':'inactive'),button('Configurer et prévisualiser',{onClick:()=>ruleEditor(rule)})));
   for(const job of records)content.append(card(job.recipient,job.due_at+' · '+job.state,stack(job.error?notice(job.error,'warning'):null,['failed','uncertain'].includes(job.state)?act('Relancer après vérification',async()=>{if(await confirmDialog({title:'Relancer cet e-mail ?',message:'Confirmez que vous avez vérifié sa non-livraison chez le prestataire. Une relance d’un envoi incertain peut produire un doublon.',danger:true}))await command('/mail-jobs/'+job.id+'/retry',{confirmed:true,deliveryChecked:true});}):null)));
   const inventoryPane=h('details',{},h('summary',{text:'Inventaire des automatisations Wix'}));content.append(inventoryPane);if(permissions().manageConnection)inventoryPane.append(act('Actualiser l’inventaire Wix',()=>command('/connections/'+connection().id+'/inventory')));
   for(const c of d.inventory)for(const a of c.automation_inventory||[]){const controls=[];
    if(permissions().manageWixAutomations){controls.push(act('Lire l’état actuel',()=>command('/wix-automations/command',{operationID:uid(),connectionID:c.id,id:a.id,action:'readAutomation'})));
     if(a.trigger?.triggerKey==='wix_form_app-form_submitted'&&a.actions.some(v=>v.key==='triggered-emails'))controls.push(act('Désactiver cet envoi Wix',async()=>{if(!await confirmDialog({title:'Désactiver cet e-mail dans Wix ?',message:'Les nouveaux déclenchements seront empêchés. Les exécutions déjà en cours doivent être vérifiées avant de reprendre l’envoi dans Workspace. Les autres automatisations sont conservées.',danger:true}))return;return command('/wix-automations/command',{operationID:uid(),connectionID:c.id,id:a.id,action:'deactivate',confirmed:true});}));
    }inventoryPane.append(card(a.name,'État du catalogue : '+a.status+' · '+(a.trigger?.triggerKey||''),actions(...controls)));}
  }else{
   const c=connection();if(!c){header.append(act('Connecter Squared Group',()=>command('/connections',{siteID:'e257f003-4142-42fc-8146-cd6ed2c193dd'})));return;}
   header.append(notice('Dernière réussite complète : '+(c.last_success_at||'aucune')),notice(meta.webhook.message),notice(c.delivery_enabled?'Envois Workspace autorisés selon les règles activées.':'Envois Workspace désactivés.'));if(c.last_error)header.append(notice(c.last_error,'error'));
   if(permissions().manageConnection)header.append(actions(act('Relancer la synchronisation',()=>command('/connections/'+c.id+'/sync')),act('Inventorier Wix',()=>command('/connections/'+c.id+'/inventory')),act(c.delivery_enabled?'Désactiver les envois':'Activer les envois réels',async()=>{if(!c.delivery_enabled&&!await confirmDialog({title:'Activer les envois réels ?',message:'Les prochaines opérations pourront envoyer des messages aux visiteurs selon les règles activées. Vérifiez le partage avec Wix.'}))return;await command('/connections/'+c.id,{version:c.version,enabled:true,deliveryEnabled:!c.delivery_enabled,confirmed:true},'PUT');})));
   header.append(h('a',{href:'https://workspace.squaredgroup.studio/reservation',target:'_blank',rel:'noopener',text:'Ouvrir le parcours public'}));const d=await call(base+'/logs?offset='+offset);records=append?[...records,...d.items]:d.items;next=d.nextOffset;for(const l of records)content.append(h('p',{text:l.created_at+' · '+l.state+' · '+l.message}));
  }
  if(!content.childNodes.length)content.append(emptyState('Aucun élément','La connexion ne contient aucun élément pour cette vue.'));
  if(next!==null)content.append(button('Charger la suite',{onClick:async()=>{try{offset=next;await draw(true);}catch(e){feedback.replaceChildren(notice(e.message,'error'));}}}));
 }
 await draw();return root;
}
