import type { MemoryItem } from "./types";
import { normalizeText, stripDiacritics } from "../shared/text";

function canonicalize(text: string): string {
  return stripDiacritics(normalizeText(text));
}

/** Dvě vzpomínky považujeme za "téměř identické", pokud je jejich
 * kanonický text stejný, nebo je kratší z nich celá obsažená v delší a tvoří
 * aspoň 80 % její délky (typicky drobná úprava formulace / překlep). */
function areNearDuplicates(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 0 || b.length === 0) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!longer.includes(shorter)) return false;
  return shorter.length / longer.length >= 0.8;
}

/**
 * Odstraní téměř identické vzpomínky ze **seřazeného** seznamu (pořadí podle
 * relevance/priority) — vždy ponechá první (tedy nejrelevantnější) výskyt.
 */
export function removeDuplicateMemories(memories: MemoryItem[]): MemoryItem[] {
  const kept: MemoryItem[] = [];
  const keptCanonical: string[] = [];

  for (const memory of memories) {
    const canonical = canonicalize(memory.text);
    const isDuplicate = keptCanonical.some((existing) => areNearDuplicates(existing, canonical));
    if (!isDuplicate) {
      kept.push(memory);
      keptCanonical.push(canonical);
    }
  }

  return kept;
}

export interface DuplicatePair {
  a: MemoryItem;
  b: MemoryItem;
}

/**
 * Najde všechny dvojice téměř identických vzpomínek v **celém** uloženém
 * souboru (na rozdíl od `removeDuplicateMemories`, která jen ořezává jeden
 * konkrétní výběr pro dotaz). Určeno pro nástroj "Možné duplicity" v UI —
 * vrací dvojice k ručnímu rozhodnutí, nic sama nemaže.
 */
export function findDuplicatePairs(memories: MemoryItem[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < memories.length; i++) {
    const a = memories[i];
    if (!a) continue;
    const canonicalA = canonicalize(a.text);
    for (let j = i + 1; j < memories.length; j++) {
      const b = memories[j];
      if (!b) continue;
      if (areNearDuplicates(canonicalA, canonicalize(b.text))) {
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}
