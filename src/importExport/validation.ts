import type { MemoryExport, MemoryItem, MemoryProfile } from "../memory/types";
import { CATEGORY_ORDER, IMPORT_LIMITS } from "../shared/constants";
import { t, type Language } from "../shared/i18n";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: MemoryExport;
}

const VALID_CATEGORIES = new Set<string>(CATEGORY_ORDER);
const VALID_SENSITIVITY = new Set(["normal", "sensitive"]);
const VALID_SOURCE = new Set(["manual", "chatgpt", "claude", "import"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidProfile(value: unknown): value is MemoryProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.isDefault === "boolean" &&
    typeof value.enabled === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isValidMemory(value: unknown): value is MemoryItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.text === "string" &&
    typeof value.category === "string" &&
    VALID_CATEGORIES.has(value.category) &&
    typeof value.profileId === "string" &&
    Array.isArray(value.keywords) &&
    value.keywords.every((k) => typeof k === "string") &&
    typeof value.alwaysUse === "boolean" &&
    typeof value.enabled === "boolean" &&
    typeof value.sensitivity === "string" &&
    VALID_SENSITIVITY.has(value.sensitivity) &&
    typeof value.source === "string" &&
    VALID_SOURCE.has(value.source) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

/**
 * Ověří strukturu importovaného JSON souboru. Nikdy nevyhazuje výjimku —
 * poškozený / cizí soubor vrátí jen jako seznam srozumitelných chyb, aby
 * uživatel dostal jasnou zprávu místo pádu rozšíření.
 */
export function validateImportPayload(raw: unknown, lang: Language = "cs"): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { valid: false, errors: [t(lang, "validation.notJsonObject")] };
  }

  if (raw.formatVersion !== 1) {
    errors.push(t(lang, "validation.unknownFormatVersion"));
  }

  if (!Array.isArray(raw.profiles)) {
    errors.push(t(lang, "validation.missingProfiles"));
  }
  if (!Array.isArray(raw.memories)) {
    errors.push(t(lang, "validation.missingMemories"));
  }
  if (!isRecord(raw.settings)) {
    errors.push(t(lang, "validation.missingSettings"));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const profilesRaw = raw.profiles as unknown[];
  const memoriesRaw = raw.memories as unknown[];

  if (profilesRaw.length > IMPORT_LIMITS.maxProfiles) {
    errors.push(t(lang, "validation.tooManyProfiles", { max: IMPORT_LIMITS.maxProfiles }));
  }
  if (memoriesRaw.length > IMPORT_LIMITS.maxMemories) {
    errors.push(t(lang, "validation.tooManyMemories", { max: IMPORT_LIMITS.maxMemories }));
  }

  const invalidProfiles = profilesRaw.filter((p) => !isValidProfile(p)).length;
  if (invalidProfiles > 0) {
    errors.push(t(lang, "validation.invalidProfiles", { count: invalidProfiles }));
  }

  const invalidMemories = memoriesRaw.filter((m) => !isValidMemory(m)).length;
  if (invalidMemories > 0) {
    errors.push(t(lang, "validation.invalidMemories", { count: invalidMemories }));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: raw as unknown as MemoryExport,
  };
}

export function checkFileSize(sizeBytes: number, lang: Language = "cs"): string | null {
  if (sizeBytes > IMPORT_LIMITS.maxFileSizeBytes) {
    const maxMb = (IMPORT_LIMITS.maxFileSizeBytes / (1024 * 1024)).toFixed(0);
    return t(lang, "validation.fileTooLarge", { max: maxMb });
  }
  return null;
}
