import assert from "node:assert/strict";
import test from "node:test";

globalThis.location={origin:"https://workspace.app.squaredgroup.studio"};
const {activeAnnouncement,safePublicURL}=await import("../js/public-content.js");

test("les annonces respectent leur fenêtre de publication",()=>{
  const now=new Date("2026-09-21T12:00:00Z");
  assert.equal(activeAnnouncement({startsAt:"2026-09-20T12:00:00Z",endsAt:"2026-09-22T12:00:00Z"},now),true);
  assert.equal(activeAnnouncement({startsAt:"2026-09-22T12:00:00Z"},now),false);
  assert.equal(activeAnnouncement({endsAt:"2026-09-20T12:00:00Z"},now),false);
});

test("le prédicat ne plante pas lorsqu’il est utilisé directement par Array.filter",()=>{
  assert.equal([{title:"Information Workspace"}].filter(activeAnnouncement).length,1);
});

test("seuls les liens publics http et https sont acceptés",()=>{
  assert.equal(safePublicURL("javascript:alert(1)"),"");
  assert.equal(safePublicURL("https://docs.squaredgroup.studio/guide"),"https://docs.squaredgroup.studio/guide");
});
