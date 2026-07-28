import type { ExtensionSettings, MemoryCategory } from "../memory/types";
import { t, type Language, type TranslationKey } from "./i18n";

export const STORAGE_KEYS = {
  memories: "memories",
  profiles: "profiles",
  settings: "settings",
  connections: "connections",
  schemaVersion: "schemaVersion",
} as const;

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  activeProfileId: "",
  maxMemoriesPerPrompt: 8,
  maxAlwaysUseMemories: 3,
  maxContextCharacters: 2500,
  includeAlwaysUseMemories: true,
  showPreviewBeforeInsert: true,
  language: "cs",
  onboardingDismissed: false,
};

const CATEGORY_TRANSLATION_KEYS: Record<MemoryCategory, TranslationKey> = {
  about: "category.about",
  work: "category.work",
  projects: "category.projects",
  response_preferences: "category.response_preferences",
  people_companies: "category.people_companies",
  finance: "category.finance",
  family: "category.family",
  other: "category.other",
};

export function getCategoryLabel(lang: Language, category: MemoryCategory): string {
  return t(lang, CATEGORY_TRANSLATION_KEYS[category]);
}

export const CATEGORY_ORDER: MemoryCategory[] = [
  "about",
  "work",
  "projects",
  "response_preferences",
  "people_companies",
  "finance",
  "family",
  "other",
];

export function getDefaultProfileName(lang: Language): string {
  return t(lang, "defaults.profileName");
}

export const IMPORT_LIMITS = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxMemories: 5000,
  maxProfiles: 200,
} as const;

export const PROVIDER_HOST_PATTERNS: Record<"chatgpt" | "claude", string[]> = {
  chatgpt: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  claude: ["https://claude.ai/*"],
};
