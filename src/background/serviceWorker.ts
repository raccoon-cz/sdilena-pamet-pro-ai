import { ChromeStorageRepository } from "../storage/ChromeStorageRepository";
import { PROVIDER_HOST_PATTERNS } from "../shared/constants";
import { nowIso } from "../shared/ids";
import type { ProviderConnection, ProviderId } from "../memory/types";
import {
  isBackgroundRequest,
  isContentToBackgroundMessage,
  type BackgroundRequest,
  type ConnectProviderResponse,
  type DisconnectProviderResponse,
} from "../messaging/messages";

const repository = new ChromeStorageRepository();
const CONTENT_SCRIPT_FILE = "content/contentScript.js";

function scriptIdFor(provider: ProviderId): string {
  return `memory-content-${provider}`;
}

async function registerProviderScript(provider: ProviderId): Promise<void> {
  const id = scriptIdFor(provider);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: PROVIDER_HOST_PATTERNS[provider],
      js: [CONTENT_SCRIPT_FILE],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

async function unregisterProviderScript(provider: ProviderId): Promise<void> {
  const id = scriptIdFor(provider);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }
}

/** Okamžitě nastřelí content script i do už otevřených karet dané domény —
 * dynamická registrace se jinak projeví až při dalším načtení stránky. */
async function injectIntoOpenTabs(provider: ProviderId): Promise<void> {
  const tabs = await chrome.tabs.query({ url: PROVIDER_HOST_PATTERNS[provider] });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [CONTENT_SCRIPT_FILE],
      });
    } catch {
      // Karta může být systémová stránka nebo se zavřela mezitím — v pořádku.
    }
  }
}

async function notifyOpenTabsDeactivate(provider: ProviderId): Promise<void> {
  const tabs = await chrome.tabs.query({ url: PROVIDER_HOST_PATTERNS[provider] });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "bg:deactivate" });
    } catch {
      // Content script nemusí být v kartě vůbec nahraný — v pořádku.
    }
  }
}

async function connectProvider(provider: ProviderId): Promise<ConnectProviderResponse> {
  try {
    const granted = await chrome.permissions.request({
      origins: PROVIDER_HOST_PATTERNS[provider],
    });
    if (!granted) {
      return { ok: true, permissionGranted: false };
    }
    await registerProviderScript(provider);
    await injectIntoOpenTabs(provider);
    const connection: ProviderConnection = {
      provider,
      enabled: true,
      permissionGranted: true,
      lastDetectedAt: nowIso(),
    };
    await repository.saveConnection(connection);
    return { ok: true, permissionGranted: true };
  } catch (err) {
    return {
      ok: false,
      permissionGranted: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function disconnectProvider(provider: ProviderId): Promise<DisconnectProviderResponse> {
  await unregisterProviderScript(provider);
  await notifyOpenTabsDeactivate(provider);
  try {
    await chrome.permissions.remove({ origins: PROVIDER_HOST_PATTERNS[provider] });
  } catch {
    // Oprávnění mohlo být sdílené jinou funkcí prohlížeče — odregistrování
    // content scriptu proběhlo, to je z hlediska produktu podstatné.
  }
  const connection: ProviderConnection = {
    provider,
    enabled: false,
    permissionGranted: false,
  };
  await repository.saveConnection(connection);
  return { ok: true };
}

/** Po startu/instalaci znovu zaregistruje content scripty pro domény, na
 * které už uživatel dříve udělil oprávnění (perzistence napříč restarty
 * prohlížeče). */
async function reconcilePermissions(): Promise<void> {
  for (const provider of Object.keys(PROVIDER_HOST_PATTERNS) as ProviderId[]) {
    const hasPermission = await chrome.permissions.contains({
      origins: PROVIDER_HOST_PATTERNS[provider],
    });
    const connections = await repository.listConnections();
    const existing = connections.find((c) => c.provider === provider);
    if (hasPermission) {
      await registerProviderScript(provider);
      if (!existing?.permissionGranted) {
        await repository.saveConnection({
          provider,
          enabled: true,
          permissionGranted: true,
          lastDetectedAt: nowIso(),
        });
      }
    } else if (existing?.permissionGranted) {
      await repository.saveConnection({ provider, enabled: false, permissionGranted: false });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Starší Chrome bez podpory setPanelBehavior — akce prostě nic neudělá.
  });
  void reconcilePermissions();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcilePermissions();
});

/** Klávesová zkratka (výchozí Alt+Shift+M, uživatel si ji může přenastavit
 * v chrome://extensions/shortcuts) — alternativa k plovoucímu tlačítku,
 * které nemusí být na každé stránce ideálně umístěné. */
async function triggerMemoryPreviewOnActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "bg:trigger-memory-preview" });
  } catch {
    // Karta nemusí mít nahraný content script (nepřipojený provider nebo
    // nepodporovaná stránka) — v pořádku, prostě se nic nestane.
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-memory-preview") {
    void triggerMemoryPreviewOnActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isBackgroundRequest(message)) {
    void handleBackgroundRequest(message).then(sendResponse);
    return true;
  }
  if (isContentToBackgroundMessage(message)) {
    void repository
      .saveConnection({
        provider: message.diagnostics.provider,
        enabled: true,
        permissionGranted: true,
        lastDetectedAt: message.diagnostics.checkedAt,
      })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function handleBackgroundRequest(message: BackgroundRequest) {
  if (message.type === "sp:connect-provider") {
    return connectProvider(message.provider);
  }
  return disconnectProvider(message.provider);
}
