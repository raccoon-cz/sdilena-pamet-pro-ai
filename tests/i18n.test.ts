import { describe, it, expect } from "vitest";
import { t, translations, LANGUAGES } from "../src/shared/i18n";

describe("i18n", () => {
  it("cs a en mají přesně stejnou sadu klíčů", () => {
    const csKeys = Object.keys(translations.cs).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(enKeys).toEqual(csKeys);
  });

  it("žádný překlad není prázdný řetězec", () => {
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(translations[lang])) {
        expect(value.length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("t() vrátí správný text pro daný jazyk", () => {
    expect(t("cs", "settings.title")).toBe("Nastavení");
    expect(t("en", "settings.title")).toBe("Settings");
  });

  it("t() dosadí proměnné do textu", () => {
    expect(t("cs", "bulk.selectedCount", { count: 5 })).toBe("Vybráno: 5");
    expect(t("en", "bulk.selectedCount", { count: 5 })).toBe("Selected: 5");
  });

  it("t() spadne zpět na češtinu pro neznámý jazyk/klíč", () => {
    // @ts-expect-error testujeme obranu i pro neplatný jazyk za běhu
    expect(t("de", "settings.title")).toBe("Nastavení");
  });
});
