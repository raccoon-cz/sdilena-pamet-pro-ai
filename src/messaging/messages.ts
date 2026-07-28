import type { ProviderId } from "../memory/types";

/** Technická diagnostika jedné stránky/adaptéru. Nesmí obsahovat žádný
 * obsah zpráv nebo vzpomínek uživatele — jen technické stavy. */
export interface ProviderDiagnostics {
  provider: ProviderId;
  hostname: string;
  pageSupported: boolean;
  composerFound: boolean;
  detectionStrategy: string | null;
  buttonInserted: boolean;
  lastError: string | null;
  checkedAt: string;
}

// --- Side panel -> Background --------------------------------------------

export interface ConnectProviderRequest {
  type: "sp:connect-provider";
  provider: ProviderId;
}

export interface DisconnectProviderRequest {
  type: "sp:disconnect-provider";
  provider: ProviderId;
}

export type BackgroundRequest = ConnectProviderRequest | DisconnectProviderRequest;

export interface ConnectProviderResponse {
  ok: boolean;
  permissionGranted: boolean;
  error?: string;
}

export interface DisconnectProviderResponse {
  ok: boolean;
}

// --- Content script -> Background ----------------------------------------

export interface ReportDiagnosticsMessage {
  type: "cs:report-diagnostics";
  diagnostics: ProviderDiagnostics;
}

export type ContentToBackgroundMessage = ReportDiagnosticsMessage;

// --- Side panel -> Content script (přímo přes chrome.tabs.sendMessage) ---

export interface GetSelectedTextRequest {
  type: "sp:get-selected-text";
}
export interface GetComposerTextRequest {
  type: "sp:get-composer-text";
}
export interface GetDiagnosticsRequest {
  type: "sp:get-diagnostics";
}
export interface InsertContextRequest {
  type: "sp:insert-context";
  text: string;
}

export type ContentTabRequest =
  | GetSelectedTextRequest
  | GetComposerTextRequest
  | GetDiagnosticsRequest
  | InsertContextRequest;

export interface TextResponse {
  ok: boolean;
  text: string;
}
export interface InsertResponse {
  ok: boolean;
}

// --- Background -> Content script -----------------------------------------

export interface DeactivateMessage {
  type: "bg:deactivate";
}

/** Odesláno z background service workeru po stisku klávesové zkratky
 * (chrome.commands) — content script na to reaguje stejně jako na kliknutí
 * na plovoucí tlačítko. */
export interface TriggerMemoryPreviewMessage {
  type: "bg:trigger-memory-preview";
}

export type BackgroundToContentMessage = DeactivateMessage | TriggerMemoryPreviewMessage;

export function isBackgroundRequest(msg: unknown): msg is BackgroundRequest {
  return (
    !!msg &&
    typeof msg === "object" &&
    ((msg as { type?: string }).type === "sp:connect-provider" ||
      (msg as { type?: string }).type === "sp:disconnect-provider")
  );
}

export function isContentToBackgroundMessage(
  msg: unknown,
): msg is ContentToBackgroundMessage {
  return (
    !!msg &&
    typeof msg === "object" &&
    (msg as { type?: string }).type === "cs:report-diagnostics"
  );
}
