import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import { buildExportPayload, serializeExport } from "../../importExport/exportData";
import { validateImportPayload, checkFileSize } from "../../importExport/validation";
import { openImportPreviewModal } from "./importModal";
import { showConfirmDialog } from "./confirmDialog";
import { buildDiagnosticsSection } from "./diagnosticsSection";
import { buildPrivacySection } from "./privacySection";
import { t, LANGUAGES, type Language } from "../../shared/i18n";

function numberField(
  label: string,
  value: number,
  onChange: (n: number) => void,
  hint: string,
) {
  const input = el("input", {
    attrs: { type: "number", min: "1", step: "1" },
  }) as HTMLInputElement;
  input.value = String(value);
  input.addEventListener("change", () => {
    const n = Number.parseInt(input.value, 10);
    if (Number.isFinite(n) && n > 0) onChange(n);
  });
  return el("div", { className: "field" }, [
    el("label", { text: label }),
    input,
    el("p", { className: "hint", text: hint }),
  ]);
}

function checkboxField(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const input = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return el("div", { className: "field-row" }, [el("label", {}, [input, label])]);
}

function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = el("a", { attrs: { href: url, download: filename } }) as HTMLAnchorElement;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const LANGUAGE_LABEL_KEY: Record<Language, "settings.languageCzech" | "settings.languageEnglish"> = {
  cs: "settings.languageCzech",
  en: "settings.languageEnglish",
};

export function renderSettings(root: HTMLElement, ctx: ViewContext): void {
  const settings = ctx.store.settings;
  const lang = settings.language;

  const languageSelect = el("select", {}) as HTMLSelectElement;
  languageSelect.append(
    ...LANGUAGES.map((code) => el("option", { text: t(lang, LANGUAGE_LABEL_KEY[code]), attrs: { value: code } })),
  );
  languageSelect.value = lang;
  languageSelect.addEventListener("change", async () => {
    await ctx.store.repository.saveSettings({
      ...ctx.store.settings,
      language: languageSelect.value as Language,
    });
    await ctx.refresh();
  });

  const showOnboardingBtn = el("button", {
    className: "btn",
    text: t(lang, "settings.showOnboardingButton"),
    onClick: async () => {
      await ctx.store.repository.saveSettings({
        ...ctx.store.settings,
        onboardingDismissed: false,
      });
      await ctx.refresh();
      ctx.navigate("overview");
    },
  });

  const generalSection = el("div", { className: "card settings-section" }, [
    el("h3", { text: t(lang, "settings.generalSectionTitle") }),
    el("div", { className: "field" }, [
      el("label", { text: t(lang, "settings.languageLabel") }),
      languageSelect,
    ]),
    showOnboardingBtn,
    numberField(
      t(lang, "settings.maxMemoriesLabel"),
      settings.maxMemoriesPerPrompt,
      async (n) => {
        await ctx.store.repository.saveSettings({ ...ctx.store.settings, maxMemoriesPerPrompt: n });
        await ctx.refresh();
      },
      t(lang, "settings.maxMemoriesHint"),
    ),
    checkboxField(
      t(lang, "settings.includeAlwaysUseLabel"),
      settings.includeAlwaysUseMemories,
      async (v) => {
        await ctx.store.repository.saveSettings({
          ...ctx.store.settings,
          includeAlwaysUseMemories: v,
        });
        await ctx.refresh();
      },
    ),
    numberField(
      t(lang, "settings.maxAlwaysUseLabel"),
      settings.maxAlwaysUseMemories,
      async (n) => {
        await ctx.store.repository.saveSettings({
          ...ctx.store.settings,
          maxAlwaysUseMemories: n,
        });
        await ctx.refresh();
      },
      t(lang, "settings.maxAlwaysUseHint"),
    ),
    numberField(
      t(lang, "settings.maxContextCharsLabel"),
      settings.maxContextCharacters,
      async (n) => {
        await ctx.store.repository.saveSettings({ ...ctx.store.settings, maxContextCharacters: n });
        await ctx.refresh();
      },
      t(lang, "settings.maxContextCharsHint"),
    ),
    checkboxField(
      t(lang, "settings.showPreviewLabel"),
      settings.showPreviewBeforeInsert,
      async (v) => {
        await ctx.store.repository.saveSettings({
          ...ctx.store.settings,
          showPreviewBeforeInsert: v,
        });
        await ctx.refresh();
      },
    ),
  ]);

  const importStatus = el("p", { className: "error-text", text: "" });

  const exportBtn = el("button", {
    className: "btn",
    text: t(lang, "settings.exportButton"),
    onClick: async () => {
      const payload = await buildExportPayload(ctx.store.repository);
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(`sdilena-pamet-export-${date}.json`, serializeExport(payload));
    },
  });

  const importInput = el("input", {
    className: "hidden",
    attrs: { type: "file", accept: "application/json" },
  }) as HTMLInputElement;
  importInput.addEventListener("change", async () => {
    importStatus.textContent = "";
    const file = importInput.files?.[0];
    if (!file) return;

    const sizeError = checkFileSize(file.size, lang);
    if (sizeError) {
      importStatus.textContent = sizeError;
      importInput.value = "";
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = validateImportPayload(parsed, lang);
      if (!result.valid || !result.data) {
        importStatus.textContent = t(lang, "settings.importParseError", {
          errors: result.errors.join(" "),
        });
        return;
      }
      await openImportPreviewModal(ctx, result.data);
    } catch {
      importStatus.textContent = t(lang, "settings.importReadError");
    } finally {
      importInput.value = "";
    }
  });

  const backupSection = el("div", { className: "card settings-section" }, [
    el("h3", { text: t(lang, "settings.backupSectionTitle") }),
    el("p", {
      className: "hint",
      text: t(lang, "settings.backupHint"),
    }),
    el("div", { className: "memory-card__actions" }, [exportBtn]),
    el("label", { className: "btn", text: t(lang, "settings.importButton") }, [importInput]),
    importStatus,
  ]);

  const wipeBtn = el("button", {
    className: "btn danger block",
    text: t(lang, "settings.wipeButton"),
    onClick: async () => {
      const confirmed = await showConfirmDialog({
        lang,
        title: t(lang, "settings.wipeConfirmTitle"),
        message: t(lang, "settings.wipeConfirmMessage"),
        confirmLabel: t(lang, "settings.wipeConfirmButton"),
        danger: true,
      });
      if (!confirmed) return;
      await ctx.store.repository.wipeAll();
      await ctx.refresh();
    },
  });

  const dangerSection = el("div", { className: "card settings-section" }, [
    el("h3", { text: t(lang, "settings.dangerZoneTitle") }),
    wipeBtn,
  ]);

  mount(
    root,
    el("h2", { text: t(lang, "settings.title") }),
    generalSection,
    backupSection,
    dangerSection,
    buildDiagnosticsSection(lang),
    buildPrivacySection(lang),
  );
}
