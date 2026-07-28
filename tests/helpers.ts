import type { MemoryItem, MemoryProfile, ExtensionSettings } from "../src/memory/types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makeMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: nextId("mem"),
    text: "Vzorová vzpomínka",
    category: "other",
    profileId: "profile-1",
    keywords: [],
    alwaysUse: false,
    enabled: true,
    sensitivity: "normal",
    source: "manual",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<MemoryProfile> = {}): MemoryProfile {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: nextId("profile"),
    name: "Testovací profil",
    isDefault: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    activeProfileId: "profile-1",
    maxMemoriesPerPrompt: 8,
    maxAlwaysUseMemories: 3,
    maxContextCharacters: 2500,
    includeAlwaysUseMemories: true,
    showPreviewBeforeInsert: true,
    language: "cs",
    onboardingDismissed: false,
    ...overrides,
  };
}
