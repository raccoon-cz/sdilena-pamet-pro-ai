import type { Language } from "../shared/i18n";

export type MemoryCategory =
  | "about"
  | "work"
  | "projects"
  | "response_preferences"
  | "people_companies"
  | "finance"
  | "family"
  | "other";

export interface MemoryItem {
  id: string;
  text: string;
  category: MemoryCategory;
  profileId: string;
  keywords: string[];
  alwaysUse: boolean;
  enabled: boolean;
  sensitivity: "normal" | "sensitive";
  source: "manual" | "chatgpt" | "claude" | "import";
  createdAt: string;
  updatedAt: string;
}

export interface MemoryProfile {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProviderId = "chatgpt" | "claude";

export interface ProviderConnection {
  provider: ProviderId;
  enabled: boolean;
  permissionGranted: boolean;
  lastDetectedAt?: string;
}

export interface ExtensionSettings {
  activeProfileId: string;
  maxMemoriesPerPrompt: number;
  /** Kolik "upřednostněných" (alwaysUse) vzpomínek smí nejvýš obsadit místo
   * v jednom dotazu — zbytek maxMemoriesPerPrompt je vždy vyhrazený pro
   * vzpomínky vybrané podle relevance k dotazu, i kdyby uživatel označil
   * "upřednostnit" u desítek vzpomínek najednou. */
  maxAlwaysUseMemories: number;
  maxContextCharacters: number;
  includeAlwaysUseMemories: boolean;
  showPreviewBeforeInsert: boolean;
  /** Jazyk rozhraní (side panel i text vkládaný do ChatGPT/Claude). Nemá
   * vliv na to, v jakém jazyce si uživatel píše vzpomínky nebo dotazy — ty
   * fungují v obou jazycích bez ohledu na toto nastavení. */
  language: Language;
  /** Uživatel zavřel úvodní uvítací kartu na Přehledu — jde se k ní kdykoli
   * vrátit tlačítkem v Nastavení, tohle jen řídí, jestli se zobrazuje sama
   * od sebe. */
  onboardingDismissed: boolean;
}

export interface MemoryExport {
  formatVersion: 1;
  exportedAt: string;
  profiles: MemoryProfile[];
  memories: MemoryItem[];
  settings: ExtensionSettings;
}

/** Výsledek výběru relevance pro jednu vzpomínku — score je čistě
 * diagnostická/testovací informace, uživateli se nezobrazuje jako "AI skóre". */
export interface ScoredMemory {
  memory: MemoryItem;
  score: number;
  matchedKeywords: string[];
}

export interface RelevanceInput {
  query: string;
  activeProfileId: string;
  memories: MemoryItem[];
  settings: Pick<
    ExtensionSettings,
    | "maxMemoriesPerPrompt"
    | "maxAlwaysUseMemories"
    | "maxContextCharacters"
    | "includeAlwaysUseMemories"
  >;
}
