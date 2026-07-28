import { describe, it, expect } from "vitest";
import { detectPersonalFact } from "../src/memory/factDetection";

describe("detectPersonalFact", () => {
  it("rozpozná představovací větu a přiřadí kategorii 'about'", () => {
    const result = detectPersonalFact("Dobrý den, jmenuji se Adam Kleveta.");
    expect(result).not.toBeNull();
    expect(result?.sentence).toContain("jmenuji se Adam Kleveta");
    expect(result?.category).toBe("about");
  });

  it("rozpozná pracovní větu a přiřadí kategorii 'work'", () => {
    const result = detectPersonalFact("Pracuji jako vedoucí úklidové firmy v Brně.");
    expect(result?.category).toBe("work");
  });

  it("rozpozná preferenci a přiřadí kategorii 'response_preferences'", () => {
    const result = detectPersonalFact("Preferuji stručné a věcné odpovědi.");
    expect(result?.category).toBe("response_preferences");
  });

  it("vrátí první odpovídající větu z víceřádkového textu", () => {
    const text = "Potřebuji pomoct s emailem. Bydlím v Brně už deset let. Můžeš mi poradit?";
    const result = detectPersonalFact(text);
    expect(result?.sentence).toContain("Bydlím v Brně");
  });

  it("nic nenajde v textu bez osobního sdělení", () => {
    expect(detectPersonalFact("Jaké je dnes počasí v Praze?")).toBeNull();
  });

  it("ignoruje příliš krátké fragmenty", () => {
    expect(detectPersonalFact("Bydlím.")).toBeNull();
  });

  it("na prázdný text vrátí null", () => {
    expect(detectPersonalFact("")).toBeNull();
  });

  it("rozpozná anglickou představovací větu", () => {
    const result = detectPersonalFact("Hi there, my name is Adam Kleveta.");
    expect(result?.sentence).toContain("my name is Adam Kleveta");
    expect(result?.category).toBe("about");
  });

  it("rozpozná anglickou pracovní větu", () => {
    const result = detectPersonalFact("I work as a project manager in Brno.");
    expect(result?.category).toBe("work");
  });

  it("rozpozná anglickou preferenci", () => {
    const result = detectPersonalFact("I prefer short and direct answers.");
    expect(result?.category).toBe("response_preferences");
  });

  it("nic nenajde v anglickém textu bez osobního sdělení", () => {
    expect(detectPersonalFact("What is the weather like today?")).toBeNull();
  });
});
