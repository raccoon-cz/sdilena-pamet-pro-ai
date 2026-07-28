import type { MemoryCategory, MemoryItem, RelevanceInput, ScoredMemory } from "./types";
import { normalizeText, stripDiacritics, significantWords, stemWord } from "../shared/text";
import { removeDuplicateMemories } from "./deduplication";

/** Body za jednotlivé typy shody. Čísla jsou záměrně jednoduchá a
 * dokumentovaná, aby šlo chování snadno vysvětlit i otestovat — nejde o
 * naučený model, jen o čitelné váhy. */
const SCORE = {
  exactKeyword: 10,
  exactKeywordNoDiacritics: 6,
  partialKeyword: 4,
  sharedWord: 2,
  stemmedWord: 1,
  categoryHint: 3,
  distinctiveWord: 1,
} as const;

/** Náhrada za skloňování/lemmatizaci: dvě dost dlouhá slova ve stejném
 * slovním základu po odseknutí běžné koncovky (viz `stemWord` v
 * `shared/text.ts`) považujeme za pravděpodobně stejné slovo v jiném tvaru
 * — pokryje běžné české pády ("kavárna"/"kavárně"/"kavárnu") i anglické
 * přípony ("work"/"working"). Váha je záměrně nižší než přesná shoda slova,
 * jde jen o měkčí signál. */
const MIN_STEM_WORD_LENGTH = 5;

function sharesStem(a: string, b: string): boolean {
  if (a === b) return false;
  if (a.length < MIN_STEM_WORD_LENGTH || b.length < MIN_STEM_WORD_LENGTH) return false;
  return stemWord(a) === stemWord(b);
}

/** Kolik různých vzpomínek (z aktuálně zvažovaného profilu) obsahuje dané
 * slovo — spočítá se jednou na celý výběr, ne pro každou vzpomínku zvlášť. */
function computeDocumentFrequency(memories: MemoryItem[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const memory of memories) {
    const uniqueWords = new Set(significantWords(memory.text));
    for (const word of uniqueWords) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  return frequency;
}

/** Slovo, které se objevuje jen v malé části vzpomínek, o dotazu vypovídá
 * víc než slovo opakující se skoro všude (typicky obecná výplň) — proto
 * shoda na "vzácném" slově dostane malý bonus navíc k obyčejné shodě slova.
 * Tohle je jediná věc, která rozlišuje "specifickou" vzpomínku od obecné,
 * když obě obsahují stejný počet shodných slov — bez toho se snadno stane,
 * že se pořád nabízí ty samé obecné vzpomínky bez ohledu na konkrétní dotaz. */
const RARE_WORD_MAX_DOCUMENT_SHARE = 0.34;

function distinctivenessBonus(
  memory: MemoryItem,
  queryWords: Set<string>,
  documentFrequency: Map<string, number>,
  totalDocuments: number,
): number {
  if (totalDocuments <= 1) return 0;
  const memoryWords = new Set(significantWords(memory.text));
  let rareMatches = 0;
  for (const word of memoryWords) {
    if (!queryWords.has(word)) continue;
    const documentCount = documentFrequency.get(word) ?? 1;
    if (documentCount / totalDocuments <= RARE_WORD_MAX_DOCUMENT_SHARE) {
      rareMatches += 1;
    }
  }
  return Math.min(rareMatches, 5) * SCORE.distinctiveWord;
}

/** Několik typických slov k jednotlivým kategoriím — česky i anglicky
 * zároveň (bez nutnosti cokoliv přepínat), hrubá nápověda pro řazení, ne
 * přesná klasifikace. */
const CATEGORY_HINTS: Record<MemoryCategory, string[]> = {
  about: ["o mne", "jsem", "muj vek", "bydlim", "narodil", "about me", "my age", "i live", "i was born"],
  work: [
    "prace",
    "zamestnani",
    "firma",
    "kolega",
    "sef",
    "kancelar",
    "pracovni",
    "work",
    "job",
    "company",
    "colleague",
    "boss",
    "office",
    "career",
  ],
  projects: ["projekt", "ukol", "task", "milnik", "deadline", "project", "milestone"],
  response_preferences: [
    "odpoved",
    "styl",
    "tón",
    "ton",
    "preferuji",
    "format",
    "response",
    "style",
    "tone",
    "prefer",
    "format",
  ],
  people_companies: [
    "kontakt",
    "klient",
    "partner",
    "dodavatel",
    "kolega",
    "jmeno",
    "contact",
    "client",
    "vendor",
    "supplier",
    "name",
  ],
  finance: [
    "penize",
    "faktura",
    "rozpocet",
    "dane",
    "investice",
    "naklady",
    "cena",
    "money",
    "invoice",
    "budget",
    "tax",
    "investment",
    "cost",
    "price",
  ],
  family: [
    "rodina",
    "deti",
    "manzel",
    "manzelka",
    "partnerka",
    "partner",
    "family",
    "children",
    "kids",
    "husband",
    "wife",
    "spouse",
  ],
  other: [],
};

function canonicalKeyword(k: string): string {
  return normalizeText(k);
}

/** Ohodnotí jednu vzpomínku vůči dotazu. Čistá funkce, testovatelná bez
 * Chrome API. */
export function scoreMemory(
  query: string,
  memory: MemoryItem,
): { score: number; matchedKeywords: string[] } {
  const normalizedQuery = normalizeText(query);
  const strippedQuery = stripDiacritics(normalizedQuery);
  const queryWords = new Set(significantWords(query));
  const memoryWords = significantWords(memory.text);

  let score = 0;
  const matchedKeywords: string[] = [];

  for (const rawKeyword of memory.keywords) {
    const keyword = canonicalKeyword(rawKeyword);
    if (!keyword) continue;
    if (normalizedQuery.includes(keyword)) {
      score += SCORE.exactKeyword;
      matchedKeywords.push(rawKeyword);
      continue;
    }
    const strippedKeyword = stripDiacritics(keyword);
    if (strippedKeyword && strippedQuery.includes(strippedKeyword)) {
      score += SCORE.exactKeywordNoDiacritics;
      matchedKeywords.push(rawKeyword);
      continue;
    }
    if (keyword.length >= 3) {
      const partial =
        normalizedQuery
          .split(" ")
          .some((word) => word.length >= 3 && (keyword.includes(word) || word.includes(keyword)));
      if (partial) {
        score += SCORE.partialKeyword;
        matchedKeywords.push(rawKeyword);
      }
    }
  }

  let sharedWordCount = 0;
  let stemmedWordCount = 0;
  const queryWordList = Array.from(queryWords);
  for (const word of memoryWords) {
    if (queryWords.has(word)) {
      sharedWordCount += 1;
    } else if (queryWordList.some((queryWord) => sharesStem(word, queryWord))) {
      stemmedWordCount += 1;
    }
  }
  score += Math.min(sharedWordCount, 5) * SCORE.sharedWord;
  score += Math.min(stemmedWordCount, 5) * SCORE.stemmedWord;

  const hints = CATEGORY_HINTS[memory.category];
  if (hints.some((hint) => strippedQuery.includes(hint))) {
    score += SCORE.categoryHint;
  }

  return { score, matchedKeywords };
}

/** Seřadí podle skóre sestupně a odstraní téměř identické vzpomínky, ale
 * zachová mapování zpět na ScoredMemory (skóre, matchedKeywords). */
function sortAndDedupe(candidates: ScoredMemory[]): ScoredMemory[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return removeDuplicateMemories(sorted.map((s) => s.memory)).map(
    (memory) => sorted.find((s) => s.memory.id === memory.id)!,
  );
}

/**
 * Vybere relevantní vzpomínky pro daný dotaz. Pravidla (v tomto pořadí):
 * 1) vyřadí deaktivované, 2) vyřadí jiné profily, 3) vzpomínky označené
 * "upřednostnit" (alwaysUse) mají vyhrazený strop `maxAlwaysUseMemories` —
 * i kdyby jich uživatel označil desítky, obsadí jen omezený počet míst a
 * zbytek rozpočtu zůstává pro vzpomínky relevantní k aktuálnímu dotazu
 * (mezi "upřednostněnými" navíc vyhrávají ty, které jsou k dotazu relevantní
 * taky — ne náhodné/první podle pořadí), 4) obodování podle shody klíčových
 * slov / slov / kategorie, 5) odstranění duplicit, 6) seřazení podle skóre,
 * 7) ořez na maxMemoriesPerPrompt a maxContextCharacters. Nikdy nevrací
 * všechny vzpomínky automaticky — jde vždy jen o návrh, který si uživatel
 * před vložením prohlédne.
 */
export function selectRelevantMemories(input: RelevanceInput): ScoredMemory[] {
  const { query, activeProfileId, memories, settings } = input;

  const eligible = memories.filter((m) => m.enabled && m.profileId === activeProfileId);

  const documentFrequency = computeDocumentFrequency(eligible);
  const queryWords = new Set(significantWords(query));

  const scoredAll: ScoredMemory[] = eligible.map((memory) => {
    const { score, matchedKeywords } = scoreMemory(query, memory);
    const bonus =
      score > 0 ? distinctivenessBonus(memory, queryWords, documentFrequency, eligible.length) : 0;
    return { memory, score: score + bonus, matchedKeywords };
  });

  let alwaysSelected: ScoredMemory[] = [];
  let contextualPool: ScoredMemory[];

  if (settings.includeAlwaysUseMemories) {
    // Strop nikdy nesmí přesáhnout celkový rozpočet — jinak by "upřednostněné"
    // mohly samy o sobě spotřebovat víc míst, než kolik jich dotaz vůbec má.
    const alwaysBudget = Math.max(
      0,
      Math.min(settings.maxAlwaysUseMemories, settings.maxMemoriesPerPrompt),
    );
    const alwaysCandidates = sortAndDedupe(scoredAll.filter((s) => s.memory.alwaysUse));
    alwaysSelected = alwaysCandidates.slice(0, alwaysBudget);

    const alwaysSelectedIds = new Set(alwaysSelected.map((s) => s.memory.id));
    // Bez skóre = bez zjištěné souvislosti s dotazem — takové se nabízí jen
    // přes "upřednostnění", ne jako běžný kontextový výsledek.
    contextualPool = scoredAll.filter((s) => !alwaysSelectedIds.has(s.memory.id) && s.score > 0);
  } else {
    contextualPool = scoredAll.filter((s) => s.score > 0);
  }

  // Kontextové vzpomínky se deduplikují jak mezi sebou, tak vůči už
  // vybraným "upřednostněným" (aby se stejná informace neobjevila dvakrát).
  const alwaysIds = new Set(alwaysSelected.map((s) => s.memory.id));
  const contextualAfterDedup = removeDuplicateMemories([
    ...alwaysSelected.map((s) => s.memory),
    ...sortAndDedupe(contextualPool).map((s) => s.memory),
  ]).filter((memory) => !alwaysIds.has(memory.id));
  const dedupedContextual = contextualAfterDedup.map(
    (memory) => contextualPool.find((s) => s.memory.id === memory.id)!,
  );

  const remainingSlots = Math.max(0, settings.maxMemoriesPerPrompt - alwaysSelected.length);
  const contextualSelected = dedupedContextual.slice(0, remainingSlots);

  const finalOrdered = [...alwaysSelected, ...contextualSelected];

  const withinBudget: ScoredMemory[] = [];
  let usedCharacters = 0;
  for (const candidate of finalOrdered) {
    const length = candidate.memory.text.length;
    if (usedCharacters + length > settings.maxContextCharacters) continue;
    withinBudget.push(candidate);
    usedCharacters += length;
  }

  return withinBudget;
}
