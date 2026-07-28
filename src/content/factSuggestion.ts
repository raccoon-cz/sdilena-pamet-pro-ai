/**
 * Nenápadná nabídka "Uložit jako vzpomínku?" — objeví se u plovoucího
 * tlačítka, když `detectPersonalFact` rozpozná v rozepsaném textu osobní
 * sdělení. Nic se neukládá automaticky: uživatel musí sám kliknout na
 * "Uložit", jinak nabídka jen zmizí spolu se změnou textu.
 */

import { getButtonRect } from "./memoryButton";
import { t, type Language } from "../shared/i18n";

const HOST_ID = "shared-memory-fact-suggestion-host";
const MAX_PREVIEW_LENGTH = 70;

function buildStyle(): string {
  return `
    :host { all: initial; }
    .banner {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 260px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.18);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .title {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .preview {
      font-size: 12px;
      color: #475569;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    button {
      border: none;
      border-radius: 7px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .save { background: #0284c7; color: #ffffff; }
    .save:hover { filter: brightness(0.95); }
    .dismiss { background: #f1f5f9; color: #475569; }
    .dismiss:hover { background: #e2e8f0; }
  `;
}

let hostEl: HTMLElement | null = null;

function truncate(text: string): string {
  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…` : text;
}

/** Kritické styly nastavené s !important — bez `position: fixed` na
 * hostiteli samotném (ne jen na `.banner` uvnitř shadow rootu) by nastavení
 * `top`/`left` v `position()` níže nemělo žádný vizuální efekt, protože
 * u staticky pozicovaného prvku se tyto vlastnosti ignorují — host by tak
 * kolaboval na 0 × 0 px na výchozí pozici v toku dokumentu. */
function applyHostBaseStyles(host: HTMLElement): void {
  const styles: Record<string, string> = {
    position: "fixed",
    display: "block",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    "box-sizing": "border-box",
    visibility: "hidden",
    "z-index": "2147483647",
    inset: "auto",
    transform: "none",
  };
  for (const [property, value] of Object.entries(styles)) {
    host.style.setProperty(property, value, "important");
  }
}

function position(): void {
  if (!hostEl) return;
  const buttonRect = getButtonRect();
  const rect = hostEl.getBoundingClientRect();
  const margin = 8;

  let top: number;
  let left: number;
  if (buttonRect) {
    top = buttonRect.top - rect.height - 10;
    left = buttonRect.right - rect.width;
  } else {
    top = window.innerHeight - rect.height - 90;
    left = window.innerWidth - rect.width - 20;
  }

  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));

  hostEl.style.setProperty("top", `${top}px`, "important");
  hostEl.style.setProperty("left", `${left}px`, "important");
  hostEl.style.setProperty("visibility", "visible", "important");
}

export function isFactSuggestionVisible(): boolean {
  return !!hostEl && document.documentElement.contains(hostEl);
}

export function showFactSuggestion(
  sentence: string,
  onSave: () => void,
  onDismiss: () => void,
  lang: Language = "cs",
): void {
  hideFactSuggestion();

  hostEl = document.createElement("div");
  hostEl.id = HOST_ID;
  applyHostBaseStyles(hostEl);
  const shadow = hostEl.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildStyle();

  const banner = document.createElement("div");
  banner.className = "banner";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = t(lang, "factSuggestion.title");

  const preview = document.createElement("div");
  preview.className = "preview";
  preview.textContent = truncate(sentence);

  const actions = document.createElement("div");
  actions.className = "actions";

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "dismiss";
  dismissBtn.type = "button";
  dismissBtn.textContent = t(lang, "factSuggestion.dismissButton");
  dismissBtn.addEventListener("click", () => {
    onDismiss();
    hideFactSuggestion();
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "save";
  saveBtn.type = "button";
  saveBtn.textContent = t(lang, "factSuggestion.saveButton");
  saveBtn.addEventListener("click", () => {
    onSave();
    hideFactSuggestion();
  });

  actions.append(dismissBtn, saveBtn);
  banner.append(title, preview, actions);
  shadow.append(style, banner);
  document.body.append(hostEl);

  position();
}

export function hideFactSuggestion(): void {
  hostEl?.remove();
  hostEl = null;
}

export function repositionFactSuggestion(): void {
  position();
}
