/**
 * Plovoucí kulaté tlačítko "Použít paměť" vkládané do stránky ChatGPT/Claude.
 * Běží uvnitř shadow rootu, aby styly hostitelské stránky nemohly rozbít
 * vzhled tlačítka (a naopak). Jde o jediný prvek na stránku — opakované
 * volání `mountFloatingButton` je no-op, pokud už je připojený.
 *
 * Umístění (`positionButtonNear`) NENÍ jen "pár pixelů od rohu" — reálně
 * kontroluje kolize s ostatními prvky stránky (tlačítka, odkazy, upozornění
 * pod polem dotazu apod.) a vybírá první bezkolizní kandidátní pozici okolo
 * composeru (vlevo/vpravo/nad/pod). Composer navíc musí být předán jako
 * rect vizuální "karty" composeru (viz `findComposerSurface` v
 * `providers/domUtils.ts`), ne jen samotného textového pole — to je ta
 * jinak snadno přehlédnutelná příčina, proč dřívější pokusy o umístění
 * opakovaně kolidovaly s mikrofonem/Odeslat/upozorněním na různých
 * rozvrženích ChatGPT a Claude.
 */

import { t, type Language } from "../shared/i18n";

const HOST_ID = "shared-memory-floating-button-host";
const HOST_SIZE = 44;
const VISUAL_BUTTON_SIZE = 40;
const SURFACE_GAP = 8; // vizuálně ~10 px díky 2px marginu kruhu uvnitř hostu
const VIEWPORT_PADDING = 8;
const COLLISION_PADDING = 4;

type Placement =
  | "outside-left"
  | "outside-right"
  | "above-left"
  | "above-right"
  | "below-left"
  | "below-right"
  | "emergency";

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface PositionCandidate {
  left: number;
  top: number;
  placement: Placement;
}

let hostEl: HTMLDivElement | null = null;
let badgeEl: HTMLElement | null = null;
let buttonEl: HTMLButtonElement | null = null;

function buildStyle(): string {
  return `
    :host { all: initial; }
    .fab {
      box-sizing: border-box;
      width: ${VISUAL_BUTTON_SIZE}px;
      height: ${VISUAL_BUTTON_SIZE}px;
      margin: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: #0284c7;
      color: #ffffff;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2), 0 7px 18px rgba(15, 23, 42, 0.22);
      transition: transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
    }
    .fab:hover {
      background: #0876ac;
      transform: translateY(-1px);
      box-shadow: 0 3px 7px rgba(15, 23, 42, 0.22), 0 9px 22px rgba(15, 23, 42, 0.24);
    }
    .fab:active { transform: translateY(0) scale(0.96); }
    .fab:focus-visible { outline: 3px solid rgba(14, 165, 233, 0.42); outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) {
      .fab { transition: none; }
    }
    .badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #dc2626;
      color: #ffffff;
      border-radius: 999px;
      min-width: 17px;
      height: 17px;
      line-height: 17px;
      padding: 0 4px;
      font-size: 10.5px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
    }
    .badge.hidden { display: none; }
  `;
}

// --- Geometrie a kolize ----------------------------------------------------

function toBox(rect: DOMRectReadOnly): Box {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function makeBox(left: number, top: number): Box {
  return { left, top, right: left + HOST_SIZE, bottom: top + HOST_SIZE, width: HOST_SIZE, height: HOST_SIZE };
}

function expandBox(box: Box, amount: number): Box {
  return {
    left: box.left - amount,
    top: box.top - amount,
    right: box.right + amount,
    bottom: box.bottom + amount,
    width: box.width + amount * 2,
    height: box.height + amount * 2,
  };
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function intersectionArea(a: Box, b: Box): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getViewportBox(): Box {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width >= 1 &&
    rect.height >= 1 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

/** Skutečné prvky stránky (tlačítka, odkazy, upozornění…) v okolí composeru
 * — pozice se proti nim ověřuje, místo aby se odhadovala pevná mezera. */
function collectObstacleRects(composerRect: DOMRectReadOnly): Box[] {
  const result: Box[] = [];
  const neighborhood = expandBox(toBox(composerRect), HOST_SIZE + SURFACE_GAP + 48);

  const addElement = (element: HTMLElement): void => {
    if (!isElementVisible(element)) return;
    if (element === hostEl || hostEl?.contains(element)) return;
    const box = toBox(element.getBoundingClientRect());
    if (intersects(box, neighborhood)) result.push(box);
  };

  document
    .querySelectorAll<HTMLElement>(
      ["button", "a[href]", "input", "select", "textarea", '[role="button"]', '[role="menuitem"]'].join(","),
    )
    .forEach(addElement);

  // Jen nejvnitřnější textové uzly upozornění, ne průhledný full-width obal.
  document
    .querySelectorAll<HTMLElement>(['[data-testid="thread-disclaimer"] *', "small", '[role="status"]'].join(","))
    .forEach((element) => {
      const text = element.textContent?.trim() ?? "";
      if (!text) return;
      const hasTextChild = Array.from(element.children).some(
        (child) => (child.textContent?.trim().length ?? 0) > 0,
      );
      if (!hasTextChild) addElement(element);
    });

  return result;
}

function choosePosition(rect: DOMRectReadOnly): PositionCandidate {
  const viewport = getViewportBox();
  const composer = toBox(rect);

  const topInset = clamp((Math.min(rect.height, 60) - HOST_SIZE) / 2, 4, 8);
  const primaryTop = rect.top + topInset;
  const lowerRailTop = rect.bottom - HOST_SIZE - topInset;
  const aboveTop = rect.top - HOST_SIZE - SURFACE_GAP;
  const belowTop = rect.bottom + SURFACE_GAP;

  const candidates: PositionCandidate[] = [
    { left: rect.left - HOST_SIZE - SURFACE_GAP, top: primaryTop, placement: "outside-left" },
    { left: rect.right + SURFACE_GAP, top: primaryTop, placement: "outside-right" },
    // Druhá kolej níž, pro vysoký composer (např. Claude s víc řádky).
    { left: rect.left - HOST_SIZE - SURFACE_GAP, top: lowerRailTop, placement: "outside-left" },
    { left: rect.right + SURFACE_GAP, top: lowerRailTop, placement: "outside-right" },
    { left: rect.left + SURFACE_GAP, top: aboveTop, placement: "above-left" },
    { left: rect.right - HOST_SIZE - SURFACE_GAP, top: aboveTop, placement: "above-right" },
    { left: rect.left + SURFACE_GAP, top: belowTop, placement: "below-left" },
    { left: rect.right - HOST_SIZE - SURFACE_GAP, top: belowTop, placement: "below-right" },
  ];

  const obstacles = collectObstacleRects(rect)
    .map((box) => expandBox(box, COLLISION_PADDING))
    .concat(expandBox(composer, COLLISION_PADDING));

  const fitsViewport = (candidate: PositionCandidate): boolean => {
    const box = makeBox(candidate.left, candidate.top);
    return (
      box.left >= viewport.left + VIEWPORT_PADDING &&
      box.top >= viewport.top + VIEWPORT_PADDING &&
      box.right <= viewport.right - VIEWPORT_PADDING &&
      box.bottom <= viewport.bottom - VIEWPORT_PADDING
    );
  };

  const viable = candidates.filter(fitsViewport);

  const collisionFree = viable.find((candidate) => {
    const box = makeBox(candidate.left, candidate.top);
    return obstacles.every((obstacle) => !intersects(box, obstacle));
  });
  if (collisionFree) return collisionFree;

  if (viable.length > 0) {
    const ranked = viable
      .map((candidate, index) => {
        const box = makeBox(candidate.left, candidate.top);
        const overlap = obstacles.reduce((sum, obstacle) => sum + intersectionArea(box, obstacle), 0);
        return { candidate, overlap, index };
      })
      .sort((a, b) => a.overlap - b.overlap || a.index - b.index);
    const best = ranked[0];
    if (best) return best.candidate;
  }

  // Extrémně úzký viewport: zůstat aspoň viditelný.
  const maxLeft = Math.max(viewport.left + VIEWPORT_PADDING, viewport.right - VIEWPORT_PADDING - HOST_SIZE);
  const maxTop = Math.max(viewport.top + VIEWPORT_PADDING, viewport.bottom - VIEWPORT_PADDING - HOST_SIZE);
  return {
    left: clamp(rect.left - HOST_SIZE - SURFACE_GAP, viewport.left + VIEWPORT_PADDING, maxLeft),
    top: clamp(primaryTop, viewport.top + VIEWPORT_PADDING, maxTop),
    placement: "emergency",
  };
}

// --- Veřejné API -------------------------------------------------------------

export function isFloatingButtonMounted(): boolean {
  return !!hostEl && document.documentElement.contains(hostEl);
}

export function mountFloatingButton(onClick: () => void, lang: Language = "cs"): void {
  if (isFloatingButtonMounted()) return;

  hostEl = document.createElement("div");
  hostEl.id = HOST_ID;
  hostEl.dataset.aiMemoryFloating = "true";

  // Kritické styly nastavené s !important — stránka nesmí být schopná je
  // přebít vlastním (často velmi obecným) CSS.
  const criticalHostStyles: Record<string, string> = {
    position: "fixed",
    display: "block",
    width: `${HOST_SIZE}px`,
    height: `${HOST_SIZE}px`,
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
  for (const [property, value] of Object.entries(criticalHostStyles)) {
    hostEl.style.setProperty(property, value, "important");
  }

  const shadow = hostEl.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = buildStyle();

  buttonEl = document.createElement("button");
  buttonEl.className = "fab";
  buttonEl.type = "button";
  buttonEl.setAttribute("aria-label", t(lang, "contentButton.ariaLabel"));
  buttonEl.title = t(lang, "contentButton.title");
  buttonEl.textContent = "🧠";

  badgeEl = document.createElement("span");
  badgeEl.className = "badge hidden";

  buttonEl.append(badgeEl);
  buttonEl.addEventListener("click", onClick);

  shadow.append(style, buttonEl);
  document.documentElement.append(hostEl);
}

/** Aktuální poloha tlačítka na obrazovce — používá `factSuggestion.ts` k
 * umístění nabídky "Uložit jako vzpomínku?" hned vedle něj. */
export function getButtonRect(): DOMRect | null {
  return hostEl ? hostEl.getBoundingClientRect() : null;
}

export function unmountFloatingButton(): void {
  hostEl?.remove();
  hostEl = null;
  badgeEl = null;
  buttonEl = null;
}

/**
 * Umístí tlačítko na první bezkolizní místo okolo `rect` — musí to být rect
 * vizuální "karty" composeru (`findComposerSurface`), ne jen samotného
 * textového pole. Když composer nebyl nalezen, tlačítko se schová (nemá
 * smysl ho zobrazovat "někde na obrazovce" bez vztahu ke composeru).
 */
export function positionButtonNear(rect: DOMRect | null): void {
  if (!hostEl) return;

  if (!rect || rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
    hostEl.style.setProperty("visibility", "hidden", "important");
    return;
  }

  const position = choosePosition(rect);
  hostEl.style.setProperty("left", `${Math.round(position.left)}px`, "important");
  hostEl.style.setProperty("top", `${Math.round(position.top)}px`, "important");
  hostEl.style.setProperty("visibility", "visible", "important");
  hostEl.dataset.placement = position.placement;
}

export function setFloatingButtonBadge(count: number): void {
  if (!badgeEl) return;
  if (count > 0) {
    badgeEl.textContent = String(count);
    badgeEl.classList.remove("hidden");
  } else {
    badgeEl.classList.add("hidden");
  }
}
