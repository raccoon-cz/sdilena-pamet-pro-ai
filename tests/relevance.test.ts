import { describe, it, expect } from "vitest";
import { selectRelevantMemories, scoreMemory } from "../src/memory/relevance";
import { makeMemory, makeSettings } from "./helpers";

describe("normalizace a shoda klíčových slov", () => {
  it("najde přesnou shodu klíčového slova bez ohledu na velikost písmen", () => {
    const memory = makeMemory({ text: "Pracuje v Brně", keywords: ["BRNO"] });
    const { score, matchedKeywords } = scoreMemory("Kde je moje firma, brno?", memory);
    expect(score).toBeGreaterThan(0);
    expect(matchedKeywords).toContain("BRNO");
  });

  it("rozumně zachází s diakritikou (shoda i bez háčků/čárek)", () => {
    const memory = makeMemory({ text: "Preferuje kávu", keywords: ["káva"] });
    const { score } = scoreMemory("mam rad kavu rano", memory);
    expect(score).toBeGreaterThan(0);
  });

  it("funguje stejně dobře i pro anglický text", () => {
    const memory = makeMemory({ text: "Works at a cleaning company", keywords: ["cleaning company"] });
    const { score, matchedKeywords } = scoreMemory("Tell me about my cleaning company.", memory);
    expect(score).toBeGreaterThan(0);
    expect(matchedKeywords).toContain("cleaning company");
  });

  it("nerozliší jen náhodnou podobnost krátkých slov", () => {
    const memory = makeMemory({ text: "Nic společného", keywords: [] });
    const { score } = scoreMemory("úplně jiný dotaz o počasí", memory);
    expect(score).toBe(0);
  });

  it("najde shodu i přes české skloňování (stejný slovní základ, jiný pád)", () => {
    const memory = makeMemory({ text: "Chodí pravidelně do kavárny", keywords: [] });
    const { score } = scoreMemory("Kde je nejbližší kavárna?", memory);
    expect(score).toBeGreaterThan(0);
  });

  it("skloňování nezpůsobí falešnou shodu u nesouvisejících krátkých slov", () => {
    const memory = makeMemory({ text: "Má rád kočky", keywords: [] });
    const { score } = scoreMemory("Kolik stojí kolo?", memory);
    expect(score).toBe(0);
  });
});

describe("selectRelevantMemories — filtrování", () => {
  it("vyřadí deaktivované vzpomínky", () => {
    const memory = makeMemory({ enabled: false, keywords: ["brno"], text: "Firma v Brně" });
    const result = selectRelevantMemories({
      query: "brno",
      activeProfileId: "profile-1",
      memories: [memory],
      settings: makeSettings(),
    });
    expect(result).toHaveLength(0);
  });

  it("vyřadí vzpomínky z jiného profilu", () => {
    const memory = makeMemory({ profileId: "profile-2", keywords: ["brno"], text: "Firma v Brně" });
    const result = selectRelevantMemories({
      query: "brno",
      activeProfileId: "profile-1",
      memories: [memory],
      settings: makeSettings(),
    });
    expect(result).toHaveLength(0);
  });

  it("vždy zahrne vzpomínky s alwaysUse, pokud to nastavení povoluje", () => {
    const always = makeMemory({ alwaysUse: true, text: "Vždy použít", keywords: [] });
    const irrelevant = makeMemory({ text: "Něco úplně jiného", keywords: [] });
    const result = selectRelevantMemories({
      query: "dotaz co s ničím nesouvisí",
      activeProfileId: "profile-1",
      memories: [always, irrelevant],
      settings: makeSettings(),
    });
    expect(result.map((r) => r.memory.id)).toContain(always.id);
  });

  it("ignoruje alwaysUse, pokud je nastavení includeAlwaysUseMemories vypnuté", () => {
    const always = makeMemory({ alwaysUse: true, text: "xxxxxxxxxxx", keywords: [] });
    const result = selectRelevantMemories({
      query: "zcela nesouvisející dotaz",
      activeProfileId: "profile-1",
      memories: [always],
      settings: makeSettings({ includeAlwaysUseMemories: false }),
    });
    expect(result).toHaveLength(0);
  });

  it("omezí počet vzpomínek na maxMemoriesPerPrompt", () => {
    const memories = Array.from({ length: 20 }, (_, i) =>
      makeMemory({ text: `Práce ${i}`, keywords: ["práce"] }),
    );
    const result = selectRelevantMemories({
      query: "práce",
      activeProfileId: "profile-1",
      memories,
      settings: makeSettings({ maxMemoriesPerPrompt: 3 }),
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("nikdy nepřekročí maxContextCharacters (součet délek textů)", () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      makeMemory({ text: `${"x".repeat(90)}-${i}`, keywords: ["klic"] }),
    );
    const result = selectRelevantMemories({
      query: "klic",
      activeProfileId: "profile-1",
      memories,
      settings: makeSettings({ maxMemoriesPerPrompt: 10, maxContextCharacters: 250 }),
    });
    const total = result.reduce((sum, r) => sum + r.memory.text.length, 0);
    expect(total).toBeLessThanOrEqual(250);
  });

  it("odstraní téměř identické vzpomínky", () => {
    const a = makeMemory({ text: "Vlastní B2B úklidovou firmu v Brně", keywords: ["firma"] });
    const b = makeMemory({ text: "Vlastní B2B úklidovou firmu v Brně.", keywords: ["firma"] });
    const result = selectRelevantMemories({
      query: "firma",
      activeProfileId: "profile-1",
      memories: [a, b],
      settings: makeSettings(),
    });
    expect(result).toHaveLength(1);
  });

  it("nikdy automaticky nevrátí vše bez ohledu na relevanci — nerelevantní věci nezíská skóre", () => {
    const relevant = makeMemory({ text: "Preferuje odpovědi v češtině.", keywords: ["v češtině"] });
    const irrelevant = makeMemory({ text: "Nesouvisející detail", keywords: ["xyzabc123"] });
    const result = selectRelevantMemories({
      query: "Můžeš mi prosím odpovědět v češtině?",
      activeProfileId: "profile-1",
      memories: [relevant, irrelevant],
      settings: makeSettings(),
    });
    expect(result.map((r) => r.memory.id)).toEqual([relevant.id]);
  });

  it("upřednostní vzpomínku s vzácnějším (distinktivním) slovem před opakovanou obecnou frází", () => {
    // Deset vzpomínek sdílí stejné obecné slovo "preferuje" (objevuje se
    // skoro všude, takže samo o sobě nic nerozlišuje), jedna navíc obsahuje
    // slovo "raccoon", které se v profilu neopakuje nikde jinde — ta by měla
    // vyhrát, i kdyby měly jinak stejný počet shodných slov s dotazem.
    const genericNoise = Array.from({ length: 9 }, (_, i) =>
      makeMemory({ text: `Preferuje odpovědi stručně ${i}`, keywords: [] }),
    );
    const distinctive = makeMemory({ text: "Preferuje odpovědi o mém mazlíčkovi raccoon", keywords: [] });

    const result = selectRelevantMemories({
      query: "Preferuje odpovědi o raccoon?",
      activeProfileId: "profile-1",
      memories: [...genericNoise, distinctive],
      settings: makeSettings({ maxMemoriesPerPrompt: 1 }),
    });

    expect(result[0]?.memory.id).toBe(distinctive.id);
  });
});

describe("selectRelevantMemories — strop na 'upřednostněné' (maxAlwaysUseMemories)", () => {
  it("i při desítkách 'upřednostněných' vzpomínek nechá místo pro kontextové výsledky", () => {
    // Reprodukce reálného hlášeného problému: 32 z 75 vzpomínek má
    // alwaysUse=true, limit na dotaz je jen 8 — bez stropu by "upřednostněné"
    // spotřebovaly celý rozpočet a kontextová shoda by se nikdy nedostala dovnitř.
    const alwaysUseNoise = Array.from({ length: 32 }, (_, i) =>
      makeMemory({ alwaysUse: true, text: `Obecná preference č. ${i}`, keywords: [] }),
    );
    const contextual = makeMemory({
      text: "Vlastní B2B úklidovou firmu v Brně.",
      keywords: ["úklidová firma"],
    });

    const result = selectRelevantMemories({
      query: "Napiš mi nabídku pro úklidová firma klienta.",
      activeProfileId: "profile-1",
      memories: [...alwaysUseNoise, contextual],
      settings: makeSettings({ maxMemoriesPerPrompt: 8, maxAlwaysUseMemories: 3 }),
    });

    expect(result.length).toBeLessThanOrEqual(8);
    // Nejvýš 3 místa smí obsadit "upřednostněné" bez vztahu k dotazu.
    const alwaysCount = result.filter((r) => r.memory.alwaysUse).length;
    expect(alwaysCount).toBeLessThanOrEqual(3);
    // A kontextově relevantní vzpomínka se musí dostat dovnitř.
    expect(result.map((r) => r.memory.id)).toContain(contextual.id);
  });

  it("mezi 'upřednostněnými' upřednostní ty, které jsou navíc relevantní k dotazu", () => {
    const irrelevantAlways = Array.from({ length: 5 }, (_, i) =>
      makeMemory({ alwaysUse: true, text: `Nesouvisející preference ${i}`, keywords: [] }),
    );
    const relevantAlways = makeMemory({
      alwaysUse: true,
      text: "Preferuje faktury v PDF.",
      keywords: ["fakturu"],
    });

    const result = selectRelevantMemories({
      query: "Pošli mi prosím fakturu za minulý měsíc.",
      activeProfileId: "profile-1",
      memories: [...irrelevantAlways, relevantAlways],
      settings: makeSettings({ maxMemoriesPerPrompt: 8, maxAlwaysUseMemories: 1 }),
    });

    // Se stropem 1 na "upřednostněné" musí vyhrát ta, co sedí k dotazu.
    const alwaysInResult = result.filter((r) => r.memory.alwaysUse);
    expect(alwaysInResult).toHaveLength(1);
    expect(alwaysInResult[0]?.memory.id).toBe(relevantAlways.id);
  });

  it("strop nikdy nepřekročí celkový maxMemoriesPerPrompt", () => {
    const alwaysUseNoise = Array.from({ length: 10 }, (_, i) =>
      makeMemory({ alwaysUse: true, text: `Preference ${i}`, keywords: [] }),
    );
    const result = selectRelevantMemories({
      query: "libovolný dotaz",
      activeProfileId: "profile-1",
      memories: alwaysUseNoise,
      settings: makeSettings({ maxMemoriesPerPrompt: 4, maxAlwaysUseMemories: 100 }),
    });
    expect(result.length).toBeLessThanOrEqual(4);
  });
});
