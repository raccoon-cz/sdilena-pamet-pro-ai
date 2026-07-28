import type { ProviderAdapter } from "../providers/ProviderAdapter";
import type { MemoryRepository } from "../storage/MemoryRepository";
import type { MemoryItem } from "../memory/types";
import { selectRelevantMemories } from "../memory/relevance";
import { formatMemoryContext } from "../memory/formatter";
import { getCategoryLabel } from "../shared/constants";
import { t, type Language } from "../shared/i18n";

const HOST_ID = "shared-memory-preview-dialog-host";

function buildStyle(): string {
  return `
    :host { all: initial; }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .modal {
      background: #ffffff;
      color: #0f172a;
      border-radius: 12px;
      padding: 18px;
      width: 380px;
      max-width: 92vw;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.35);
    }
    h3 { margin: 0 0 4px; font-size: 15px; }
    p.subtitle { margin: 0 0 12px; font-size: 12.5px; color: #64748b; }
    .item {
      display: flex;
      gap: 8px;
      padding: 8px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 8px;
      align-items: flex-start;
    }
    .item input { margin-top: 3px; }
    .item .text { font-size: 13px; white-space: pre-wrap; word-break: break-word; }
    .item .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
    .item .sensitive { color: #9a3412; font-weight: 600; }
    .empty { font-size: 13px; color: #64748b; padding: 12px 0; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    button {
      border: 1px solid #e2e8f0;
      background: #ffffff;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }
    button.primary { background: #0284c7; border-color: #0284c7; color: #ffffff; font-weight: 600; }
  `;
}

function itemRow(
  memory: MemoryItem,
  checked: boolean,
  lang: Language,
): { row: HTMLElement; checkbox: HTMLInputElement } {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;

  const textEl = document.createElement("div");
  textEl.className = "text";
  textEl.textContent = memory.text;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = getCategoryLabel(lang, memory.category);
  if (memory.sensitivity === "sensitive") {
    const warn = document.createElement("span");
    warn.className = "sensitive";
    warn.textContent = t(lang, "previewDialog.sensitiveLabel");
    meta.append(warn);
  }

  const textWrap = document.createElement("div");
  textWrap.append(textEl, meta);

  const row = document.createElement("label");
  row.className = "item";
  row.append(checkbox, textWrap);

  return { row, checkbox };
}

export async function openPreviewDialog(
  adapter: ProviderAdapter,
  repository: MemoryRepository,
): Promise<void> {
  if (document.getElementById(HOST_ID)) return;

  const query = adapter.readComposerText().trim();
  const settings = await repository.getSettings();
  const lang = settings.language;
  const memories = await repository.listMemories();

  const scored = query
    ? selectRelevantMemories({
        query,
        activeProfileId: settings.activeProfileId,
        memories,
        settings,
      })
    : [];

  if (!settings.showPreviewBeforeInsert && query) {
    const formatted = formatMemoryContext(
      scored.map((s) => s.memory),
      query,
      lang,
    );
    await adapter.replaceComposerText(formatted);
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildStyle();

  const close = () => host.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const modal = document.createElement("div");
  modal.className = "modal";

  const title = document.createElement("h3");
  title.textContent = t(lang, "previewDialog.title");
  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = query
    ? t(lang, "previewDialog.subtitleWithQuery")
    : t(lang, "previewDialog.subtitleNoQuery");

  modal.append(title, subtitle);

  const checkboxes: { memory: MemoryItem; checkbox: HTMLInputElement }[] = [];

  if (scored.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = query ? t(lang, "previewDialog.noMatchesFound") : "";
    modal.append(empty);
  } else {
    // Když jsou všechny zobrazené vzpomínky jen ty "upřednostněné" (score
    // === Infinity) a žádná nebyla vybrána podle skutečné shody s dotazem,
    // dá se to snadno splést s tím, že rozšíření "nic jiného nenašlo" kvůli
    // chybě — vysvětlíme, že jde o očekávané chování a co s tím jde dělat.
    const hasContextualMatch = scored.some((s) => Number.isFinite(s.score));
    if (query && !hasContextualMatch) {
      const eligibleCount = memories.filter(
        (m) => m.enabled && m.profileId === settings.activeProfileId,
      ).length;
      const otherCount = Math.max(0, eligibleCount - scored.length);
      if (otherCount > 0) {
        const note = document.createElement("p");
        note.className = "subtitle";
        note.textContent = t(lang, "previewDialog.onlyAlwaysUseNote", { total: otherCount });
        modal.append(note);
      }
    }
  }

  if (scored.length > 0) {
    for (const { memory } of scored) {
      const { row, checkbox } = itemRow(memory, true, lang);
      checkboxes.push({ memory, checkbox });
      modal.append(row);
    }
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t(lang, "common.cancel");
  cancelBtn.addEventListener("click", close);

  const insertBtn = document.createElement("button");
  insertBtn.className = "primary";
  insertBtn.textContent = t(lang, "previewDialog.insertButton");
  insertBtn.disabled = !query;
  insertBtn.addEventListener("click", async () => {
    const selected = checkboxes.filter((c) => c.checkbox.checked).map((c) => c.memory);
    const formatted = formatMemoryContext(selected, query, lang);
    await adapter.replaceComposerText(formatted);
    close();
  });

  actions.append(cancelBtn, insertBtn);
  modal.append(actions);
  backdrop.append(modal);
  shadow.append(style, backdrop);
  document.body.append(host);
}
