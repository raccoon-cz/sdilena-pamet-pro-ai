import type { ProviderId } from "../memory/types";
import type { ProviderDiagnostics } from "../messaging/messages";

/**
 * Společné rozhraní pro každou podporovanou AI službu. Zbytek rozšíření
 * (tlačítko, náhled, background) pracuje jen s tímto rozhraním a nikdy
 * neví nic o konkrétní struktuře stránky ChatGPT nebo Claude.
 */
export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  supportedHosts: string[];

  isCurrentPageSupported(): boolean;
  findComposer(): HTMLElement | null;
  readComposerText(): string;
  replaceComposerText(text: string): Promise<boolean>;
  insertMemoryButton(): void;
  removeMemoryButton(): void;
  observePageChanges(): void;
  stopObserving(): void;
  getConversationKey(): string | null;
  runDiagnostics(): ProviderDiagnostics;
}
