import test from "node:test";
import assert from "node:assert/strict";
import { validatePlanningWeek } from "../js/personal-planning-model.js";

const slot = { id: "00000000-0000-4000-8000-000000000001", title: "Course", category: "running", weekdays: [0, 2], startMinute: 360, endMinute: 390, endsNextDay: false, isStartOnly: false, notes: "" };
const week = { version: 1, slots: [slot], footer: "", updatedAt: null };

test("la semaine native est acceptée sans changer la structure du backend", () => assert.equal(validatePlanningWeek(week), ""));
test("les doublons de jours ou de créneaux sont rejetés avant synchronisation", () => {
  assert.match(validatePlanningWeek({ ...week, slots: [{ ...slot, weekdays: [0, 0] }] }), /doublon/);
  assert.match(validatePlanningWeek({ ...week, slots: [slot, { ...slot }] }), /double/);
});
test("un créneau qui traverse minuit exige la fin le lendemain", () => {
  assert.match(validatePlanningWeek({ ...week, slots: [{ ...slot, startMinute: 1380, endMinute: 60 }] }), /durée/i);
  assert.equal(validatePlanningWeek({ ...week, slots: [{ ...slot, startMinute: 1380, endMinute: 60, endsNextDay: true }] }), "");
});
