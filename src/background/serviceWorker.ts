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

/** `registerProviderScript`/`unregisterProviderScript` mění stav, na který
 * se čeká z víc míst (start prohlížeče, ruční „Připojit"/"Odpojit") — zámek
 * podle providera zajistí, že se pro jednu službu nikdy nepřekryjí. */
const providerLocks = new Map<ProviderId, Promise<unknown>>();

function runExclusive<T>(provider: ProviderId, task: () => Promise<T>): Promise<T> {
  const previous = providerLocks.get(provider) ?? Promise.resolve();
  const run = previous.then(task, task);
  // Uložená verze zámku nikdy sama neselže, aby chyba jednoho volání
  // nezablokovala frontu pro další.
  providerLocks.set(provider, run.catch(() => {}));
  return run;
}

function isScriptErrorMatching(err: unknown, needle: string): boolean {
  return err instanceof Error && err.message.includes(needle);
}

/** Odregistruje skript pro dané ID, pokud existuje — bez ohledu na to, co
 * říká `getRegisteredContentScripts` předem. Registrace s
 * `persistAcrossSessions: true` přežívají restart service workeru a jejich
 * propsání do `getRegisteredContentScripts` může chvíli trvat, takže dotaz
 * "existuje už?" nelze brát jako spolehlivý zdroj pravdy — jde se rovnou
 * o mutaci samotnou a případná chyba "neexistuje" se tiše zahodí. */
async function unregisterIfPresent(id: string): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch (err) {
    if (!isScriptErrorMatching(err, "does not exist") && !isScriptErrorMatching(err, "No matching")) {
      throw err;
    }
  }
}

async function registerProviderScript(provider: ProviderId): Promise<void> {
  return runExclusive(provider, async () => {
    const id = scriptIdFor(provider);
    await unregisterIfPresent(id);
    try {
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches: PROVIDER_HOST_PATTERNS[provider],
          js: [CONTENT_SCRIPT_FILE],
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    } catch (err) {
      // I po odregistrování výše může Chrome nahlásit duplicitu (persistovaná
      // registrace z předchozí relace se propíše se zpožděním) — pokud skript
      // se stejným ID už fakticky existuje, je to přesně stav, který
      // chceme, ne chyba.
      if (!isScriptErrorMatching(err, "Duplicate script ID")) {
        throw err;
      }
    }
  });
}

async function unregisterProviderScript(provider: ProviderId): Promise<void> {
  return runExclusive(provider, () => unregisterIfPresent(scriptIdFor(provider)));
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
 * prohlížeče), a rovnou je nastřelí i do už otevřených karet — jinak by
 * karta otevřená před reloadem/aktualizací rozšíření zůstala s neplatným
 * (odpojeným) content scriptem až do ručního obnovení stránky. */
async function reconcilePermissions(): Promise<void> {
  for (const provider of Object.keys(PROVIDER_HOST_PATTERNS) as ProviderId[]) {
    const hasPermission = await chrome.permissions.contains({
      origins: PROVIDER_HOST_PATTERNS[provider],
    });
    const connections = await repository.listConnections();
    const existing = connections.find((c) => c.provider === provider);
    if (hasPermission) {
      await registerProviderScript(provider);
      await injectIntoOpenTabs(provider);
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
  reconcilePermissions().catch(() => {
    // Volané bez čekání při startu/instalaci — případná chyba (např. race
    // se souběžným "Připojit") se tiše zahodí, aby neskončila jako
    // nezachycené odmítnutí v chrome://extensions.
  });
});

chrome.runtime.onStartup.addListener(() => {
  reconcilePermissions().catch(() => {
    // Volané bez čekání při startu/instalaci — případná chyba (např. race
    // se souběžným "Připojit") se tiše zahodí, aby neskončila jako
    // nezachycené odmítnutí v chrome://extensions.
  });
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
