import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import { t, type Language, type TranslationKey } from "../../shared/i18n";

function formatDateTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === "cs" ? "cs-CZ" : "en-US", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lastLocalChange(ctx: ViewContext): string | null {
  const dates = [
    ...ctx.store.memories.map((m) => m.updatedAt),
    ...ctx.store.profiles.map((p) => p.updatedAt),
  ];
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

function statCard(value: string, label: string) {
  return el("div", { className: "stat-card" }, [
    el("div", { className: "stat-card__value", text: value }),
    el("div", { className: "stat-card__label", text: label }),
  ]);
}

function onboardingStep(titleKey: TranslationKey, textKey: TranslationKey, lang: Language) {
  return el("div", { className: "onboarding-step" }, [
    el("div", { className: "onboarding-step__title", text: t(lang, titleKey) }),
    el("div", { className: "onboarding-step__text", text: t(lang, textKey) }),
  ]);
}

function buildOnboardingCard(ctx: ViewContext, lang: Language) {
  const dismissBtn = el("button", {
    className: "btn block",
    text: t(lang, "onboarding.dismissButton"),
    onClick: async () => {
      await ctx.store.repository.saveSettings({
        ...ctx.store.settings,
        onboardingDismissed: true,
      });
      await ctx.refresh();
    },
  });

  return el("div", { className: "card onboarding-card" }, [
    el("h3", { text: t(lang, "onboarding.title") }),
    el("p", { className: "hint", text: t(lang, "onboarding.subtitle") }),
    onboardingStep("onboarding.step1Title", "onboarding.step1Text", lang),
    onboardingStep("onboarding.step2Title", "onboarding.step2Text", lang),
    onboardingStep("onboarding.step3Title", "onboarding.step3Text", lang),
    onboardingStep("onboarding.step4Title", "onboarding.step4Text", lang),
    dismissBtn,
  ]);
}

function connectionStatusRow(lang: Language, label: string, connected: boolean) {
  return el("div", { className: "status-row" }, [
    el("span", {}, [
      el("span", { className: `status-dot ${connected ? "on" : "off"}` }),
      label,
    ]),
    el("span", {
      className: "badge",
      text: connected ? t(lang, "common.connected") : t(lang, "common.notConnected"),
    }),
  ]);
}

export function renderOverview(root: HTMLElement, ctx: ViewContext): void {
  const lang = ctx.store.settings.language;
  const activeProfile = ctx.store.profiles.find(
    (p) => p.id === ctx.store.settings.activeProfileId,
  );
  const enabledMemories = ctx.store.memories.filter((m) => m.enabled).length;
  const chatgptConnected =
    ctx.store.connections.find((c) => c.provider === "chatgpt")?.enabled ?? false;
  const claudeConnected =
    ctx.store.connections.find((c) => c.provider === "claude")?.enabled ?? false;
  const lastChange = lastLocalChange(ctx);

  const addButton = el(
    "button",
    {
      className: "btn primary block",
      text: t(lang, "overview.addMemoryButton"),
      onClick: () => ctx.navigate("memories", "add-memory"),
    },
  );

  const statGrid = el("div", { className: "stat-grid" }, [
    statCard(String(ctx.store.memories.length), t(lang, "overview.savedMemoriesLabel")),
    statCard(String(enabledMemories), t(lang, "overview.activeMemoriesLabel")),
  ]);

  const infoCard = el("div", { className: "card" }, [
    el("div", { className: "status-row" }, [
      el("span", { text: t(lang, "overview.activeProfileLabel") }),
      el("span", {
        className: "badge accent",
        text: activeProfile?.name ?? t(lang, "overview.noneLabel"),
      }),
    ]),
    el("div", { className: "status-row" }, [
      el("span", { text: t(lang, "overview.lastChangeLabel") }),
      el("span", {
        className: "badge",
        text: lastChange ? formatDateTime(lastChange, lang) : t(lang, "overview.neverLabel"),
      }),
    ]),
  ]);

  const connectionsCard = el("div", { className: "card" }, [
    connectionStatusRow(lang, "ChatGPT", chatgptConnected),
    connectionStatusRow(lang, "Claude", claudeConnected),
  ]);

  const children: HTMLElement[] = [
    el("h2", { text: t(lang, "overview.title") }),
    el("p", {
      className: "view-subtitle",
      text: t(lang, "overview.subtitle"),
    }),
  ];

  if (!ctx.store.settings.onboardingDismissed) {
    children.push(buildOnboardingCard(ctx, lang));
  }

  children.push(addButton, statGrid, infoCard, connectionsCard);

  mount(root, ...children);
}
