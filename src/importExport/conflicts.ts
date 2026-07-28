import type { MemoryProfile } from "../memory/types";

export interface ProfileConflict {
  id: string;
  existingName: string;
  incomingName: string;
}

/**
 * Najde profily, které importovaný soubor i stávající data znají pod
 * stejným ID, ale s jiným názvem — typicky když dva soubory z různých
 * zdrojů (např. export z jiného počítače) nezávisle použily stejné ID pro
 * jinak pojmenovaný profil. Určeno jen pro režim "sloučit" — při "nahradit"
 * se stávající profily stejně celé přepíšou, takže konflikt řešit netřeba.
 */
export function findProfileConflicts(
  existingProfiles: MemoryProfile[],
  incomingProfiles: MemoryProfile[],
): ProfileConflict[] {
  const existingById = new Map(existingProfiles.map((p) => [p.id, p]));
  const conflicts: ProfileConflict[] = [];

  for (const incoming of incomingProfiles) {
    const existing = existingById.get(incoming.id);
    if (existing && existing.name !== incoming.name) {
      conflicts.push({
        id: incoming.id,
        existingName: existing.name,
        incomingName: incoming.name,
      });
    }
  }

  return conflicts;
}

/** Aplikuje uživatelovo rozhodnutí (podle ID profilu, "existing" nebo
 * "incoming") na seznam importovaných profilů — vrátí novou kopii se
 * správnými názvy, připravenou k předání do `applyImport`. */
export function resolveProfileConflicts(
  incomingProfiles: MemoryProfile[],
  existingProfiles: MemoryProfile[],
  resolutions: Map<string, "existing" | "incoming">,
): MemoryProfile[] {
  const existingById = new Map(existingProfiles.map((p) => [p.id, p]));

  return incomingProfiles.map((profile) => {
    const resolution = resolutions.get(profile.id);
    if (resolution === "existing") {
      const existing = existingById.get(profile.id);
      if (existing) {
        return { ...profile, name: existing.name };
      }
    }
    return profile;
  });
}
