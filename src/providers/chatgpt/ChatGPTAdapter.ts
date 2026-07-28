import { BaseProviderAdapter } from "../BaseAdapter";
import {
  findBottommostVisibleContentEditable,
  findVisibleTextarea,
  type DetectionStrategy,
} from "../domUtils";

/**
 * Ověřeno na živé, přihlášené stránce (test z 22. 7. 2026 — viz README,
 * sekce "Živý test na přihlášených účtech") — strategie `#prompt-textarea`
 * composer spolehlivě našla. Obecné fallbacky níže zůstávají pro případ, že
 * ChatGPT strukturu v budoucnu změní; v sekci Nastavení → Diagnostika je
 * vidět, která strategie skutečně uspěla.
 */
export class ChatGPTAdapter extends BaseProviderAdapter {
  id = "chatgpt" as const;
  displayName = "ChatGPT";
  supportedHosts = ["chatgpt.com", "chat.openai.com"];

  protected getDetectionStrategies(): DetectionStrategy[] {
    return [
      {
        name: "chatgpt:#prompt-textarea",
        find: () => document.querySelector<HTMLElement>("#prompt-textarea"),
      },
      {
        // Composer je vždy u spodního okraje obrazovky — spolehlivější
        // signál než výběr prvního nalezeného contenteditable, který se
        // snadno splete s jiným polem na stránce (např. otevřená editace
        // zprávy nebo composer v postranním panelu u ChatGPT "Projektů").
        // Zahrnuje i případy `form [contenteditable]`/`role="textbox"" —
        // ty jsou jen podmnožinou tohoto obecnějšího výběru.
        name: "generic:bottommost-contenteditable",
        find: findBottommostVisibleContentEditable,
      },
      {
        name: "generic:visible-textarea",
        find: findVisibleTextarea,
      },
    ];
  }
}
