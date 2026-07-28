import { el } from "../dom";
import type { ViewContext } from "../viewTypes";
import type { MemoryCategory, MemoryItem } from "../../memory/types";
import { CATEGORY_ORDER, getCategoryLabel } from "../../shared/constants";
import { createId, nowIso } from "../../shared/ids";
import { suggestKeywords } from "../../shared/text";
import { t } from "../../shared/i18n";

export function openMemoryModal(
  ctx: ViewContext,
  options: { existing?: MemoryItem; prefillText?: string } = {},
): void {
  const { existing, prefillText } = options;
  const profiles = ctx.store.profiles;
  const lang = ctx.store.settings.language;

  const textInput = el("textarea", {
    attrs: { rows: "4", placeholder: t(lang, "memoryModal.textPlaceholder") },
  }) as HTMLTextAreaElement;
  textInput.value = existing?.text ?? prefillText ?? "";

  const profileSelect = el("select", {}) as HTMLSelectElement;
  for (const profile of profiles) {
    const opt = el("option", { text: profile.name, attrs: { value: profile.id } });
    profileSelect.append(opt);
  }
  profileSelect.value = existing?.profileId ?? ctx.store.settings.activeProfileId;

  const categorySelect = el("select", {}) as HTMLSelectElement;
  for (const category of CATEGORY_ORDER) {
    const opt = el("option", { text: getCategoryLabel(lang, category), attrs: { value: category } });
    categorySelect.append(opt);
  }
  categorySelect.value = existing?.category ?? "other";

  const keywordsInput = el("input", {
    attrs: { type: "text", placeholder: t(lang, "memoryModal.keywordsPlaceholder") },
  }) as HTMLInputElement;
  keywordsInput.value = existing?.keywords.join(", ") ?? "";

  const suggestKeywordsBtn = el("button", {
    className: "btn small",
    text: t(lang, "memoryModal.suggestButton"),
    onClick: () => {
      const suggestions = suggestKeywords(textInput.value);
      if (suggestions.length === 0) return;
      const existingKeywords = keywordsInput.value
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...existingKeywords, ...suggestions]));
      keywordsInput.value = merged.join(", ");
    },
  });
  const keywordsRow = el("div", { className: "field-row" }, [keywordsInput, suggestKeywordsBtn]);

  const alwaysUseCheckbox = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
  alwaysUseCheckbox.checked = existing?.alwaysUse ?? false;

  const sensitiveCheckbox = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
  sensitiveCheckbox.checked = existing?.sensitivity === "sensitive";

  const enabledCheckbox = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
  enabledCheckbox.checked = existing?.enabled ?? true;

  const errorText = el("p", { className: "error-text", text: "" });

  const close = () => backdrop.remove();

  const saveBtn = el("button", {
    className: "btn primary",
    text: existing ? t(lang, "memoryModal.saveChangesButton") : t(lang, "memoryModal.saveButton"),
    onClick: async () => {
      const text = textInput.value.trim();
      if (!text) {
        errorText.textContent = t(lang, "memoryModal.textEmptyError");
        return;
      }
      if (!profileSelect.value) {
        errorText.textContent = t(lang, "memoryModal.noProfileError");
        return;
      }
      const now = nowIso();
      const memory: MemoryItem = {
        id: existing?.id ?? createId(),
        text,
        category: categorySelect.value as MemoryCategory,
        profileId: profileSelect.value,
        keywords: keywordsInput.value
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        alwaysUse: alwaysUseCheckbox.checked,
        enabled: enabledCheckbox.checked,
        sensitivity: sensitiveCheckbox.checked ? "sensitive" : "normal",
        source: existing?.source ?? "manual",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await ctx.store.repository.saveMemory(memory);
      close();
      await ctx.refresh();
    },
  });

  const cancelBtn = el("button", { className: "btn", text: t(lang, "common.cancel"), onClick: close });

  function field(labelText: string, input: HTMLElement) {
    return el("div", { className: "field" }, [el("label", { text: labelText }), input]);
  }

  function checkboxRow(input: HTMLElement, labelText: string) {
    const label = el("label", {}, [input, labelText]);
    return el("div", { className: "field-row" }, [label]);
  }

  const modal = el("div", { className: "modal" }, [
    el("h3", { text: existing ? t(lang, "memoryModal.editTitle") : t(lang, "memoryModal.addTitle") }),
    field(t(lang, "memoryModal.textFieldLabel"), textInput),
    field(t(lang, "memoryModal.profileFieldLabel"), profileSelect),
    field(t(lang, "memoryModal.categoryFieldLabel"), categorySelect),
    field(t(lang, "memoryModal.keywordsFieldLabel"), keywordsRow),
    checkboxRow(alwaysUseCheckbox, t(lang, "memoryModal.alwaysUseLabel")),
    checkboxRow(sensitiveCheckbox, t(lang, "memoryModal.sensitiveLabel")),
    checkboxRow(enabledCheckbox, t(lang, "memoryModal.enabledLabel")),
    errorText,
    el("div", { className: "modal-actions" }, [cancelBtn, saveBtn]),
  ]);

  const backdrop = el(
    "div",
    {
      className: "modal-backdrop",
      onClick: (e) => {
        if (e.target === backdrop) close();
      },
    },
    [modal],
  );

  document.body.append(backdrop);
  textInput.focus();
}
