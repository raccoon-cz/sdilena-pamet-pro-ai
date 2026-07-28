import type { ProviderAdapter } from "./ProviderAdapter";
import type { ProviderDiagnostics } from "../messaging/messages";
import type { ProviderId } from "../memory/types";
import {
  runDetectionStrategies,
  readEditableText,
  writeEditableText,
  findComposerSurface,
  type DetectionStrategy,
} from "./domUtils";
import {
  mountFloatingButton,
  unmountFloatingButton,
  isFloatingButtonMounted,
  positionButtonNear,
} from "../content/memoryButton";
import { isFactSuggestionVisible, repositionFactSuggestion } from "../content/factSuggestion";
import { t, type Language } from "../shared/i18n";

const RECONCILE_DEBOUNCE_MS = 400;

/**
 * Společná implementace pro všechny provider adaptéry. Konkrétní adaptér
 * (ChatGPT, Claude) dodává jen seznam detekčních strategií a základní
 * identitu (id/název/domény) — zbytek (vkládání textu, plovoucí tlačítko,
 * sledování SPA navigace, diagnostika) je sdílené.
 */
export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract id: ProviderId;
  abstract displayName: string;
  abstract supportedHosts: string[];

  private lastStrategyName: string | null = null;
  private lastError: string | null = null;
  private buttonMounted = false;
  private observer: MutationObserver | null = null;
  private reconcileTimeout: number | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private observedComposer: HTMLElement | null = null;
  private observedSurface: HTMLElement | null = null;
  private positionFrame: number | undefined;
  private readonly onActivate: () => void;
  private readonly lang: Language;
  private readonly handleWindowChange: () => void;

  constructor(onActivate: () => void, lang: Language = "cs") {
    this.onActivate = onActivate;
    this.lang = lang;
    this.handleWindowChange = () => this.schedulePositionUpdate();
  }

  protected abstract getDetectionStrategies(): DetectionStrategy[];

  isCurrentPageSupported(): boolean {
    return this.supportedHosts.includes(window.location.hostname);
  }

  findComposer(): HTMLElement | null {
    const result = runDetectionStrategies(this.getDetectionStrategies());
    this.lastStrategyName = result?.strategyName ?? null;
    if (!result) {
      this.lastError = t(this.lang, "adapter.composerNotFound");
    }
    return result?.element ?? null;
  }

  readComposerText(): string {
    const composer = this.findComposer();
    return composer ? readEditableText(composer) : "";
  }

  async replaceComposerText(text: string): Promise<boolean> {
    const composer = this.findComposer();
    if (!composer) {
      this.lastError = t(this.lang, "adapter.insertNoComposer");
      return false;
    }
    const ok = await writeEditableText(composer, text);
    if (!ok) {
      this.lastError = t(this.lang, "adapter.insertFailed");
    }
    return ok;
  }

  insertMemoryButton(): void {
    mountFloatingButton(this.onActivate, this.lang);
    this.buttonMounted = true;
  }

  removeMemoryButton(): void {
    unmountFloatingButton();
    this.buttonMounted = false;
  }

  observePageChanges(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      window.clearTimeout(this.reconcileTimeout);
      this.reconcileTimeout = window.setTimeout(() => this.reconcile(), RECONCILE_DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", this.handleWindowChange, { passive: true });
    // `capture: true`, aby scroll uvnitř vnořeného scrollovacího kontejneru
    // (scroll nebublá) taky vyvolal přepočet pozice.
    document.addEventListener("scroll", this.handleWindowChange, { capture: true, passive: true });
    this.reconcile();
  }

  stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedComposer = null;
    this.observedSurface = null;
    window.clearTimeout(this.reconcileTimeout);
    if (this.positionFrame !== undefined) cancelAnimationFrame(this.positionFrame);
    window.removeEventListener("resize", this.handleWindowChange);
    document.removeEventListener("scroll", this.handleWindowChange, true);
  }

  /** Znovu ověří stav při SPA navigaci / překreslení stránky — udrží
   * tlačítko připojené právě jednou, i po velkých DOM změnách (např. když
   * ho React při přerenderování composeru odstraní ze stránky), a zajistí,
   * že se sleduje aktuální composer. */
  private reconcile(): void {
    if (!this.isCurrentPageSupported()) return;
    if (!isFloatingButtonMounted()) {
      this.insertMemoryButton();
    }
    this.trackComposerSize();
  }

  /** Napojí `ResizeObserver` na aktuální composer *i* na jeho vizuální
   * "kartu" (viz `findComposerSurface`), aby se pozice tlačítka přepočítala
   * při každé změně velikosti kteréhokoli z nich (psaní víc řádků, změna
   * layoutu) — tlačítko se tak "pohybuje" s textovým polem, ne že by sedělo
   * na jednom pevném místě obrazovky. */
  private trackComposerSize(): void {
    const composer = this.findComposer();
    if (composer === this.observedComposer) {
      this.schedulePositionUpdate();
      return;
    }

    if (this.observedComposer) {
      this.resizeObserver?.unobserve(this.observedComposer);
    }
    if (this.observedSurface && this.observedSurface !== this.observedComposer) {
      this.resizeObserver?.unobserve(this.observedSurface);
    }

    this.observedComposer = composer;
    this.observedSurface = composer ? findComposerSurface(composer) : null;

    if (composer) {
      if (!this.resizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.schedulePositionUpdate());
      }
      this.resizeObserver.observe(composer);
      if (this.observedSurface && this.observedSurface !== composer) {
        this.resizeObserver.observe(this.observedSurface);
      }
    }

    this.schedulePositionUpdate();
  }

  /** Sloučí případné rychle opakované požadavky na přepočet pozice (scroll,
   * resize, ResizeObserver) do nejvýš jednoho přepočtu za animační snímek —
   * kolizní detekce v `positionButtonNear` prochází reálné prvky stránky,
   * nemá smysl ji spouštět víckrát, než se stihne vykreslit. */
  private schedulePositionUpdate(): void {
    if (this.positionFrame !== undefined) return;
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = undefined;
      this.updateButtonPosition();
    });
  }

  private updateButtonPosition(): void {
    const surface = this.observedSurface?.isConnected ? this.observedSurface : null;
    positionButtonNear(surface?.getBoundingClientRect() ?? null);
    if (isFactSuggestionVisible()) {
      repositionFactSuggestion();
    }
  }

  getConversationKey(): string | null {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    return last && last.length >= 8 ? last : null;
  }

  runDiagnostics(): ProviderDiagnostics {
    const composer = this.findComposer();
    return {
      provider: this.id,
      hostname: window.location.hostname,
      pageSupported: this.isCurrentPageSupported(),
      composerFound: !!composer,
      detectionStrategy: this.lastStrategyName,
      buttonInserted: this.buttonMounted && isFloatingButtonMounted(),
      lastError: this.lastError,
      checkedAt: new Date().toISOString(),
    };
  }
}
