import { state } from '../store.js';
import { listSpecialized } from '../api.js';
import { h,button,pageHeader,modal,emptyState,formatDate } from '../ui.js';
import { formatMoney } from '../money.js';
import { call } from './api.js';
import { contracts,openOperation,renderWorkflowGroup } from './workflows.js';
import { dataTable,displayValue,statusDot,labelFor,hasAny } from './components.js';
export async function editFinancialDocument(kind,record=null,onSaved=()=>window.dispatchEvent(new Event('sq:refresh'))){
 const catalog=await contracts(),op=catalog.operations.find(o=>o.path==='/v1/workflows/finance/:kind'&&o.method==='POST');let context={kind,currency:'EUR',issuedAt:new Date().toISOString(),dueAt:new Date(Date.now()+30*86400000).toISOString(),lines:[{id:crypto.randomUUID(),description:'',quantity:1,unitPrice:0,taxPercent:0,discountPercent:0}]};
 const [entities,offers,products]=await Promise.all([listSpecialized('legal-entities'),listSpecialized('service-offerings').catch(()=>[]),listSpecialized('products').catch(()=>[])]);context.legalEntities=entities;context.offers=offers;context.products=products;
 if(record){const detail=await call(`/v1/workflows/finance/${kind}/${record.id}`),header=(detail.records||[]).find(r=>r.kind===kind)||record;context={...context,...header.data,...header,id:record.id,kind,legalEntities:entities,lines:(detail.records||[]).filter(r=>r.kind===(kind==='quotes'?'quote-lines':'invoice-lines')).map(r=>({...r.data,id:r.id,unitPrice:Number(r.data.unitPrice?.amount??r.data.unitPrice??0)}))};}
 return openOperation(op,{context,onComplete:onSaved});
}
export async function renderFinancialDocuments(kind){
 const root=h('div',{class:'sq-pane'}),content=h('div'),catalog=await contracts(),write=hasAny(kind==='quotes'?'manageSales':'manageFinance');
 const reload=async()=>{const rows=await listSpecialized(kind),ops=catalog.operations.filter(o=>o.path.includes('/finance/')&&(o.path.includes('/:kind/')||o.path.includes('/'+kind+'/'))&&o.path.includes('/:id'));
 const actions=r=>[{label:'Fiche et lignes',icon:'document',group:'Consulter',run:async()=>{const data=await call(`/v1/workflows/finance/${kind}/${r.id}`);modal({title:r.title,content:displayValue(data),wide:true});}},...(['draft','internalReview'].includes(r.status)&&write?[{label:'Modifier le brouillon',icon:'edit',group:'Gérer',run:()=>editFinancialDocument(kind,r,reload)}]:[]),...ops.filter(o=>o.readOnly||write).map(o=>({label:o.path.endsWith('/pdf')?'Exporter en PDF':o.path.endsWith('/state')?'Changer d’état':o.path.endsWith('/convert')?'Convertir en facture':o.path.endsWith('/payments')?'Enregistrer un règlement':labelFor(o.path.split('/').at(-1)),icon:o.path.endsWith('/pdf')?'download':'sync',group:o.readOnly?'Consulter':'Circuit métier',run:()=>openOperation(o,{context:{...r.data,...r,kind},onComplete:reload})}))];
 content.replaceChildren(dataTable({rows,name:kind,columns:[{id:'title',label:kind==='quotes'?'Devis':'Facture'},{id:'reference',label:'Référence',value:r=>r.data?.reference||'Brouillon'},{id:'status',label:'Statut',render:r=>statusDot(r.status,labelFor(r.status))},{id:'total',label:'Total',value:r=>formatMoney(r.data?.total,r.data?.currency)},{id:'due',label:'Échéance',value:r=>formatDate(r.data?.dueAt||r.data?.validUntil)}],onOpen:r=>actions(r)[0].run(),actions}));};
 root.append(pageHeader({eyebrow:'Finance',title:kind==='quotes'?'Devis & ventes':'Factures clients',subtitle:'Brouillons, lignes de catalogue, états, PDF et règlements dans les circuits serveur.',actions:write?[button(kind==='quotes'?'Nouveau devis':'Nouvelle facture',{kind:'primary',iconName:'add',onClick:()=>editFinancialDocument(kind,null,reload)})]:[]}),content);await reload();return root;
}
