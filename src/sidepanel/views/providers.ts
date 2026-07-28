import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import type { ProviderId } from "../../memory/types";
import { t, type Language } from "../../shared/i18n";
import { showConfirmDialog } from "./confirmDialog";
import type {
  ConnectProviderResponse,
  DisconnectProviderResponse,
} from "../../messaging/messages";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
};

const PROVIDER_DESCRIPTIONS: Record<ProviderId, string> = {
  chatgpt: "chatgpt.com",
  claude: "claude.ai",
};

function providerCard(provider: ProviderId, ctx: ViewContext, lang: Language) {
  const connection = ctx.store.connections.find((c) => c.provider === provider);
  const connected = connection?.enabled ?? false;

  const statusText = el("span", {
    className: `badge ${connected ? "accent" : ""}`,
    text: connected ? t(lang, "common.connected") : t(lang, "common.notConnected"),
  });

  const actionArea = el("div", { className: "hint", text: "" });

  const connectBtn = el("button", {
    className: "btn primary small",
    text: t(lang, "providers.connectButton"),
    onClick: async () => {
      actionArea.textContent = t(lang, "providers.requestingPermission");
      const response = (await chrome.runtime.sendMessage({
        type: "sp:connect-provider",
        provider,
      })) as ConnectProviderResponse;
      if (!response.ok) {
        actionArea.textContent = t(lang, "providers.connectFailed", {
          error: response.error ?? t(lang, "providers.unknownError"),
        });
        return;
      }
      if (!response.permissionGranted) {
        actionArea.textContent = t(lang, "providers.permissionDenied");
        return;
      }
      actionArea.textContent = "";
      await ctx.refresh();
    },
  });

  const disconnectBtn = el("button", {
    className: "btn small danger",
    text: t(lang, "providers.disconnectButton"),
    onClick: async () => {
      const confirmed = await showConfirmDialog({
        lang,
        title: t(lang, "providers.disconnectConfirmTitle", { provider: PROVIDER_LABELS[provider] }),
        message: t(lang, "providers.disconnectConfirmMessage"),
        confirmLabel: t(lang, "providers.disconnectButton"),
        danger: true,
      });
      if (!confirmed) return;
      const response = (await chrome.runtime.sendMessage({
        type: "sp:disconnect-provider",
        provider,
      })) as DisconnectProviderResponse;
      if (response.ok) {
        await ctx.refresh();
      }
    },
  });

  return el("div", { className: "card" }, [
    el("div", { className: "status-row" }, [
      el("strong", { text: PROVIDER_LABELS[provider] }),
      statusText,
    ]),
    el("p", { className: "hint", text: PROVIDER_DESCRIPTIONS[provider] }),
    el("div", { className: "memory-card__actions" }, [connected ? disconnectBtn : connectBtn]),
    actionArea,
  ]);
}

export function renderProviders(root: HTMLElement, ctx: ViewContext): void {
  const lang = ctx.store.settings.language;
  mount(
    root,
    el("h2", { text: t(lang, "providers.title") }),
    el("p", {
      className: "view-subtitle",
      text: t(lang, "providers.subtitle"),
    }),
    providerCard("chatgpt", ctx, lang),
    providerCard("claude", ctx, lang),
  );
}
