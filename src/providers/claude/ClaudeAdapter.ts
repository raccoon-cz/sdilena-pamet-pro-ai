import { BaseProviderAdapter } from "../BaseAdapter";
import {
  findBottommostMatching,
  findVisibleTextarea,
  type DetectionStrategy,
} from "../domUtils";

/**
 * Ověřeno na živé, přihlášené stránce (test z 22. 7. 2026 — viz README,
 * sekce "Živý test na přihlášených účtech") — strategie
 * `.ProseMirror[contenteditable]` composer spolehlivě našla. Obecné
 * fallbacky níže zůstávají pro případ, že Claude strukturu v budoucnu
 * změní; v sekci Nastavení → Diagnostika je vidět, která strategie skutečně
 * uspěla.
 */
export class ClaudeAdapter extends BaseProviderAdapter {
  id = "claude" as const;
  displayName = "Claude";
  supportedHosts = ["claude.ai"];

  protected getDetectionStrategies(): DetectionStrategy[] {
    return [
      {
        // Stránka může mít víc než jeden ProseMirror editor (např. otevřený
        // artefakt/canvas vedle chatu) — vybere ten nejblíže spodnímu
        // okraji, což je vždy composer, ne vedlejší editor.
        name: "claude:.ProseMirror[contenteditable]",
        find: () => findBottommostMatching('.ProseMirror[contenteditable="true"]'),
      },
      {
        name: "generic:bottommost-contenteditable",
        find: () => findBottommostMatching('[contenteditable="true"]'),
      },
      {
        name: "claude:fieldset contenteditable",
        find: () => findBottommostMatching('fieldset [contenteditable="true"]'),
      },
      {
        name: "claude:role=textbox",
        find: () => findBottommostMatching('[contenteditable="true"][role="textbox"]'),
      },
      {
        name: "generic:visible-textarea",
        find: findVisibleTextarea,
      },
    ];
  }
}
