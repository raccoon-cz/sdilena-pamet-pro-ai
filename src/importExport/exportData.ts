import type { MemoryExport } from "../memory/types";
import type { MemoryRepository } from "../storage/MemoryRepository";
import { nowIso } from "../shared/ids";

export async function buildExportPayload(repository: MemoryRepository): Promise<MemoryExport> {
  const [profiles, memories, settings] = await Promise.all([
    repository.listProfiles(),
    repository.listMemories(),
    repository.getSettings(),
  ]);

  return {
    formatVersion: 1,
    exportedAt: nowIso(),
    profiles,
    memories,
    settings,
  };
}

export function serializeExport(data: MemoryExport): string {
  return JSON.stringify(data, null, 2);
}
