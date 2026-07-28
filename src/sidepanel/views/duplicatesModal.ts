import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import { findDuplicatePairs, type DuplicatePair } from "../../memory/deduplication";
import { t } from "../../shared/i18n";

function pairKey(pair: DuplicatePair): string {
  return [pair.a.id, pair.b.id].sort().join("|");
}

export function openDuplicatesModal(ctx: ViewContext): void {
  const lang = ctx.store.settings.language;
  const pairs = findDuplicatePairs(ctx.store.memories);
  const removedIds = new Set<string>();
  const resolvedKeys = new Set<string>();

  const close = () => backdrop.remove();
  const listContainer = el("div", {});

  function renderList() {
    const visible = pairs.filter(
      (pair) =>
        !removedIds.has(pair.a.id) &&
        !removedIds.has(pair.b.id) &&
        !resolvedKeys.has(pairKey(pair)),
    );

    if (visible.length === 0) {
      mount(
        listContainer,
        el("p", { className: "hint", text: t(lang, "duplicatesModal.noMoreToResolve") }),
      );
      return;
    }

    mount(listContainer, ...visible.map((pair) => buildPairRow(pair)));
  }

  function buildPairRow(pair: DuplicatePair) {
    const deleteFirstBtn = el("button", {
      className: "btn small danger",
      text: t(lang, "duplicatesModal.deleteFirstButton"),
      onClick: async () => {
        await ctx.store.repository.deleteMemory(pair.a.id);
        removedIds.add(pair.a.id);
        renderList();
        await ctx.refresh();
      },
    });

    const deleteSecondBtn = el("button", {
      className: "btn small danger",
      text: t(lang, "duplicatesModal.deleteSecondButton"),
      onClick: async () => {
        await ctx.store.repository.deleteMemory(pair.b.id);
        removedIds.add(pair.b.id);
        renderList();
        await ctx.refresh();
      },
    });

    const keepBothBtn = el("button", {
      className: "btn small",
      text: t(lang, "duplicatesModal.keepBothButton"),
      onClick: () => {
        resolvedKeys.add(pairKey(pair));
        renderList();
      },
    });

    return el("div", { className: "card" }, [
      el("p", { className: "hint", text: t(lang, "duplicatesModal.possibleDuplicateLabel") }),
      el("p", { className: "memory-card__text", text: pair.a.text }),
      el("p", { className: "memory-card__text", text: pair.b.text }),
      el("div", { className: "memory-card__actions" }, [
        deleteFirstBtn,
        deleteSecondBtn,
        keepBothBtn,
      ]),
    ]);
  }

  const closeBtn = el("button", {
    className: "btn primary",
    text: t(lang, "duplicatesModal.closeButton"),
    onClick: close,
  });

  const modal = el("div", { className: "modal" }, [
    el("h3", { text: t(lang, "duplicatesModal.title") }),
    el("p", {
      className: "hint",
      text:
        pairs.length === 0
          ? t(lang, "duplicatesModal.noneFound")
          : t(lang, "duplicatesModal.instructions"),
    }),
    listContainer,
    el("div", { className: "modal-actions" }, [closeBtn]),
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
  renderList();
}
