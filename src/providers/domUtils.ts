/**
 * Sdílené DOM nástroje pro provider adaptéry. Nic z tohoto souboru nesmí
 * záviset na konkrétním webu — jde o obecné, znovupoužitelné strategie pro
 * hledání textového pole a bezpečné vložení textu do dynamických (React /
 * ProseMirror) editorů.
 *
 * POZNÁMKA K OVĚŘENÍ: Selektory v jednotlivých adaptérech (chatgpt/,
 * claude/) nebylo možné ověřit na živé, přihlášené stránce (viz TASKS.md).
 * Funkce v tomto souboru jsou proto navržené jako řetězec fallbacků, ne
 * jako spoléhání na jediný přesný selektor.
 */

export interface DetectionStrategy {
  name: string;
  find: () => HTMLElement | null;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

function isEditableCandidate(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (!isVisible(el)) return false;
  const isContentEditable = el.isContentEditable || el.getAttribute("contenteditable") === "true";
  const isTextarea = el.tagName === "TEXTAREA";
  return isContentEditable || isTextarea;
}

/** Vyzkouší strategie v zadaném pořadí a vrátí první nalezený prvek + jméno
 * strategie, která uspěla (pro diagnostiku). */
export function runDetectionStrategies(
  strategies: DetectionStrategy[],
): { element: HTMLElement; strategyName: string } | null {
  for (const strategy of strategies) {
    try {
      const element = strategy.find();
      if (element && isEditableCandidate(element)) {
        return { element, strategyName: strategy.name };
      }
    } catch {
      // Selektor mohl selhat kvůli změně stránky — zkusíme další strategii.
    }
  }
  return null;
}

/** Ze všech viditelných prvků odpovídajících `selector` vybere ten nejblíže
 * spodnímu okraji obrazovky. Composer je u chatovacích aplikací (ChatGPT,
 * Claude) prakticky vždy ukotvený dole — na rozdíl od "první v DOM" nebo
 * "největší plochy", které se snadno splete s jiným contenteditable polem
 * na stránce (např. otevřená editace předchozí zprávy, editor v postranním
 * panelu), je poloha u spodního okraje mnohem spolehlivější signál, že jde
 * skutečně o pole dotazu. */
export function findBottommostMatching(selector: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    isVisible,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((bottommost, current) =>
    current.getBoundingClientRect().bottom > bottommost.getBoundingClientRect().bottom
      ? current
      : bottommost,
  );
}

export function findBottommostVisibleContentEditable(): HTMLElement | null {
  return findBottommostMatching('[contenteditable="true"]');
}

export function findVisibleTextarea(): HTMLElement | null {
  return findBottommostMatching("textarea");
}

function visibleControlCount(root: HTMLElement): number {
  return Array.from(root.querySelectorAll<HTMLElement>('button, select, [role="button"]')).filter(
    isVisible,
  ).length;
}

/**
 * Textové pole (composer editor) NENÍ totéž co vizuální "karta" composeru —
 * u ChatGPT editor nezahrnuje tlačítko „+“ ani panel s modelem/mikrofonem
 * vpravo, u Claude nezahrnuje celý spodní toolbar vůbec. Umísťovat cokoli
 * podle `editor.getBoundingClientRect()` proto vede ke kolizím s ovládacími
 * prvky, které leží mimo tenhle rect, ale vizuálně jsou "součástí" stejného
 * zaobleného boxu.
 *
 * Tahle funkce vystoupá od editoru nahoru DOM stromem a najde nejbližšího
 * předka, který geometricky vypadá jako celá vizuální karta composeru
 * (obsahuje šířku editoru, má zaoblené rohy, obsahuje aspoň dva viditelné
 * ovládací prvky) — bez spoléhání na konkrétní CSS třídy nebo strukturu
 * jednotlivé stránky.
 */
export function findComposerSurface(editor: HTMLElement): HTMLElement {
  const editorRect = editor.getBoundingClientRect();
  const ancestors: HTMLElement[] = [];

  let current: HTMLElement | null = editor;
  for (let depth = 0; current && depth < 10; depth += 1) {
    ancestors.push(current);
    current = current.parentElement;
  }

  const geometricallyMatched = ancestors.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;

    const horizontallyContainsEditor =
      rect.left <= editorRect.left + 24 && rect.right >= editorRect.right - 24;
    const reasonableHeight =
      rect.height >= 44 && rect.height <= Math.min(520, window.innerHeight * 0.65);

    return (
      horizontallyContainsEditor &&
      reasonableHeight &&
      radius >= 12 &&
      visibleControlCount(element) >= 2
    );
  });

  if (geometricallyMatched) return geometricallyMatched;

  // Fallback: běžný sémantický obal formuláře (ChatGPT `<form>`, Claude
  // `<fieldset>`), pokud geometrická shoda selže.
  const semanticContainer = editor.closest<HTMLElement>("form, fieldset");
  if (semanticContainer) {
    const rect = semanticContainer.getBoundingClientRect();
    if (rect.height >= 44 && rect.height <= Math.min(520, window.innerHeight * 0.65)) {
      return semanticContainer;
    }
  }

  return editor.parentElement ?? editor;
}

export function readEditableText(el: HTMLElement): string {
  if (el.tagName === "TEXTAREA") {
    return (el as HTMLTextAreaElement).value;
  }
  return el.innerText ?? el.textContent ?? "";
}

function setNativeTextareaValue(textarea: HTMLTextAreaElement, text: string): void {
  const proto = window.HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(textarea, text);
  } else {
    textarea.value = text;
  }
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectAllContents(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Rich-text editory postavené nad frameworkem (ProseMirror u Claude apod.)
 * si drží vlastní interní model dokumentu a při dalším renderu přepíšou
 * jakoukoli přímou DOM manipulaci nebo `execCommand("insertText")` výsledek
 * zpět na starý obsah — proto se navenek zdálo, že vložení "nefunguje"
 * (dialog se zavřel, ale composer zůstal beze změny). Tyto editory ale
 * standardně naslouchají nativní `paste` událost a její obsah zpracují přes
 * svůj vlastní transformační pipeline, takže simulace vložení ze schránky
 * je nejspolehlivější cesta, jak text skutečně dostat do interního stavu. */
function tryClipboardPaste(el: HTMLElement, text: string): boolean {
  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", text);
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    const notCancelled = el.dispatchEvent(pasteEvent);
    // `dispatchEvent` vrací `false`, pokud volaný handler zavolal
    // `preventDefault()` — to je tady žádoucí signál, že editor vložení
    // sám zpracoval (ProseMirror `handlePaste` dělá přesně tohle).
    return !notCancelled;
  } catch {
    return false;
  }
}

function tryExecCommandInsertText(text: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  try {
    return document.execCommand("insertText", false, text);
  } catch {
    return false;
  }
}

/** Jen ProseMirror (Claude) je znám tím, že si `execCommand`/přímý zápis
 * po dalším renderu přepíše zpátky — proto pro něj dává smysl zkoušet
 * simulaci vložení ze schránky jako první. Jiné editory (ChatGPT apod.)
 * mívají vlastní posluchač na `paste` (kvůli vkládání obrázků/formátování),
 * který si vložený text zpracuje po svém a nemusí respektovat "vyber celý
 * obsah" tak jako ověřený `execCommand` — u nich by to vedlo k tomu, že
 * starý text zůstane a nový se jen přilepí za něj. */
function isProseMirrorEditor(el: HTMLElement): boolean {
  return el.classList.contains("ProseMirror");
}

function setContentEditableText(el: HTMLElement, text: string): boolean {
  selectAllContents(el);

  const strategies = isProseMirrorEditor(el)
    ? [() => tryClipboardPaste(el, text), () => tryExecCommandInsertText(text)]
    : [() => tryExecCommandInsertText(text), () => tryClipboardPaste(el, text)];

  for (const strategy of strategies) {
    if (strategy()) return true;
    selectAllContents(el);
  }

  el.textContent = text;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/** Nastaví text do textového pole a korektně vyvolá `input`/`change`
 * události tak, aby si framework stránky (React/ProseMirror) všiml změny. */
export async function writeEditableText(el: HTMLElement, text: string): Promise<boolean> {
  try {
    if (el.tagName === "TEXTAREA") {
      setNativeTextareaValue(el as HTMLTextAreaElement, text);
      return true;
    }
    return setContentEditableText(el, text);
  } catch {
    return false;
  }
}
