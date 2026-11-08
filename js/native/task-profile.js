import { state } from '../store.js';
import { loadWorkspace } from '../api.js';
import { call } from './api.js';
import { scope } from './components.js';
const comparable=value=>value===undefined?undefined:JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
export function taskProfile(id){return(state.workspace?.intelligence?.taskProfiles||[]).find(profile=>profile.taskID===id);}
export async function saveTaskProfile(id,baseline,{projectID,missionID,description,priority,estimateHours,tags,subtasks,dependencyIDs}){
 const actor=scope(),dependencies=[...new Set(dependencyIDs||[])],profiles=state.workspace?.intelligence?.taskProfiles||[];
 for(const dependency of dependencies){const task=(state.workspace?.tasks||[]).find(row=>row.id===dependency),profile=profiles.find(row=>row.taskID===dependency);if(dependency===id||!task||(task.projectID||task.payload?.projectID||profile?.projectID)!==projectID)throw Error('Les dépendances doivent appartenir au même projet et exclure cette tâche.');const pending=[dependency],seen=new Set();while(pending.length){const candidate=pending.pop();if(candidate===id)throw Error('Cette dépendance crée un cycle de tâches.');if(!seen.has(candidate)){seen.add(candidate);pending.push(...(profiles.find(row=>row.taskID===candidate)?.dependencyIDs||[]));}}}
 await loadWorkspace();if(actor!==scope())throw Error('Le compte a changé.');const before=taskProfile(id);if(comparable(before)!==comparable(baseline))throw Error('Le suivi de cette tâche a changé. Rechargez la fiche.');
 const same=JSON.stringify(before?.subtasks||[])===JSON.stringify(subtasks||[]),after={...before,taskID:id,projectID,missionID,description,priority,estimateHours:Number(estimateHours)||0,spentHours:before?.spentHours||0,tags:tags||[],subtasks:subtasks||[],completedSubtasks:same?Math.min(before?.completedSubtasks||0,(subtasks||[]).length):0,dependencyIDs:dependencies,isRecurring:before?.isRecurring||false};if(!same)delete after.completedSubtaskIndices;
 await call('/v1/workspace/mutations',{method:'POST',body:{operations:[{path:[{key:'intelligence'},{key:'taskProfiles'},{identityKey:'taskID',identityValue:id}],beforeExists:!!before,...(before?{before}:{}),afterExists:true,after}]},operationID:crypto.randomUUID()});
 return after;
}
