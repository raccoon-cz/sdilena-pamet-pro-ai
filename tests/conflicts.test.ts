import { describe, it, expect } from "vitest";
import { findProfileConflicts, resolveProfileConflicts } from "../src/importExport/conflicts";
import { makeProfile } from "./helpers";

describe("findProfileConflicts", () => {
  it("najde profil se stejným ID, ale jiným názvem", () => {
    const existing = makeProfile({ id: "p1", name: "Osobní" });
    const incoming = makeProfile({ id: "p1", name: "Práce" });

    const conflicts = findProfileConflicts([existing], [incoming]);

    expect(conflicts).toEqual([
      { id: "p1", existingName: "Osobní", incomingName: "Práce" },
    ]);
  });

  it("nehlásí nic, pokud se ID i název shodují", () => {
    const existing = makeProfile({ id: "p1", name: "Osobní" });
    const incoming = makeProfile({ id: "p1", name: "Osobní" });
    expect(findProfileConflicts([existing], [incoming])).toHaveLength(0);
  });

  it("nehlásí nic pro profil s novým ID (žádný konflikt, jen nový profil)", () => {
    const existing = makeProfile({ id: "p1", name: "Osobní" });
    const incoming = makeProfile({ id: "p2", name: "Práce" });
    expect(findProfileConflicts([existing], [incoming])).toHaveLength(0);
  });
});

describe("resolveProfileConflicts", () => {
  it("použije stávající název, když je zvoleno 'existing'", () => {
    const existing = makeProfile({ id: "p1", name: "Osobní" });
    const incoming = makeProfile({ id: "p1", name: "Práce" });
    const resolved = resolveProfileConflicts(
      [incoming],
      [existing],
      new Map([["p1", "existing"]]),
    );
    expect(resolved[0]?.name).toBe("Osobní");
  });

  it("ponechá importovaný název, když je zvoleno 'incoming'", () => {
    const existing = makeProfile({ id: "p1", name: "Osobní" });
    const incoming = makeProfile({ id: "p1", name: "Práce" });
    const resolved = resolveProfileConflicts(
      [incoming],
      [existing],
      new Map([["p1", "incoming"]]),
    );
    expect(resolved[0]?.name).toBe("Práce");
  });

  it("beze změny ponechá profily bez zaznamenaného rozhodnutí", () => {
    const incoming = makeProfile({ id: "p1", name: "Práce" });
    const resolved = resolveProfileConflicts([incoming], [], new Map());
    expect(resolved[0]?.name).toBe("Práce");
  });
});
