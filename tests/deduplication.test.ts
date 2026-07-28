import { describe, it, expect } from "vitest";
import { findDuplicatePairs } from "../src/memory/deduplication";
import { makeMemory } from "./helpers";

describe("findDuplicatePairs", () => {
  it("najde dvojici téměř identických vzpomínek napříč celým seznamem", () => {
    const a = makeMemory({ text: "Vlastním B2B úklidovou firmu v Brně" });
    const b = makeMemory({ text: "Vlastním B2B úklidovou firmu v Brně." });
    const unrelated = makeMemory({ text: "Preferuji odpovědi v češtině" });

    const pairs = findDuplicatePairs([a, unrelated, b]);

    expect(pairs).toHaveLength(1);
    expect([pairs[0]?.a.id, pairs[0]?.b.id]).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("nehlásí nic, pokud žádné vzpomínky nejsou duplicitní", () => {
    const memories = [
      makeMemory({ text: "Preferuje odpovědi v češtině" }),
      makeMemory({ text: "Vlastní firmu v Brně" }),
      makeMemory({ text: "Má dvě děti" }),
    ];
    expect(findDuplicatePairs(memories)).toHaveLength(0);
  });

  it("najde více nezávislých dvojic zároveň", () => {
    const a1 = makeMemory({ text: "Preferuje češtinu" });
    const a2 = makeMemory({ text: "Preferuje češtinu." });
    const b1 = makeMemory({ text: "Vlastní firmu v Brně" });
    const b2 = makeMemory({ text: "Vlastní firmu v Brně." });

    const pairs = findDuplicatePairs([a1, b1, a2, b2]);
    expect(pairs).toHaveLength(2);
  });

  it("prázdný nebo jednoprvkový seznam nevrátí žádné dvojice", () => {
    expect(findDuplicatePairs([])).toHaveLength(0);
    expect(findDuplicatePairs([makeMemory()])).toHaveLength(0);
  });
});
