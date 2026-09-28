import { assigneeOf, dueBucket, isFinished, normalize, statusOf, titleOf, valueOf } from "./focus-model.js";

const DOMAINS = ["projects","missions","tasks","events","validations","deliverables","documents","contracts","clients","resources","notifications"];
const ASSIGNABLE = new Set(["projects","missions","tasks","events","deliverables"]);
const DATED = new Set(["missions","tasks","events","validations","deliverables","contracts"]);
const timestampOf = record => valueOf(record,"updatedAt","updated_at","modifiedAt","modified_at","createdAt","created_at");

export function workspaceRecords(workspace={}){
  return DOMAINS.flatMap(domain=>(Array.isArray(workspace?.[domain])?workspace[domain]:[]).map(record=>({domain,record})));
}

export function analyzeWorkspace(workspace={},now=new Date()){
  const entries=workspaceRecords(workspace),active=entries.filter(({record})=>!isFinished(record));
  const missingTitle=entries.filter(({record})=>!normalize(titleOf(record))||titleOf(record)==="Sans titre");
  const unassigned=active.filter(({domain,record})=>ASSIGNABLE.has(domain)&&!assigneeOf(record));
  const undated=active.filter(({domain,record})=>DATED.has(domain)&&dueBucket(record,now)==="undated");
  const overdue=active.filter(({domain,record})=>DATED.has(domain)&&dueBucket(record,now)==="overdue");
  const stale=active.filter(({record})=>{
    const raw=timestampOf(record),date=raw?new Date(raw):null;
    return date&&Number.isFinite(date.getTime())&&now.getTime()-date.getTime()>30*864e5;
  });
  const duplicateKeys=new Map();
  for(const {domain,record} of entries){
    const title=normalize(titleOf(record));if(!title||title==="sans titre")continue;
    const key=`${domain}:${title}`;duplicateKeys.set(key,(duplicateKeys.get(key)||0)+1);
  }
  const duplicates=[...duplicateKeys.values()].filter(count=>count>1).reduce((sum,count)=>sum+count,0);
  const issueWeight=missingTitle.length*3+overdue.length*2+unassigned.length+undated.length*.5+stale.length*.5+duplicates;
  const denominator=Math.max(1,active.length*4);
  const score=entries.length?Math.max(0,Math.round(100-Math.min(100,issueWeight/denominator*100))):null;
  const latest=entries.map(({record})=>timestampOf(record)).filter(Boolean).map(value=>new Date(value)).filter(value=>Number.isFinite(value.getTime())).sort((a,b)=>b-a)[0]||null;
  const domains=DOMAINS.filter(domain=>Array.isArray(workspace?.[domain])&&workspace[domain].length>0);
  return {
    total:entries.length,active:active.length,domains:domains.length,score,latest,
    missingTitle:missingTitle.length,unassigned:unassigned.length,undated:undated.length,incomplete:missingTitle.length+unassigned.length+undated.length+duplicates,
    overdue:overdue.length,stale:stale.length,duplicates,
    healthy:score!==null&&score>=85,
    status:score===null?"empty":score>=85?"healthy":score>=65?"attention":"critical"
  };
}

export function collectionInsights(items=[],now=new Date()){
  const active=items.filter(item=>!isFinished(item));
  const overdue=active.filter(item=>dueBucket(item,now)==="overdue").length;
  const unassigned=active.filter(item=>!assigneeOf(item)).length;
  const statuses=new Set(items.map(statusOf).filter(Boolean));
  return {total:items.length,active:active.length,overdue,unassigned,statuses:statuses.size};
}
