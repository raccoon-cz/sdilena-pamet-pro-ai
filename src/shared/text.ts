/** Čisté textové utility bez závislosti na Chrome API. */

/** Malá písmena, ořez, sjednocení bílých znaků. Diakritiku ponechává,
 * protože v češtině mění význam slova (např. "byt" vs. "být"). */
export function normalizeText(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Odstraní diakritiku (NFD rozklad + smazání kombinujících znaků). Používá
 * se jen jako druhotné, měkčí kritérium shody. */
export function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Čeština + angličtina v jednom seznamu — rozšíření pracuje s oběma jazyky
 * zároveň bez nutnosti cokoliv přepínat: text v libovolném z nich se
 * normalizuje stejně, jen stopslova se vyřadí podle toho, ve kterém jazyce
 * skutečně je. */
const STOPWORDS = new Set([
  // čeština
  "a",
  "ale",
  "ani",
  "asi",
  "aby",
  "az",
  "co",
  "coz",
  "do",
  "ho",
  "jak",
  "jako",
  "je",
  "jeho",
  "jej",
  "jeji",
  "jejich",
  "jen",
  "ještě",
  "jeste",
  "jsem",
  "jsi",
  "jsme",
  "jsou",
  "jste",
  "k",
  "kde",
  "kdo",
  "kdyz",
  "když",
  "ktera",
  "ktere",
  "kteri",
  "který",
  "ktery",
  "ma",
  "me",
  "mit",
  "muj",
  "muze",
  "na",
  "nad",
  "nam",
  "nas",
  "ne",
  "nebo",
  "neco",
  "nejak",
  "než",
  "nez",
  "ona",
  "oni",
  "ono",
  "pak",
  "po",
  "pod",
  "pokud",
  "pro",
  "proc",
  "proto",
  "protoze",
  "pri",
  "při",
  "se",
  "si",
  "ta",
  "tak",
  "take",
  "také",
  "takze",
  "tam",
  "te",
  "tedy",
  "tento",
  "ti",
  "tim",
  "to",
  "toho",
  "tohle",
  "tom",
  "tomto",
  "tu",
  "tuto",
  "ty",
  "u",
  "uz",
  "už",
  "v",
  "ve",
  "vsak",
  "však",
  "z",
  "za",
  "ze",
  // english
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "cannot",
  "could",
  "did",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "here",
  "herself",
  "himself",
  "into",
  "itself",
  "just",
  "more",
  "most",
  "myself",
  "not",
  "now",
  "once",
  "only",
  "other",
  "ours",
  "ourselves",
  "over",
  "own",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "until",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

/** Koncovky (česká pádová/slovesná skloňování + anglické přípony), od
 * nejdelší po nejkratší, aby se zkusila nejdřív ta specifičtější — jinak by
 * kratší koncovka "usekla" slovo dřív, než dostane šanci ta přesnější. Jde o
 * heuristiku, ne o lingvisticky úplný stemmer: cílem je najít stejný slovní
 * základ u běžných tvarů jednoho slova (kavárna/kavárně/kavárnu → "kavarn"),
 * ne správně stemovat cokoliv. */
const STEM_SUFFIXES = [
  "atech",
  "ovymi",
  "ejsim",
  "ejsi",
  "ova",
  "ove",
  "ovi",
  "ima",
  "ami",
  "emi",
  "ich",
  "ych",
  "ech",
  "emu",
  "ymu",
  "tion",
  "ment",
  "ness",
  "ing",
  "less",
  "ful",
  "ou",
  "em",
  "am",
  "om",
  "um",
  "ed",
  "es",
  "er",
  "ly",
  "a",
  "e",
  "i",
  "o",
  "u",
  "y",
  "s",
].sort((a, b) => b.length - a.length);

/** Nejkratší přípustná délka zbylého základu po odseknutí koncovky — brání
 * tomu, aby se krátká slova osekala až na nic málo přesvědčivého (a tím
 * pádem si byla podobná čistě náhodou). */
const MIN_STEM_LENGTH = 4;

/** Odsekne první odpovídající koncovku ze `STEM_SUFFIXES` (jde o jeden
 * průchod, ne opakované odsekávání) — vrací stejný vstup, pokud žádná
 * koncovka nesedí nebo by zbylý základ byl příliš krátký. Očekává vstup bez
 * diakritiky a malými písmeny (viz `significantWords`). */
export function stemWord(word: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (word.length - suffix.length >= MIN_STEM_LENGTH && word.endsWith(suffix)) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

/** Rozdělí normalizovaný text na "významná" slova (bez stopslov a krátkých
 * tokenů). Diakritika je odstraněna, aby se slova dobře porovnávala i přes
 * drobné pravopisné rozdíly. */
export function significantWords(input: string): string[] {
  const normalized = stripDiacritics(normalizeText(input));
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

export function allWords(input: string): string[] {
  const normalized = stripDiacritics(normalizeText(input));
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Navrhne klíčová slova z textu vzpomínky — na rozdíl od `significantWords`
 * záměrně ZACHOVÁVÁ diakritiku ve výstupu (jen se přes ni filtrují
 * stopslova), protože klíčové slovo s diakritikou se v `relevance.ts` shoduje
 * silněji (přesná shoda) než jeho podoba bez diakritiky. Jde jen o návrh —
 * uživatel si výsledek před uložením může upravit nebo smazat.
 */
export function suggestKeywords(text: string, max = 6): string[] {
  const normalized = normalizeText(text);
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const token of tokens) {
    if (token.length < 4 || STOPWORDS.has(stripDiacritics(token)) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    suggestions.push(token);
    if (suggestions.length >= max) break;
  }
  return suggestions;
}
