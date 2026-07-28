import { describe, it, expect } from "vitest";
import {
  normalizeText,
  stripDiacritics,
  significantWords,
  suggestKeywords,
  stemWord,
} from "../src/shared/text";

describe("normalizeText", () => {
  it("převede na malá písmena, ořízne a sjednotí bílé znaky", () => {
    expect(normalizeText("  Ahoj   Světe  ")).toBe("ahoj světe");
  });
});

describe("stripDiacritics", () => {
  it("odstraní českou diakritiku", () => {
    expect(stripDiacritics("příliš žluťoučký kůň")).toBe("prilis zlutoucky kun");
  });
});

describe("significantWords", () => {
  it("vyřadí krátká slova a stopslova", () => {
    const words = significantWords("Já a ty jsme dnes v práci.");
    expect(words).not.toContain("ty");
    expect(words).not.toContain("jsme");
    expect(words).toContain("dnes");
    expect(words).toContain("praci");
  });

  it("funguje i pro angličtinu (anglická stopslova se vyřadí)", () => {
    const words = significantWords("I am working today with my colleague.");
    expect(words).not.toContain("with");
    expect(words).toContain("today");
    expect(words).toContain("working");
    expect(words).toContain("colleague");
  });
});

describe("suggestKeywords", () => {
  it("navrhne klíčová slova a zachová diakritiku", () => {
    const suggestions = suggestKeywords("Vlastním B2B úklidovou firmu v Brně.");
    expect(suggestions).toContain("úklidovou");
    expect(suggestions).toContain("firmu");
    expect(suggestions).toContain("brně");
    // Diakritika musí zůstat zachovaná (kvůli silnější přesné shodě v relevanci).
    expect(suggestions.some((s) => s.includes("ě") || s.includes("ú"))).toBe(true);
  });

  it("vyřadí krátká slova a stopslova", () => {
    const suggestions = suggestKeywords("Já a ty jsme dnes v práci.");
    expect(suggestions).not.toContain("ty");
    expect(suggestions).not.toContain("jsme");
  });

  it("nevrátí duplicity", () => {
    const suggestions = suggestKeywords("faktura faktura faktura");
    expect(suggestions).toEqual(["faktura"]);
  });

  it("respektuje limit počtu návrhů", () => {
    const suggestions = suggestKeywords(
      "první druhé třetí čtvrté páté šesté sedmé osmé deváté",
      3,
    );
    expect(suggestions).toHaveLength(3);
  });

  it("na prázdný text vrátí prázdné pole", () => {
    expect(suggestKeywords("")).toEqual([]);
  });
});

describe("stemWord", () => {
  it("najde stejný základ u běžných českých pádových koncovek", () => {
    expect(stemWord("kavarna")).toBe(stemWord("kavarne"));
    expect(stemWord("kavarne")).toBe(stemWord("kavarnu"));
  });

  it("najde stejný základ u anglických přípon", () => {
    expect(stemWord("working")).toBe(stemWord("worked"));
  });

  it("neosekne slovo pod minimální délku základu", () => {
    // "byt" je moc krátké na to, aby se z něj dalo cokoliv bezpečně osekat.
    expect(stemWord("byt")).toBe("byt");
  });

  it("neztotožní nesouvisející slova jen kvůli náhodné koncovce", () => {
    expect(stemWord("kolik")).not.toBe(stemWord("kocky"));
  });
});
