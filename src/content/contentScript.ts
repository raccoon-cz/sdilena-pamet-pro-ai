import { ChromeStorageRepository } from "../storage/ChromeStorageRepository";
import { selectRelevantMemories } from "../memory/relevance";
import { detectPersonalFact, type DetectedFact } from "../memory/factDetection";
import type { MemoryItem } from "../memory/types";
import { suggestKeywords } from "../shared/text";
import { createId, nowIso } from "../shared/ids";
import type { Language } from "../shared/i18n";
import { ChatGPTAdapter } from "../providers/chatgpt/ChatGPTAdapter";
import { ClaudeAdapter } from "../providers/claude/ClaudeAdapter";
import type { ProviderAdapter } from "../providers/ProviderAdapter";
import { openPreviewDialog } from "./previewDialog";
import { setFloatingButtonBadge } from "./memoryButton";
import { showFactSuggestion, hideFactSuggestion } from "./factSuggestion";
import type {
  BackgroundToContentMessage,
  ContentTabRequest,
  InsertResponse,
  TextResponse,
} from "../messaging/messages";

const repository = new ChromeStorageRepository();

function pickAdapter(lang: Language): ProviderAdapter | null {
  const hostname = window.location.hostname;
  const chatgpt = new ChatGPTAdapter(() => void openPreviewDialog(chatgpt, repository), lang);
  if (chatgpt.supportedHosts.includes(hostname)) return chatgpt;

  const claude = new ClaudeAdapter(() => void openPreviewDialog(claude, repository), lang);
  if (claude.supportedHosts.includes(hostname)) return claude;

  return null;
}

async function init(): Promise<void> {
  const { language } = await repository.getSettings();
  const adapter = pickAdapter(language);
  if (!adapter) return;

  let active = true;
  const BADGE_DEBOUNCE_MS = 400;
  let badgeTimeout: number | undefined;

  // Věty, které uživatel už uložil nebo odmítl v této relaci na této stránce
  // — nenabízíme je znovu, dokud se text nezmění na něco jiného.
  const handledFactSentences = new Set<string>();

  const saveFactAsMemory = async (fact: DetectedFact): Promise<void> => {
    const settings = await repository.getSettings();
    const now = nowIso();
    const memory: MemoryItem = {
      id: createId(),
      text: fact.sentence,
      category: fact.category,
      profileId: settings.activeProfileId,
      keywords: suggestKeywords(fact.sentence),
      alwaysUse: false,
      enabled: true,
      sensitivity: "normal",
      source: adapter.id,
      createdAt: now,
      updatedAt: now,
    };
    await repository.saveMemory(memory);
    handledFactSentences.add(fact.sentence);
  };

  const checkFactSuggestion = (query: string): void => {
    if (!query) {
      hideFactSuggestion();
      return;
    }
    const fact = detectPersonalFact(query);
    if (!fact || handledFactSentences.has(fact.sentence)) {
      hideFactSuggestion();
      return;
    }
    showFactSuggestion(
      fact.sentence,
      () => void saveFactAsMemory(fact),
      () => handledFactSentences.add(fact.sentence),
      language,
    );
  };

  const updateBadge = async () => {
    if (!active) return;
    const query = adapter.readComposerText().trim();
    checkFactSuggestion(query);
    if (!query) {
      setFloatingButtonBadge(0);
      return;
    }
    const [settings, memories] = await Promise.all([
      repository.getSettings(),
      repository.listMemories(),
    ]);
    const scored = selectRelevantMemories({
      query,
      activeProfileId: settings.activeProfileId,
      memories,
      settings,
    });
    setFloatingButtonBadge(scored.length);
  };

  document.addEventListener(
    "input",
    () => {
      if (!active) return;
      window.clearTimeout(badgeTimeout);
      badgeTimeout = window.setTimeout(() => void updateBadge(), BADGE_DEBOUNCE_MS);
    },
    true,
  );

  adapter.insertMemoryButton();
  adapter.observePageChanges();

  chrome.runtime
    .sendMessage({ type: "cs:report-diagnostics", diagnostics: adapter.runDiagnostics() })
    .catch(() => {
      // Background nemusí být v tuto chvíli dostupný — nekritické.
    });

  chrome.runtime.onMessage.addListener(
    (message: ContentTabRequest | BackgroundToContentMessage, _sender, sendResponse) => {
      if (!active) return false;

      if (message.type === "bg:deactivate") {
        adapter.stopObserving();
        adapter.removeMemoryButton();
        hideFactSuggestion();
        active = false;
        return false;
      }

      if (message.type === "bg:trigger-memory-preview") {
        // Klávesová zkratka — stejná akce jako kliknutí na plovoucí tlačítko.
        void openPreviewDialog(adapter, repository);
        return false;
      }

      if (message.type === "sp:get-selected-text") {
        const text = window.getSelection()?.toString() ?? "";
        const response: TextResponse = { ok: true, text };
        sendResponse(response);
        return true;
      }

      if (message.type === "sp:get-composer-text") {
        const response: TextResponse = { ok: true, text: adapter.readComposerText() };
        sendResponse(response);
        return true;
      }

      if (message.type === "sp:get-diagnostics") {
        sendResponse(adapter.runDiagnostics());
        return true;
      }

      if (message.type === "sp:insert-context") {
        void adapter.replaceComposerText(message.text).then((ok) => {
          const response: InsertResponse = { ok };
          sendResponse(response);
        });
        return true;
      }

      return false;
    },
  );
}

void init();
