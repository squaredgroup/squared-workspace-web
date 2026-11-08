// Mirrors WorkspaceDashboardProjection.swift. No synthetic totals or chart points.
import { valueOf,dayKey } from '../focus-model.js';
const rows=value=>Array.isArray(value)?value:[];
const unique=list=>[...new Map(rows(list).map(row=>[row.id,row])).values()];
const id=value=>String(value||'').toLowerCase();
const read=(row,...keys)=>valueOf(row,...keys);
const number=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value?.amount??value);return Number.isFinite(n)?n:null;};
const time=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:null;};
export function activeUnreadNotifications(snapshot,user,now=new Date()){
 const metadata=new Map(rows(snapshot?.enterprise?.notificationMetadata).map(row=>[id(row.notificationID),row])),userID=id(user?.id),archived=new Set(rows(snapshot?.intelligence?.archivedEntityIDs).map(id));
 return rows(snapshot?.notifications).filter(raw=>{const row={...raw,...raw.payload},meta=metadata.get(id(row.id));if(archived.has(id(row.id))||meta?.isArchived||time(meta?.snoozedUntil)>now.getTime())return false;const recipients=rows(row.recipientIDs).map(id);if(recipients.length&&!recipients.includes(userID))return false;return Array.isArray(row.readBy)?!row.readBy.map(id).includes(userID):!(row.isRead??row.is_read);});
}
export function dashboardProjection(snapshot={},user={},settings={},now=new Date()){
 const operational=snapshot.intelligence||{},archived=new Set(rows(operational.archivedEntityIDs).map(id)),visible=row=>!archived.has(id(row.id)),projects=unique(snapshot.projects).filter(row=>visible(row)&&!['completed','cancelled','rejected'].includes(read(row,'status'))),allTasks=unique(snapshot.tasks).filter(visible);
 const tasks=allTasks.filter(row=>read(row,'isDone')!==true),validations=unique(snapshot.validations).filter(row=>visible(row)&&read(row,'status')==='pending'),today=dayKey(now),tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);tomorrow.setHours(0,0,0,0);
 const todayTasks=tasks.filter(row=>read(row,'dueAt')?dayKey(read(row,'dueAt'))===today:/aujourd/i.test(read(row,'dueDate'))),urgentValidations=validations.filter(row=>time(read(row,'dueAt'))!==null?time(read(row,'dueAt'))<tomorrow.getTime():/aujourd/i.test(read(row,'dueDate')));
 const events=unique(snapshot.events).filter(row=>{if(!visible(row)||['cancelled','rejected','completed'].includes(read(row,'status')))return false;const starts=time(read(row,'startsAt','startAt','start_at')),ends=time(read(row,'endsAt','endAt','end_at'))??starts;return starts!==null&&ends>=starts&&ends>=now.getTime();}).sort((a,b)=>time(read(a,'startsAt','startAt'))-time(read(b,'startsAt','startAt')));
 const availableProjects=new Set(rows(snapshot.projects).filter(visible).map(row=>id(row.id))),finances=unique(operational.finances).filter(row=>availableProjects.has(id(row.projectID))),budgets=new Map();let excludedFinanceCount=0;
 for(const row of finances){const currency=String(row.currency||'').toUpperCase(),planned=number(row.planned),committed=number(row.committed);try{if(!/^[A-Z]{3}$/.test(currency)||(Intl.supportedValuesOf&&!Intl.supportedValuesOf('currency').includes(currency))||planned===null||committed===null)throw Error();new Intl.NumberFormat('fr-FR',{style:'currency',currency});}catch{excludedFinanceCount++;continue;}const total=budgets.get(currency)||{currency,planned:0,committed:0};total.planned+=planned;total.committed+=committed;budgets.set(currency,total);}
 const currencyBudgets=[...budgets.values()].sort((a,b)=>a.currency.localeCompare(b.currency)).map(row=>({...row,remaining:row.planned-row.committed,remainingRatio:row.planned>0?(row.planned-row.committed)/row.planned:null}));
 const profiles=rows(operational.memberProfiles),capacity=profiles.reduce((sum,row)=>sum+(number(row.weeklyCapacityHours)||0),0),allocated=profiles.reduce((sum,row)=>sum+(number(row.allocatedHours)||0),0),risks=rows(operational.risks).filter(row=>number(row.score)>=.6&&row.status!=='completed'&&!archived.has(id(row.projectID))),progress=projects.length?projects.reduce((sum,row)=>sum+Math.max(0,Math.min(1,number(read(row,'progress'))||0)),0)/projects.length:null;
 const cutoff=now.getTime()-Math.max(1,number(settings.dashboardDefaultPeriodDays)||30)*86400000;
 const metricSamples=name=>rows(snapshot.enterprise?.metricSamples).filter(row=>row.metric===name&&number(row.value)!==null&&time(row.recordedAt)>=cutoff).sort((a,b)=>time(a.recordedAt)-time(b.recordedAt));
 const conversations=rows(snapshot.conversations).filter(visible),unread=conversations.reduce((sum,row)=>sum+(number(read(row,'unread'))||0),0);
 return{projects,tasks,todayTasks,validations,urgentValidations,events,activities:rows(snapshot.activities),deliverables:rows(snapshot.deliverables),risks,unread,currencyBudgets,excludedFinanceCount,capacity,utilization:capacity>0?allocated/capacity:null,progress,metricSamples,archived};
}
