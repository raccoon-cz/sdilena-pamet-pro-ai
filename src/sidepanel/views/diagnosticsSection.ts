import { el, mount } from "../dom";
import { getActiveSupportedTab, sendToActiveTab } from "../tabMessaging";
import type { ProviderDiagnostics } from "../../messaging/messages";
import { t, type Language } from "../../shared/i18n";

type DiagnosticsStatus = "ok" | "bad" | "neutral";

function line(label: string, value: string, status: DiagnosticsStatus) {
  return el("div", { className: "diagnostics-row" }, [
    el("span", { className: `status-dot ${status === "ok" ? "on" : status === "bad" ? "bad" : "off"}` }),
    el("span", { text: `${label}: ${value}` }),
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

      const entries: { label: string; value: string; status: DiagnosticsStatus }[] = [
        { label: t(lang, "diagnostics.extensionVersionLabel"), value: version, status: "neutral" },
      ];

      if (!tab) {
        entries.push({
          label: t(lang, "diagnostics.notSupportedPage"),
          value: "",
          status: "bad",
        });
        mount(resultBox, ...entries.map((e) => line(e.label, e.value, e.status)));
        lastReportText = entries.map((e) => (e.value ? `${e.label}: ${e.value}` : e.label)).join("\n");
        copyBtn.classList.remove("hidden");
        return;
      }

      let hostname = "";
      try {
        hostname = tab.url ? new URL(tab.url).hostname : "";
      } catch {
        hostname = "";
      }
      entries.push({
        label: t(lang, "diagnostics.hostnameLabel"),
        value: hostname || t(lang, "diagnostics.unknownHostname"),
        status: "neutral",
      });

      const diagnostics = await sendToActiveTab<ProviderDiagnostics>({
        type: "sp:get-diagnostics",
      });

      if (!diagnostics) {
        entries.push({ label: t(lang, "diagnostics.noResponse"), value: "", status: "bad" });
      } else {
        const yesNo = (v: boolean) => (v ? t(lang, "common.yes") : t(lang, "common.no"));
        const okIf = (v: boolean): DiagnosticsStatus => (v ? "ok" : "bad");
        entries.push({
          label: t(lang, "diagnostics.providerLabel"),
          value: diagnostics.provider,
          status: "ok",
        });
        entries.push({
          label: t(lang, "diagnostics.pageSupportedLabel"),
          value: yesNo(diagnostics.pageSupported),
          status: okIf(diagnostics.pageSupported),
        });
        entries.push({
          label: t(lang, "diagnostics.composerFoundLabel"),
          value: yesNo(diagnostics.composerFound),
          status: okIf(diagnostics.composerFound),
        });
        entries.push({
          label: t(lang, "diagnostics.detectionStrategyLabel"),
          value: diagnostics.detectionStrategy ?? t(lang, "common.none"),
          status: okIf(diagnostics.detectionStrategy !== null),
        });
        entries.push({
          label: t(lang, "diagnostics.buttonInsertedLabel"),
          value: yesNo(diagnostics.buttonInserted),
          status: okIf(diagnostics.buttonInserted),
        });
        entries.push({
          label: t(lang, "diagnostics.lastErrorLabel"),
          value: diagnostics.lastError ?? t(lang, "common.none"),
          status: okIf(diagnostics.lastError === null),
        });
      }

      mount(resultBox, ...entries.map((e) => line(e.label, e.value, e.status)));
      lastReportText = entries.map((e) => (e.value ? `${e.label}: ${e.value}` : e.label)).join("\n");
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
