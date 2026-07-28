import { el, mount } from "../dom";
import { getActiveSupportedTab, sendToActiveTab } from "../tabMessaging";
import type { ProviderDiagnostics } from "../../messaging/messages";
import { t, type Language } from "../../shared/i18n";

function line(label: string, value: string) {
  return el("div", { className: "status-row" }, [
    el("span", { className: "hint", text: label }),
    el("span", { text: value }),
  ]);
}

export function buildDiagnosticsSection(lang: Language): HTMLElement {
  const resultBox = el("div", {});
  const copyBtn = el("button", {
    className: "btn small hidden",
    text: t(lang, "diagnostics.copyButton"),
  });

  let lastReportText = "";

  const checkBtn = el("button", {
    className: "btn small",
    text: t(lang, "diagnostics.checkButton"),
    onClick: async () => {
      const version = chrome.runtime.getManifest().version;
      const tab = await getActiveSupportedTab();

      if (!tab) {
        mount(
          resultBox,
          line(t(lang, "diagnostics.extensionVersionLabel"), version),
          el("p", {
            className: "hint",
            text: t(lang, "diagnostics.notSupportedPage"),
          }),
        );
        copyBtn.classList.add("hidden");
        return;
      }

      let hostname = "";
      try {
        hostname = tab.url ? new URL(tab.url).hostname : "";
      } catch {
        hostname = "";
      }

      const diagnostics = await sendToActiveTab<ProviderDiagnostics>({
        type: "sp:get-diagnostics",
      });

      const lines = [
        `${t(lang, "diagnostics.extensionVersionLabel")}: ${version}`,
        `${t(lang, "diagnostics.hostnameLabel")}: ${hostname || t(lang, "diagnostics.unknownHostname")}`,
      ];

      if (!diagnostics) {
        lines.push(t(lang, "diagnostics.noResponse"));
      } else {
        const yesNo = (v: boolean) => (v ? t(lang, "common.yes") : t(lang, "common.no"));
        lines.push(`${t(lang, "diagnostics.providerLabel")}: ${diagnostics.provider}`);
        lines.push(`${t(lang, "diagnostics.pageSupportedLabel")}: ${yesNo(diagnostics.pageSupported)}`);
        lines.push(`${t(lang, "diagnostics.composerFoundLabel")}: ${yesNo(diagnostics.composerFound)}`);
        lines.push(
          `${t(lang, "diagnostics.detectionStrategyLabel")}: ${diagnostics.detectionStrategy ?? t(lang, "common.none")}`,
        );
        lines.push(`${t(lang, "diagnostics.buttonInsertedLabel")}: ${yesNo(diagnostics.buttonInserted)}`);
        lines.push(
          `${t(lang, "diagnostics.lastErrorLabel")}: ${diagnostics.lastError ?? t(lang, "common.none")}`,
        );
      }

      mount(resultBox, ...lines.map((l) => el("p", { className: "hint", text: l })));
      lastReportText = lines.join("\n");
      copyBtn.classList.remove("hidden");
    },
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lastReportText);
      copyBtn.textContent = t(lang, "diagnostics.copiedButton");
      setTimeout(() => {
        copyBtn.textContent = t(lang, "diagnostics.copyButton");
      }, 1500);
    } catch {
      copyBtn.textContent = t(lang, "diagnostics.copyFailedButton");
    }
  });

  return el("div", { className: "card" }, [
    el("h3", { text: t(lang, "diagnostics.title") }),
    el("p", {
      className: "hint",
      text: t(lang, "diagnostics.subtitle"),
    }),
    el("div", { className: "memory-card__actions" }, [checkBtn, copyBtn]),
    resultBox,
  ]);
}
