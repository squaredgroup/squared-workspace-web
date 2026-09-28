import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWorkspace, collectionInsights } from "../js/data-insights.js";

const now=new Date("2026-09-28T12:00:00Z");

test("analyse uniquement les données réelles du snapshot",()=>{
  const report=analyzeWorkspace({
    tasks:[
      {id:"1",title:"Préparer la revue",status:"active",assigneeId:"u1",dueAt:"2026-09-28",updatedAt:"2026-09-28T08:00:00Z"},
      {id:"2",title:"Corriger le contrat",status:"pending",dueAt:"2026-09-20",updatedAt:"2026-08-01T08:00:00Z"}
    ],
    projects:[{id:"p1",title:"Workspace",status:"active",assigneeId:"u1",updatedAt:"2026-09-27T08:00:00Z"}]
  },now);
  assert.equal(report.total,3);
  assert.equal(report.overdue,1);
  assert.equal(report.unassigned,1);
  assert.equal(report.stale,1);
  assert.equal(report.domains,2);
  assert.ok(report.score<100);
});

test("un snapshot vide ne prétend pas avoir un score parfait",()=>{
  const report=analyzeWorkspace({},now);
  assert.equal(report.total,0);
  assert.equal(report.score,null);
  assert.equal(report.status,"empty");
});

test("les indicateurs de collection distinguent actif, retard et statut",()=>{
  const report=collectionInsights([
    {id:"1",status:"active",dueAt:"2026-09-20"},
    {id:"2",status:"completed",dueAt:"2026-09-18"},
    {id:"3",status:"pending",dueAt:"2026-10-01",assigneeId:"u1"}
  ],now);
  assert.deepEqual(report,{total:3,active:2,overdue:1,unassigned:1,statuses:3});
});
