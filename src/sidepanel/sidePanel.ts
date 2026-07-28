import { loadStore } from "./store";
import { mount } from "./dom";
import type { ViewName, ViewContext } from "./viewTypes";
import { renderOverview } from "./views/overview";
import { renderMemories } from "./views/memories";
import { renderProfiles } from "./views/profiles";
import { renderProviders } from "./views/providers";
import { renderSettings } from "./views/settings";
import { t, type Language } from "../shared/i18n";

const VIEW_RENDERERS: Record<ViewName, typeof renderOverview> = {
  overview: renderOverview,
  memories: renderMemories,
  profiles: renderProfiles,
  providers: renderProviders,
  settings: renderSettings,
};

const NAV_TRANSLATION_KEYS: Record<string, "nav.overview" | "nav.memories" | "nav.profiles" | "nav.providers"> = {
  overview: "nav.overview",
  memories: "nav.memories",
  profiles: "nav.profiles",
  providers: "nav.providers",
};

/** Přeloží statické části HTML shellu (hlavička, navigace), které nejsou
 * součástí žádného view modulu — musí se přepsat i při změně jazyka. */
function applyStaticTranslations(lang: Language, tabsNav: HTMLElement, settingsBtn: HTMLElement): void {
  document.title = t(lang, "app.title");
  document.documentElement.lang = lang;

  const titleEl = document.querySelector(".app-title span:last-child");
  if (titleEl) titleEl.textContent = t(lang, "app.title");

  settingsBtn.title = t(lang, "app.settingsButtonTitle");
  settingsBtn.setAttribute("aria-label", t(lang, "app.settingsButtonTitle"));

  for (const btn of tabsNav.querySelectorAll<HTMLButtonElement>(".tabs__item")) {
    const key = NAV_TRANSLATION_KEYS[btn.dataset.view ?? ""];
    if (key) btn.textContent = t(lang, key);
  }
}

async function main() {
  const viewRoot = document.getElementById("view-root");
  const tabsNav = document.getElementById("main-tabs");
  const settingsBtn = document.getElementById("nav-settings-btn");
  if (!viewRoot || !tabsNav || !settingsBtn) return;

  let currentView: ViewName = "overview";
  let pendingIntent: string | undefined;
  let store = await loadStore();

  function setActiveTabButton() {
    for (const btn of tabsNav!.querySelectorAll<HTMLButtonElement>(".tabs__item")) {
      btn.classList.toggle("active", btn.dataset.view === currentView);
    }
  }

  function renderCurrentView() {
    applyStaticTranslations(store.settings.language, tabsNav!, settingsBtn!);
    setActiveTabButton();
    mount(viewRoot!);
    const ctx: ViewContext = {
      store,
      refresh,
      navigate,
      consumeIntent: () => {
        const intent = pendingIntent;
        pendingIntent = undefined;
        return intent;
      },
    };
    VIEW_RENDERERS[currentView](viewRoot!, ctx);
  }

  async function refresh() {
    store = await loadStore();
    renderCurrentView();
  }

  function navigate(view: ViewName, intent?: string) {
    currentView = view;
    pendingIntent = intent;
    renderCurrentView();
  }

  for (const btn of tabsNav.querySelectorAll<HTMLButtonElement>(".tabs__item")) {
    btn.addEventListener("click", () => navigate((btn.dataset.view as ViewName) ?? "overview"));
  }
  settingsBtn.addEventListener("click", () => navigate("settings"));

  renderCurrentView();
}

void main();
