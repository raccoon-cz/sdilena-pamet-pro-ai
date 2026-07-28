import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import type { MemoryExport } from "../../memory/types";
import { applyImport, type ImportMode } from "../../importExport/importData";
import { findProfileConflicts, resolveProfileConflicts } from "../../importExport/conflicts";
import { t } from "../../shared/i18n";

export function openImportPreviewModal(ctx: ViewContext, data: MemoryExport): Promise<void> {
  return new Promise((resolve) => {
    const lang = ctx.store.settings.language;
    let mode: ImportMode = "merge";

    const close = () => {
      backdrop.remove();
      resolve();
    };

    const mergeRadio = el("input", {
      attrs: { type: "radio", name: "import-mode", value: "merge" },
    }) as HTMLInputElement;
    mergeRadio.checked = true;
    const replaceRadio = el("input", {
      attrs: { type: "radio", name: "import-mode", value: "replace" },
    }) as HTMLInputElement;

    // Konflikty (stejné ID profilu, jiný název) mají smysl řešit jen při
    // sloučení — při "nahradit" se stávající profily stejně celé přepíšou.
    const conflicts = findProfileConflicts(ctx.store.profiles, data.profiles);
    const conflictResolutions = new Map<string, "existing" | "incoming">(
      conflicts.map((c) => [c.id, "existing"]),
    );

    const conflictsSection = el("div", {});

    function renderConflictsSection() {
      if (mode !== "merge" || conflicts.length === 0) {
        mount(conflictsSection);
        return;
      }

      const rows = conflicts.map((conflict) => {
        const groupName = `conflict-${conflict.id}`;
        const existingRadio = el("input", {
          attrs: { type: "radio", name: groupName, value: "existing" },
        }) as HTMLInputElement;
        existingRadio.checked = conflictResolutions.get(conflict.id) === "existing";
        const incomingRadio = el("input", {
          attrs: { type: "radio", name: groupName, value: "incoming" },
        }) as HTMLInputElement;
        incomingRadio.checked = conflictResolutions.get(conflict.id) === "incoming";

        existingRadio.addEventListener("change", () =>
          conflictResolutions.set(conflict.id, "existing"),
        );
        incomingRadio.addEventListener("change", () =>
          conflictResolutions.set(conflict.id, "incoming"),
        );

        return el("div", { className: "card" }, [
          el("p", {
            className: "hint",
            text: t(lang, "importModal.conflictHint"),
          }),
          el("div", { className: "field-row" }, [
            existingRadio,
            el("label", { text: t(lang, "importModal.keepExisting", { name: conflict.existingName }) }),
          ]),
          el("div", { className: "field-row" }, [
            incomingRadio,
            el("label", { text: t(lang, "importModal.useImported", { name: conflict.incomingName }) }),
          ]),
        ]);
      });

      mount(conflictsSection, el("h3", { text: t(lang, "importModal.conflictsTitle") }), ...rows);
    }

    mergeRadio.addEventListener("change", () => {
      mode = "merge";
      renderConflictsSection();
    });
    replaceRadio.addEventListener("change", () => {
      mode = "replace";
      renderConflictsSection();
    });

    const successNote = el("p", { className: "hint" });

    const importBtn = el("button", {
      className: "btn primary",
      text: t(lang, "importModal.importButton"),
      onClick: async () => {
        const profiles =
          mode === "merge"
            ? resolveProfileConflicts(data.profiles, ctx.store.profiles, conflictResolutions)
            : data.profiles;
        await applyImport(ctx.store.repository, { ...data, profiles }, mode);
        await ctx.refresh();
        importBtn.disabled = true;
        cancelBtn.disabled = true;
        successNote.textContent = t(lang, "importModal.importSuccess");
        window.setTimeout(close, 900);
      },
    });
    const cancelBtn = el("button", { className: "btn", text: t(lang, "common.cancel"), onClick: close });

    const modal = el("div", { className: "modal" }, [
      el("h3", { text: t(lang, "importModal.title") }),
      el("p", {
        text: t(lang, "importModal.summary", {
          profiles: data.profiles.length,
          memories: data.memories.length,
        }),
      }),
      el("div", { className: "field-row" }, [
        mergeRadio,
        el("label", { text: t(lang, "importModal.mergeOption") }),
      ]),
      el("div", { className: "field-row" }, [
        replaceRadio,
        el("label", { text: t(lang, "importModal.replaceOption") }),
      ]),
      conflictsSection,
      successNote,
      el("div", { className: "modal-actions" }, [cancelBtn, importBtn]),
    ]);

    const backdrop = el("div", { className: "modal-backdrop" }, [modal]);
    document.body.append(backdrop);
    renderConflictsSection();
  });
}
