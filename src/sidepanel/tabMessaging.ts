import { PROVIDER_HOST_PATTERNS } from "../shared/constants";
import type { ContentTabRequest, TextResponse } from "../messaging/messages";

function hostMatchesPattern(hostname: string, pattern: string): boolean {
  const host = pattern.replace("https://", "").replace("/*", "");
  return hostname === host;
}

function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return Object.values(PROVIDER_HOST_PATTERNS)
      .flat()
      .some((pattern) => hostMatchesPattern(hostname, pattern));
  } catch {
    return false;
  }
}

/** Najde aktivní kartu podporované AI služby v aktuálním okně (pokud
 * uživatel danou službu připojil — bez oprávnění na doménu nejde její URL
 * ani rozeznat). */
export async function getActiveSupportedTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id === undefined) return null;
  return isSupportedUrl(tab.url) ? tab : null;
}

export async function sendToActiveTab<T = TextResponse>(
  message: ContentTabRequest,
): Promise<T | null> {
  const tab = await getActiveSupportedTab();
  if (!tab || tab.id === undefined) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    return null;
  }
}
