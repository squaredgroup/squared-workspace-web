import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { SQUARED_CONFIG: {} };
globalThis.location = { origin: "https://workspace.example.invalid" };

const { NAV_AREAS, SECTIONS, navigationAreaForSection } = await import("../js/config.js");

test("la sidebar reprend les neuf espaces principaux de l’app native", () => {
  assert.deepEqual(NAV_AREAS.map(area => area.title), [
    "Tableau de bord", "Projets", "Calendrier", "Finance", "Relations",
    "Documents", "Communication", "Marketing", "Mes sites"
  ]);
  assert.equal(new Set(NAV_AREAS.map(area => area.id)).size, 9);
});

test("les anciennes routes CMS restent reliées à Mes sites", () => {
  for (const section of ["siteServices", "siteProducts", "siteReferences", "siteReleases", "sitePublications", "siteHelp", "siteMedia", "siteInbox", "siteNewsletter"]) {
    assert.equal(navigationAreaForSection(section)?.id, "sites", section);
  }
});

test("le studio CMS et le calendrier unifié exposent leur navigation interne", () => {
  assert.deepEqual(SECTIONS.webContent.subpages.map(page => page.id), ["overview", "contents", "pages", "media", "publications", "settings"]);
  assert.equal(SECTIONS.planning.title, "Calendrier");
  assert.equal(SECTIONS.planning.subpages[0].id, "calendar");
});
