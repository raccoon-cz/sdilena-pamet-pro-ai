import type {
  ExtensionSettings,
  MemoryItem,
  MemoryProfile,
  ProviderConnection,
} from "../memory/types";
import { STORAGE_KEYS, DEFAULT_SETTINGS } from "../shared/constants";
import type { MemoryRepository } from "./MemoryRepository";

function storageGet<T = Record<string, unknown>>(keys: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result as T);
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function storageClear(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

/** Pokud je uložená hodnota poškozená / nemá očekávaný tvar, vrátí prázdné
 * pole místo pádu. Rozšíření tak přežije ruční zásah do storage nebo starý
 * formát dat. */
function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeSettings(value: unknown): ExtensionSettings {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as ExtensionSettings).maxMemoriesPerPrompt === "number" &&
    typeof (value as ExtensionSettings).maxContextCharacters === "number"
  ) {
    return { ...DEFAULT_SETTINGS, ...(value as ExtensionSettings) };
  }
  return { ...DEFAULT_SETTINGS };
}

export class ChromeStorageRepository implements MemoryRepository {
  async listMemories(): Promise<MemoryItem[]> {
    const data = await storageGet<{ [k: string]: unknown }>([STORAGE_KEYS.memories]);
    return safeArray<MemoryItem>(data[STORAGE_KEYS.memories]);
  }

  async getMemory(id: string): Promise<MemoryItem | null> {
    const all = await this.listMemories();
    return all.find((m) => m.id === id) ?? null;
  }

  async saveMemory(memory: MemoryItem): Promise<void> {
    const all = await this.listMemories();
    const idx = all.findIndex((m) => m.id === memory.id);
    if (idx >= 0) {
      all[idx] = memory;
    } else {
      all.push(memory);
    }
    await storageSet({ [STORAGE_KEYS.memories]: all });
  }

  async saveMemories(memories: MemoryItem[]): Promise<void> {
    if (memories.length === 0) return;
    const all = await this.listMemories();
    const byId = new Map(all.map((m) => [m.id, m] as const));
    for (const memory of memories) {
      byId.set(memory.id, memory);
    }
    await storageSet({ [STORAGE_KEYS.memories]: Array.from(byId.values()) });
  }

  async deleteMemory(id: string): Promise<void> {
    const all = await this.listMemories();
    await storageSet({ [STORAGE_KEYS.memories]: all.filter((m) => m.id !== id) });
  }

  async listProfiles(): Promise<MemoryProfile[]> {
    const data = await storageGet<{ [k: string]: unknown }>([STORAGE_KEYS.profiles]);
    return safeArray<MemoryProfile>(data[STORAGE_KEYS.profiles]);
  }

  async saveProfile(profile: MemoryProfile): Promise<void> {
    const all = await this.listProfiles();
    const idx = all.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      all[idx] = profile;
    } else {
      all.push(profile);
    }
    if (profile.isDefault) {
      for (const p of all) {
        if (p.id !== profile.id) p.isDefault = false;
      }
    }
    await storageSet({ [STORAGE_KEYS.profiles]: all });
  }

  async saveProfiles(profiles: MemoryProfile[]): Promise<void> {
    if (profiles.length === 0) return;
    const all = await this.listProfiles();
    const byId = new Map(all.map((p) => [p.id, p] as const));
    for (const profile of profiles) {
      byId.set(profile.id, profile);
    }
    await storageSet({ [STORAGE_KEYS.profiles]: Array.from(byId.values()) });
  }

  async deleteProfile(id: string): Promise<void> {
    const all = await this.listProfiles();
    await storageSet({ [STORAGE_KEYS.profiles]: all.filter((p) => p.id !== id) });
  }

  async getSettings(): Promise<ExtensionSettings> {
    const data = await storageGet<{ [k: string]: unknown }>([STORAGE_KEYS.settings]);
    return safeSettings(data[STORAGE_KEYS.settings]);
  }

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    await storageSet({ [STORAGE_KEYS.settings]: settings });
  }

  async listConnections(): Promise<ProviderConnection[]> {
    const data = await storageGet<{ [k: string]: unknown }>([STORAGE_KEYS.connections]);
    return safeArray<ProviderConnection>(data[STORAGE_KEYS.connections]);
  }

  async saveConnection(connection: ProviderConnection): Promise<void> {
    const all = await this.listConnections();
    const idx = all.findIndex((c) => c.provider === connection.provider);
    if (idx >= 0) {
      all[idx] = connection;
    } else {
      all.push(connection);
    }
    await storageSet({ [STORAGE_KEYS.connections]: all });
  }

  async replaceAll(data: {
    profiles: MemoryProfile[];
    memories: MemoryItem[];
    settings: ExtensionSettings;
  }): Promise<void> {
    await storageSet({
      [STORAGE_KEYS.profiles]: data.profiles,
      [STORAGE_KEYS.memories]: data.memories,
      [STORAGE_KEYS.settings]: data.settings,
      [STORAGE_KEYS.schemaVersion]: 1,
    });
  }

  async wipeAll(): Promise<void> {
    await storageClear();
  }
}
