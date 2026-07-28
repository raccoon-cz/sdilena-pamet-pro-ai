import type {
  ExtensionSettings,
  MemoryItem,
  MemoryProfile,
  ProviderConnection,
} from "../memory/types";
import type { MemoryRepository } from "../storage/MemoryRepository";
import { ChromeStorageRepository } from "../storage/ChromeStorageRepository";
import { getDefaultProfileName } from "../shared/constants";
import { createId, nowIso } from "../shared/ids";

export interface AppStore {
  repository: MemoryRepository;
  memories: MemoryItem[];
  profiles: MemoryProfile[];
  settings: ExtensionSettings;
  connections: ProviderConnection[];
}

const repository = new ChromeStorageRepository();

/** Zajistí, že existuje aspoň jeden profil a nastavení na něj ukazuje.
 * Netechnický uživatel nemá při prvním spuštění nic konfigurovat ručně. */
async function ensureDefaultProfile(): Promise<void> {
  const profiles = await repository.listProfiles();
  if (profiles.length > 0) return;

  const settings = await repository.getSettings();
  const now = nowIso();
  const profile: MemoryProfile = {
    id: createId(),
    name: getDefaultProfileName(settings.language),
    isDefault: true,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  await repository.saveProfile(profile);

  if (!settings.activeProfileId) {
    await repository.saveSettings({ ...settings, activeProfileId: profile.id });
  }
}

export async function loadStore(): Promise<AppStore> {
  await ensureDefaultProfile();
  const [memories, profiles, settings, connections] = await Promise.all([
    repository.listMemories(),
    repository.listProfiles(),
    repository.getSettings(),
    repository.listConnections(),
  ]);

  // Pojistka, pokud aktivní profil mezitím zmizel (smazán) — spadneme na
  // výchozí, nebo první dostupný.
  let activeProfileId = settings.activeProfileId;
  if (!profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? "";
    if (activeProfileId !== settings.activeProfileId) {
      await repository.saveSettings({ ...settings, activeProfileId });
      settings.activeProfileId = activeProfileId;
    }
  }

  return { repository, memories, profiles, settings, connections };
}
