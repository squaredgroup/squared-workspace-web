import { describe, expect, it } from "vitest";
import { stateCopy, workspaceVersion } from "../src/components";

describe("fondations Workspace", () => {
  it("expose une version produit explicite", () => {
    expect(workspaceVersion).toBe("7.0.0");
  });

  it("définit une copie utilisateur pour chaque état asynchrone", () => {
    expect(Object.keys(stateCopy)).toEqual(["idle", "loading", "success", "empty", "error"]);
    for (const state of Object.values(stateCopy)) {
      expect(state.title.length).toBeGreaterThan(0);
      expect(state.description.length).toBeGreaterThan(0);
    }
  });
});
