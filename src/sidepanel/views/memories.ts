import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import type { MemoryItem } from "../../memory/types";
import { CATEGORY_ORDER, getCategoryLabel } from "../../shared/constants";
import { normalizeText, stripDiacritics, suggestKeywords } from "../../shared/text";
import { nowIso } from "../../shared/ids";
import { t, type Language } from "../../shared/i18n";
import { openMemoryModal } from "./memoryModal";
import { showConfirmDialog } from "./confirmDialog";
import { openDuplicatesModal } from "./duplicatesModal";
import { getActiveSupportedTab, sendToActiveTab } from "../tabMessaging";

const ALL_PROFILES = "__all__";
const ALL_CATEGORIES = "__all__";

type BulkAction =
  | "activate"
  | "deactivate"
  | "prefer-on"
  | "prefer-off"
  | "move-profile"
  | "suggest-keywords"
  | "delete";

function memoryCard(
  memory: MemoryItem,
  ctx: ViewContext,
  lang: Language,
  showProfileBadge: boolean,
  selectedIds: Set<string>,
  onToggleSelect: () => void,
) {
  const profileName = ctx.store.profiles.find((p) => p.id === memory.profileId)?.name;

  const badges = [el("span", { className: "badge", text: getCategoryLabel(lang, memory.category) })];
  if (showProfileBadge && profileName) {
    badges.push(el("span", { className: "badge accent", text: profileName }));
  }
  if (memory.alwaysUse) {
    badges.push(el("span", { className: "badge accent", text: t(lang, "memories.badgePreferred") }));
  }
  if (memory.sensitivity === "sensitive") {
    badges.push(el("span", { className: "badge sensitive", text: t(lang, "memories.badgeSensitive") }));
  }
  if (!memory.enabled) {
    badges.push(el("span", { className: "badge", text: t(lang, "memories.badgeInactive") }));
  }

  const selectCheckbox = el("input", {
    attrs: { type: "checkbox", "aria-label": t(lang, "memories.selectMemoryAriaLabel") },
  }) as HTMLInputElement;
  selectCheckbox.checked = selectedIds.has(memory.id);
  selectCheckbox.addEventListener("change", () => {
    if (selectCheckbox.checked) selectedIds.add(memory.id);
    else selectedIds.delete(memory.id);
    onToggleSelect();
  });

  const toggleBtn = el("button", {
    className: "btn small",
    text: memory.enabled ? t(lang, "common.deactivate") : t(lang, "common.activate"),
    onClick: async () => {
      await ctx.store.repository.saveMemory({ ...memory, enabled: !memory.enabled });
      await ctx.refresh();
    },
  });

  const editBtn = el("button", {
    className: "btn small",
    text: t(lang, "memories.editButton"),
    onClick: () => openMemoryModal(ctx, { existing: memory }),
  });

  const deleteBtn = el("button", {
    className: "btn small danger",
    text: t(lang, "common.delete"),
    onClick: async () => {
      const confirmed = await showConfirmDialog({
        lang,
        title: t(lang, "memories.deleteConfirmTitle"),
        message: t(lang, "memories.deleteConfirmMessage"),
        confirmLabel: t(lang, "common.delete"),
        danger: true,
      });
      if (!confirmed) return;
      await ctx.store.repository.deleteMemory(memory.id);
      await ctx.refresh();
    },
  });

  return el("div", { className: `memory-card${memory.enabled ? "" : " disabled"}` }, [
    el("div", { className: "memory-card__row" }, [
      selectCheckbox,
      el("div", { className: "memory-card__text", text: memory.text }),
    ]),
    el("div", { className: "memory-card__meta" }, badges),
    el("div", { className: "memory-card__actions" }, [toggleBtn, editBtn, deleteBtn]),
  ]);
}

function matchesSearch(memory: MemoryItem, normalizedSearchTerm: string): boolean {
  if (!normalizedSearchTerm) return true;
  const haystack = stripDiacritics(normalizeText(`${memory.text} ${memory.keywords.join(" ")}`));
  return haystack.includes(normalizedSearchTerm);
}

export function renderMemories(root: HTMLElement, ctx: ViewContext): void {
  const lang = ctx.store.settings.language;
  const selectedIds = new Set<string>();

  const profileFilterSelect = el("select", {}) as HTMLSelectElement;
  profileFilterSelect.append(
    el("option", {
      text: t(lang, "memories.activeProfileOption"),
      attrs: { value: ctx.store.settings.activeProfileId },
    }),
    el("option", { text: t(lang, "memories.allProfilesOption"), attrs: { value: ALL_PROFILES } }),
    ...ctx.store.profiles
      .filter((p) => p.id !== ctx.store.settings.activeProfileId)
      .map((p) => el("option", { text: p.name, attrs: { value: p.id } })),
  );

  const categoryFilterSelect = el("select", {}) as HTMLSelectElement;
  categoryFilterSelect.append(
    el("option", { text: t(lang, "memories.allCategoriesOption"), attrs: { value: ALL_CATEGORIES } }),
    ...CATEGORY_ORDER.map((c) =>
      el("option", { text: getCategoryLabel(lang, c), attrs: { value: c } }),
    ),
  );

  const preferredOnlyCheckbox = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;

  const searchInput = el("input", {
    attrs: { type: "text", placeholder: t(lang, "memories.searchPlaceholder") },
  }) as HTMLInputElement;

  const captureStatus = el("p", { className: "hint", text: "" });
  const listContainer = el("div", {});

  // --- Hromadné akce -------------------------------------------------
  const bulkCountLabel = el("span", { className: "hint", text: "" });

  const bulkActionSelect = el("select", {}) as HTMLSelectElement;
  bulkActionSelect.append(
    el("option", { text: t(lang, "common.activate"), attrs: { value: "activate" } }),
    el("option", { text: t(lang, "common.deactivate"), attrs: { value: "deactivate" } }),
    el("option", { text: t(lang, "bulk.preferOn"), attrs: { value: "prefer-on" } }),
    el("option", { text: t(lang, "bulk.preferOff"), attrs: { value: "prefer-off" } }),
    el("option", { text: t(lang, "bulk.moveProfile"), attrs: { value: "move-profile" } }),
    el("option", { text: t(lang, "bulk.suggestKeywords"), attrs: { value: "suggest-keywords" } }),
    el("option", { text: t(lang, "common.delete"), attrs: { value: "delete" } }),
  );

  const moveProfileSelect = el("select", { className: "hidden" }) as HTMLSelectElement;
  moveProfileSelect.append(
    ...ctx.store.profiles.map((p) => el("option", { text: p.name, attrs: { value: p.id } })),
  );

  bulkActionSelect.addEventListener("change", () => {
    moveProfileSelect.classList.toggle("hidden", bulkActionSelect.value !== "move-profile");
  });

  const applyBulkBtn = el("button", {
    className: "btn small primary",
    text: t(lang, "bulk.apply"),
    onClick: () => void applyBulkAction(),
  });

  const clearSelectionBtn = el("button", {
    className: "btn small",
    text: t(lang, "bulk.clearSelection"),
    onClick: () => {
      selectedIds.clear();
      updateBulkToolbar();
      renderList();
    },
  });

  const bulkToolbar = el("div", { className: "toolbar hidden" }, [
    bulkCountLabel,
    bulkActionSelect,
    moveProfileSelect,
    applyBulkBtn,
    clearSelectionBtn,
  ]);

  function updateBulkToolbar() {
    bulkCountLabel.textContent = t(lang, "bulk.selectedCount", { count: selectedIds.size });
    bulkToolbar.classList.toggle("hidden", selectedIds.size === 0);
  }

  async function applyBulkAction() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const action = bulkActionSelect.value as BulkAction;

    if (action === "delete") {
      const confirmed = await showConfirmDialog({
        lang,
        title: t(lang, "bulk.deleteConfirmTitle", { count: ids.length }),
        message: t(lang, "memories.deleteConfirmMessage"),
        confirmLabel: t(lang, "common.delete"),
        danger: true,
      });
      if (!confirmed) return;
      for (const id of ids) {
        await ctx.store.repository.deleteMemory(id);
      }
      selectedIds.clear();
      await ctx.refresh();
      return;
    }

    if (action === "move-profile" && !moveProfileSelect.value) return;

    const now = nowIso();
    const updated: MemoryItem[] = [];
    for (const id of ids) {
      const memory = ctx.store.memories.find((m) => m.id === id);
      if (!memory) continue;
      if (action === "activate") updated.push({ ...memory, enabled: true, updatedAt: now });
      else if (action === "deactivate") updated.push({ ...memory, enabled: false, updatedAt: now });
      else if (action === "prefer-on") updated.push({ ...memory, alwaysUse: true, updatedAt: now });
      else if (action === "prefer-off") updated.push({ ...memory, alwaysUse: false, updatedAt: now });
      else if (action === "move-profile") {
        updated.push({ ...memory, profileId: moveProfileSelect.value, updatedAt: now });
      } else if (action === "suggest-keywords") {
        const suggestions = suggestKeywords(memory.text);
        if (suggestions.length === 0) continue;
        const merged = Array.from(new Set([...memory.keywords, ...suggestions]));
        updated.push({ ...memory, keywords: merged, updatedAt: now });
      }
    }
    await ctx.store.repository.saveMemories(updated);
    selectedIds.clear();
    await ctx.refresh();
  }

  // --- Seznam ----------------------------------------------------------
  function renderList() {
    const profileFilter = profileFilterSelect.value;
    const showProfileBadge = profileFilter === ALL_PROFILES;
    const categoryFilter = categoryFilterSelect.value;
    const onlyPreferred = preferredOnlyCheckbox.checked;
    const searchTerm = stripDiacritics(normalizeText(searchInput.value));

    const filtered = ctx.store.memories.filter((m) => {
      if (profileFilter !== ALL_PROFILES && m.profileId !== profileFilter) return false;
      if (categoryFilter !== ALL_CATEGORIES && m.category !== categoryFilter) return false;
      if (onlyPreferred && !m.alwaysUse) return false;
      if (!matchesSearch(m, searchTerm)) return false;
      return true;
    });

    if (filtered.length === 0) {
      mount(
        listContainer,
        el("div", {
          className: "empty-state",
          text:
            ctx.store.memories.length === 0
              ? t(lang, "memories.emptyStateNoMemories")
              : t(lang, "memories.emptyStateNoMatch"),
        }),
      );
      return;
    }

    const groups: Node[] = [];
    for (const category of CATEGORY_ORDER) {
      const inCategory = filtered.filter((m) => m.category === category);
      if (inCategory.length === 0) continue;
      groups.push(el("h3", { text: getCategoryLabel(lang, category) }));
      for (const memory of inCategory) {
        groups.push(memoryCard(memory, ctx, lang, showProfileBadge, selectedIds, updateBulkToolbar));
      }
    }
    mount(listContainer, ...groups);
  }

  profileFilterSelect.addEventListener("change", renderList);
  categoryFilterSelect.addEventListener("change", renderList);
  preferredOnlyCheckbox.addEventListener("change", renderList);
  searchInput.addEventListener("input", renderList);

  const addButton = el("button", {
    className: "btn primary",
    text: t(lang, "memories.addButton"),
    onClick: () => openMemoryModal(ctx),
  });

  const duplicatesButton = el("button", {
    className: "btn",
    text: t(lang, "memories.duplicatesButton"),
    onClick: () => openDuplicatesModal(ctx),
  });

  const captureSelectionBtn = el("button", {
    className: "btn",
    text: t(lang, "memories.captureSelectionButton"),
    onClick: async () => {
      captureStatus.textContent = t(lang, "memories.loadingSelection");
      const tab = await getActiveSupportedTab();
      if (!tab) {
        captureStatus.textContent = t(lang, "memories.openAndConnectFirst");
        return;
      }
      const response = await sendToActiveTab({ type: "sp:get-selected-text" });
      if (!response || !response.ok || !response.text.trim()) {
        captureStatus.textContent = t(lang, "memories.noSelectionFound");
        return;
      }
      captureStatus.textContent = "";
      openMemoryModal(ctx, { prefillText: response.text.trim() });
    },
  });

  const captureComposerBtn = el("button", {
    className: "btn",
    text: t(lang, "memories.captureComposerButton"),
    onClick: async () => {
      captureStatus.textContent = t(lang, "memories.loadingComposer");
      const tab = await getActiveSupportedTab();
      if (!tab) {
        captureStatus.textContent = t(lang, "memories.openAndConnectFirst");
        return;
      }
      const response = await sendToActiveTab({ type: "sp:get-composer-text" });
      if (!response || !response.ok || !response.text.trim()) {
        captureStatus.textContent = t(lang, "memories.composerNotFound");
        return;
      }
      captureStatus.textContent = "";
      openMemoryModal(ctx, { prefillText: response.text.trim() });
    },
  });

  const activeProfileId = ctx.store.settings.activeProfileId;
  const alwaysUseCount = ctx.store.memories.filter(
    (m) => m.alwaysUse && m.enabled && m.profileId === activeProfileId,
  ).length;
  const alwaysUseCap = ctx.store.settings.maxAlwaysUseMemories;

  const children: Node[] = [
    el("h2", { text: t(lang, "memories.title") }),
    el("p", {
      className: "view-subtitle",
      text: t(lang, "memories.subtitle"),
    }),
  ];

  if (alwaysUseCount > alwaysUseCap) {
    children.push(
      el("div", { className: "card" }, [
        el("p", {
          className: "hint",
          text: t(lang, "memories.alwaysUseCapWarning", { count: alwaysUseCount, cap: alwaysUseCap }),
        }),
      ]),
    );
  }

  children.push(
    el("div", { className: "toolbar" }, [addButton, duplicatesButton]),
    el("div", { className: "toolbar" }, [captureSelectionBtn]),
    el("div", { className: "toolbar" }, [captureComposerBtn]),
    captureStatus,
    el("hr", { className: "divider" }),
    el("div", { className: "toolbar" }, [searchInput]),
    el("div", { className: "toolbar" }, [profileFilterSelect, categoryFilterSelect]),
    el("div", { className: "field-row" }, [
      el("label", {}, [preferredOnlyCheckbox, t(lang, "memories.preferredOnlyLabel")]),
    ]),
    bulkToolbar,
    listContainer,
  );

  mount(root, ...children);

  renderList();

  if (ctx.consumeIntent() === "add-memory") {
    openMemoryModal(ctx);
  }
}
