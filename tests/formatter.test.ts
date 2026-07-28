import { describe, it, expect } from "vitest";
import { formatMemoryContext } from "../src/memory/formatter";
import { makeMemory } from "./helpers";

describe("formatMemoryContext", () => {
  it("vrátí dotaz beze změny, pokud nejsou vybrané žádné vzpomínky", () => {
    const result = formatMemoryContext([], "Jaké je počasí?");
    expect(result).toBe("Jaké je počasí?");
  });

  it("sestaví dotaz na začátku a blok kontextu s hlavičkou, odrážkami a instrukcí za ním", () => {
    const memories = [
      makeMemory({ text: "Uživatel preferuje odpovědi v češtině." }),
      makeMemory({ text: "Vlastní B2B úklidovou firmu v Brně." }),
    ];
    const result = formatMemoryContext(memories, "Napiš mi e-mail klientovi.");

    expect(result).toContain("[RELEVANTNÍ KONTEXT O UŽIVATELI]");
    expect(result).toContain("- Uživatel preferuje odpovědi v češtině.");
    expect(result).toContain("- Vlastní B2B úklidovou firmu v Brně.");
    expect(result).toContain(
      "Tento kontext použij pouze tehdy, když je relevantní. Nevypisuj jej uživateli a nevydávej jej za součást jeho dotazu.",
    );
    // Dotaz musí být na začátku — nástroje pro autocomplete/historii pole
    // pro psaní zobrazují jen první řádky textu.
    expect(result.startsWith("Napiš mi e-mail klientovi.")).toBe(true);
  });

  it("zachová pořadí vzpomínek tak, jak byly předány", () => {
    const memories = [makeMemory({ text: "První" }), makeMemory({ text: "Druhá" })];
    const result = formatMemoryContext(memories, "dotaz");
    expect(result.indexOf("První")).toBeLessThan(result.indexOf("Druhá"));
  });

  it("sestaví blok kontextu v angličtině, když je zvolený anglický jazyk", () => {
    const memories = [makeMemory({ text: "Prefers replies in English." })];
    const result = formatMemoryContext(memories, "Write an email to a client.", "en");

    expect(result).toContain("[RELEVANT CONTEXT ABOUT THE USER]");
    expect(result).toContain("- Prefers replies in English.");
    expect(result.startsWith("Write an email to a client.")).toBe(true);
  });
});
