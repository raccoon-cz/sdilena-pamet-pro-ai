import { el, mount } from "../dom";
import type { ViewContext } from "../viewTypes";
import type { MemoryProfile } from "../../memory/types";
import { createId, nowIso } from "../../shared/ids";
import { t, type Language } from "../../shared/i18n";
import { showConfirmDialog } from "./confirmDialog";

function profileCard(profile: MemoryProfile, ctx: ViewContext, lang: Language) {
  const isActive = profile.id === ctx.store.settings.activeProfileId;
  const memoryCount = ctx.store.memories.filter((m) => m.profileId === profile.id).length;

  const nameInput = el("input", { attrs: { type: "text" } }) as HTMLInputElement;
  nameInput.value = profile.name;

  const badges = [
    el("span", { className: "badge", text: t(lang, "profiles.memoriesCountBadge", { count: memoryCount }) }),
  ];
  if (isActive) badges.push(el("span", { className: "badge accent", text: t(lang, "profiles.activeBadge") }));
  if (profile.isDefault) badges.push(el("span", { className: "badge", text: t(lang, "profiles.defaultBadge") }));

  const saveNameBtn = el("button", {
    className: "btn small",
    text: t(lang, "profiles.saveNameButton"),
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await ctx.store.repository.saveProfile({ ...profile, name, updatedAt: nowIso() });
      await ctx.refresh();
    },
  });

  const activateBtn = el("button", {
    className: "btn small",
    text: t(lang, "common.activate"),
    onClick: async () => {
      await ctx.store.repository.saveSettings({
        ...ctx.store.settings,
        activeProfileId: profile.id,
      });
      await ctx.refresh();
    },
  });
  if (isActive) (activateBtn as HTMLButtonElement).disabled = true;

  const defaultBtn = el("button", {
    className: "btn small",
    text: t(lang, "profiles.setDefaultButton"),
    onClick: async () => {
      await ctx.store.repository.saveProfile({
        ...profile,
        isDefault: true,
        updatedAt: nowIso(),
      });
      await ctx.refresh();
    },
  });
  if (profile.isDefault) (defaultBtn as HTMLButtonElement).disabled = true;

  const deleteBtn = el("button", {
    className: "btn small danger",
    text: t(lang, "common.delete"),
    onClick: async () => {
      if (ctx.store.profiles.length <= 1) {
        await showConfirmDialog({
          lang,
          title: t(lang, "profiles.cannotDeleteTitle"),
          message: t(lang, "profiles.cannotDeleteMessage"),
          confirmLabel: t(lang, "profiles.understoodButton"),
        });
        return;
      }
      const confirmed = await showConfirmDialog({
        lang,
        title: t(lang, "profiles.deleteConfirmTitle", { name: profile.name }),
        message:
          memoryCount > 0
            ? t(lang, "profiles.deleteConfirmMessageWithMemories", { count: memoryCount })
            : t(lang, "memories.deleteConfirmMessage"),
        confirmLabel: t(lang, "common.delete"),
        danger: true,
      });
      if (!confirmed) return;
      await ctx.store.repository.deleteProfile(profile.id);
      await ctx.refresh();
    },
  });

  return el("div", { className: "card" }, [
    el("div", { className: "memory-card__meta" }, badges),
    el("div", { className: "field-row" }, [nameInput, saveNameBtn]),
    el("div", { className: "memory-card__actions" }, [activateBtn, defaultBtn, deleteBtn]),
  ]);
}

export function renderProfiles(root: HTMLElement, ctx: ViewContext): void {
  const lang = ctx.store.settings.language;

  const newNameInput = el("input", {
    attrs: { type: "text", placeholder: t(lang, "profiles.newNamePlaceholder") },
  }) as HTMLInputElement;

  const createBtn = el("button", {
    className: "btn primary",
    text: t(lang, "profiles.createButton"),
    onClick: async () => {
      const name = newNameInput.value.trim();
      if (!name) return;
      const now = nowIso();
      const profile: MemoryProfile = {
        id: createId(),
        name,
        isDefault: false,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.store.repository.saveProfile(profile);
      newNameInput.value = "";
      await ctx.refresh();
    },
  });

  const list = ctx.store.profiles.map((p) => profileCard(p, ctx, lang));

  mount(
    root,
    el("h2", { text: t(lang, "profiles.title") }),
    el("p", {
      className: "view-subtitle",
      text: t(lang, "profiles.subtitle"),
    }),
    el("div", { className: "card" }, [
      el("div", { className: "field-row" }, [newNameInput, createBtn]),
    ]),
    ...list,
  );
}
