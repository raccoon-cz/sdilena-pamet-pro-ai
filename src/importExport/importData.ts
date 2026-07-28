import type { MemoryExport } from "../memory/types";
import type { MemoryRepository } from "../storage/MemoryRepository";

export type ImportMode = "merge" | "replace";

export interface ImportSummary {
  importedProfiles: number;
  importedMemories: number;
  mode: ImportMode;
}

/**
 * Aplikuje ověřená importovaná data do úložiště.
 * - "merge": každý profil/vzpomínka se podle ID buď přidá, nebo přepíše
 *   existující záznam se stejným ID; nic jiného se nemaže.
 * - "replace": veškerá stávající data (profily, vzpomínky, nastavení) se
 *   nahradí importovanými.
 */
export async function applyImport(
  repository: MemoryRepository,
  data: MemoryExport,
  mode: ImportMode,
): Promise<ImportSummary> {
  if (mode === "replace") {
    await repository.replaceAll({
      profiles: data.profiles,
      memories: data.memories,
      settings: data.settings,
    });
  } else {
    await repository.saveProfiles(data.profiles);
    await repository.saveMemories(data.memories);
  }

  return {
    importedProfiles: data.profiles.length,
    importedMemories: data.memories.length,
    mode,
  };
}
