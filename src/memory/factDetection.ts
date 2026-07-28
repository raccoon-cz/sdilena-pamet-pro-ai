import type { MemoryCategory } from "./types";

export interface DetectedFact {
  sentence: string;
  category: MemoryCategory;
}

interface FactPattern {
  regex: RegExp;
  category: MemoryCategory;
}

/**
 * Jednoduchá, deterministická (žádné AI) detekce vět, kde si uživatel
 * pravděpodobně sám o sobě něco sděluje — v duchu "AI nic nečte a nic
 * neshrnuje", jen se sleduje text, který si uživatel právě sám píše do
 * dotazu. Vzory jsou záměrně úzké (celá fráze, ne jen jedno obecné slovo),
 * aby nenabízely ukládání skoro každé věty.
 */
const FACT_PATTERNS: FactPattern[] = [
  // čeština
  { regex: /\bjmenuji se\b/i, category: "about" },
  { regex: /\bbydlím\b/i, category: "about" },
  { regex: /\bje mi \d+ let\b/i, category: "about" },
  { regex: /\bpracuji jako\b/i, category: "work" },
  { regex: /\bpracuju jako\b/i, category: "work" },
  { regex: /\bvlastním\b/i, category: "work" },
  { regex: /\bstuduji\b/i, category: "work" },
  { regex: /\bpreferuji\b/i, category: "response_preferences" },
  { regex: /\bmám rád(a)?\b/i, category: "response_preferences" },
  { regex: /\bnemám rád(a)?\b/i, category: "response_preferences" },
  // english
  { regex: /\bmy name is\b/i, category: "about" },
  { regex: /\bi live in\b/i, category: "about" },
  { regex: /\bi('| a)m \d+ years old\b/i, category: "about" },
  { regex: /\bi work as\b/i, category: "work" },
  { regex: /\bi own\b/i, category: "work" },
  { regex: /\bi study\b/i, category: "work" },
  { regex: /\bi prefer\b/i, category: "response_preferences" },
  { regex: /\bi like\b/i, category: "response_preferences" },
  { regex: /\bi don't like\b/i, category: "response_preferences" },
  { regex: /\bi do not like\b/i, category: "response_preferences" },
];

const MIN_SENTENCE_LENGTH = 8;
const MAX_SENTENCE_LENGTH = 240;

/** Rozdělí text na věty (podle . ! ?) a vrátí první, která odpovídá
 * některému ze vzorů — nebo `null`, pokud žádná neodpovídá. Nekontroluje
 * nic z odpovědí AI ani historii konverzace, jen text předaný jako `text`
 * (typicky rozepsaný, ještě neodeslaný dotaz). */
export function detectPersonalFact(text: string): DetectedFact | null {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SENTENCE_LENGTH && s.length <= MAX_SENTENCE_LENGTH);

  for (const sentence of sentences) {
    const match = FACT_PATTERNS.find((pattern) => pattern.regex.test(sentence));
    if (match) {
      return { sentence, category: match.category };
    }
  }

  return null;
}
