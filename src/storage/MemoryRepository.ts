import type {
  ExtensionSettings,
  MemoryItem,
  MemoryProfile,
  ProviderConnection,
} from "../memory/types";

/**
 * Abstrakce nad úložištěm. Žádný jiný modul (UI, provider adaptéry,
 * background) nesmí přistupovat ke `chrome.storage.local` přímo — vždy přes
 * tuto vrstvu. Díky tomu lze v budoucnu vyměnit implementaci za IndexedDB
 * beze změny volajícího kódu.
 */
export interface MemoryRepository {
  listMemories(): Promise<MemoryItem[]>;
  getMemory(id: string): Promise<MemoryItem | null>;
  saveMemory(memory: MemoryItem): Promise<void>;
  /** Efektivní hromadná úprava — na rozdíl od volání saveMemory() v cyklu
   * čte a zapisuje úložiště jen jednou, ne jednou na položku. */
  saveMemories(memories: MemoryItem[]): Promise<void>;
  deleteMemory(id: string): Promise<void>;

  listProfiles(): Promise<MemoryProfile[]>;
  saveProfile(profile: MemoryProfile): Promise<void>;
  /** Efektivní hromadná úprava — na rozdíl od volání saveProfile() v cyklu
   * čte a zapisuje úložiště jen jednou, ne jednou na položku. */
  saveProfiles(profiles: MemoryProfile[]): Promise<void>;
  deleteProfile(id: string): Promise<void>;

  getSettings(): Promise<ExtensionSettings>;
  saveSettings(settings: ExtensionSettings): Promise<void>;

  listConnections(): Promise<ProviderConnection[]>;
  saveConnection(connection: ProviderConnection): Promise<void>;

  /** Nahradí veškerá data najednou (import s režimem "nahradit"). */
  replaceAll(data: {
    profiles: MemoryProfile[];
    memories: MemoryItem[];
    settings: ExtensionSettings;
  }): Promise<void>;

  /** Smaže úplně vše (vzpomínky, profily, nastavení, připojení). */
  wipeAll(): Promise<void>;
}
