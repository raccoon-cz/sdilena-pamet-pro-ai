// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integrační test skutečného běhu side panelu (ne jen čisté logiky).
 * Simuluje chrome.* API v jsdomu a klikáním přes DOM ověřuje, že appka
 * (store + views + modály) funguje jako celek — tohle Vitest jednotkové
 * testy ostatních modulů nepokrývají a nešlo to ověřit v živém Chromu
 * (sandboxované prostředí neumí načíst rozbalené rozšíření).
 */

const SHELL_HTML = `
  <div id="app">
    <header class="app-header">
      <div class="app-title"><span>Sdílená paměť pro AI</span></div>
      <button id="nav-settings-btn" class="icon-button">⚙</button>
    </header>
    <nav class="tabs" id="main-tabs">
      <button class="tabs__item" data-view="overview">Přehled</button>
      <button class="tabs__item" data-view="memories">Moje paměť</button>
      <button class="tabs__item" data-view="profiles">Profily</button>
      <button class="tabs__item" data-view="providers">Připojené AI</button>
    </nav>
    <main id="view-root" class="view-root"></main>
  </div>
`;

function installFakeChrome() {
  let store: Record<string, unknown> = {};

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined as { message: string } | undefined,
      sendMessage: vi.fn().mockResolvedValue({ ok: true, permissionGranted: true }),
      getManifest: () => ({ version: "0.1.0" }),
    },
    storage: {
      local: {
        get(keys: string[], callback: (result: Record<string, unknown>) => void) {
          const result: Record<string, unknown> = {};
          for (const key of keys) result[key] = store[key];
          callback(result);
        },
        set(items: Record<string, unknown>, callback: () => void) {
          store = { ...store, ...items };
          callback();
        },
        clear(callback: () => void) {
          store = {};
          callback();
        },
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
    },
    permissions: {
      contains: vi.fn().mockResolvedValue(false),
    },
  };
}

async function bootApp() {
  document.body.innerHTML = SHELL_HTML;
  installFakeChrome();
  vi.resetModules();
  await import("../src/sidepanel/sidePanel");
  await vi.waitFor(() => {
    if (!document.querySelector("#view-root h2")) throw new Error("view not ready yet");
  });
}

function clickButtonWithText(container: ParentNode, text: string): void {
  const buttons = Array.from(container.querySelectorAll("button"));
  const btn = buttons.find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`Tlačítko "${text}" nenalezeno`);
  btn.click();
}

describe("side panel — integrační běh v jsdomu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("po startu vytvoří výchozí profil a zobrazí Přehled", async () => {
    await bootApp();
    const heading = document.querySelector("#view-root h2");
    expect(heading?.textContent).toBe("Přehled");
    expect(document.body.textContent).toContain("Osobní");
    expect(document.body.textContent).toContain("Uložených vzpomínek");
  });

  it("přepnutí na „Moje paměť“ zobrazí prázdný stav", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => {
      if (!document.querySelector(".empty-state")) throw new Error("not ready");
    });
    expect(document.body.textContent).toContain("Zatím tu nemáte žádné vzpomínky");
  });

  it("umožní vytvořit, upravit a smazat vzpomínku end-to-end přes UI", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => document.querySelector(".toolbar"));

    // Otevřít modál a uložit novou vzpomínku.
    clickButtonWithText(document, "+ Přidat vzpomínku");
    const modal = await vi.waitFor(() => {
      const m = document.querySelector(".modal-backdrop .modal");
      if (!m) throw new Error("modal not open");
      return m;
    });
    const textarea = modal.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "Preferuji odpovědi v češtině.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    clickButtonWithText(modal, "Uložit vzpomínku");

    await vi.waitFor(() => {
      if (!document.querySelector(".memory-card")) throw new Error("card not rendered yet");
    });
    expect(document.body.textContent).toContain("Preferuji odpovědi v češtině.");

    // Deaktivovat.
    const card = document.querySelector(".memory-card") as HTMLElement;
    clickButtonWithText(card, "Deaktivovat");
    await vi.waitFor(() => {
      if (!document.querySelector(".memory-card.disabled")) throw new Error("not disabled yet");
    });

    // Smazat + potvrzení.
    const cardAfterToggle = document.querySelector(".memory-card") as HTMLElement;
    clickButtonWithText(cardAfterToggle, "Smazat");
    const confirmModal = await vi.waitFor(() => {
      const m = document.querySelector(".modal-backdrop .modal");
      if (!m) throw new Error("confirm modal not open");
      return m;
    });
    clickButtonWithText(confirmModal, "Smazat");

    await vi.waitFor(() => {
      if (!document.querySelector(".empty-state")) throw new Error("not empty yet");
    });
    expect(document.body.textContent).not.toContain("Preferuji odpovědi v češtině.");
  });

  it("umožní vytvořit nový profil a aktivovat ho", async () => {
    await bootApp();
    clickButtonWithText(document, "Profily");
    await vi.waitFor(() => document.querySelector('input[type="text"]'));

    // Jméno nového profilu jde do pole "+ Vytvořit profil" — je to první
    // input[type=text] na stránce, protože formulář pro nový profil je nad
    // seznamem stávajících profilů.
    const newNameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    newNameInput.value = "Práce";
    newNameInput.dispatchEvent(new Event("input", { bubbles: true }));
    clickButtonWithText(document, "+ Vytvořit profil");

    function findCardByProfileName(name: string): HTMLElement | undefined {
      // Karta konkrétního profilu (na rozdíl od formulářové karty "+
      // Vytvořit profil") vždy obsahuje tlačítko "Smazat".
      return Array.from(document.querySelectorAll<HTMLElement>(".card")).find((card) => {
        const input = card.querySelector('input[type="text"]') as HTMLInputElement | null;
        const hasDeleteButton = Array.from(card.querySelectorAll("button")).some(
          (b) => b.textContent?.trim() === "Smazat",
        );
        return input?.value === name && hasDeleteButton;
      });
    }

    const workCard = await vi.waitFor(() => {
      const card = findCardByProfileName("Práce");
      if (!card) throw new Error("profile not created yet");
      return card;
    });

    clickButtonWithText(workCard, "Aktivovat");

    await vi.waitFor(() => {
      const refreshedCard = findCardByProfileName("Práce");
      const badgeTexts = Array.from(refreshedCard?.querySelectorAll(".badge") ?? []).map(
        (b) => b.textContent,
      );
      if (!badgeTexts.includes("Aktivní")) throw new Error("not active yet");
    });
  });

  async function createMemoryViaUi(text: string): Promise<void> {
    clickButtonWithText(document, "+ Přidat vzpomínku");
    const modal = await vi.waitFor(() => {
      const m = document.querySelector(".modal-backdrop .modal");
      if (!m) throw new Error("modal not open");
      return m;
    });
    const textarea = modal.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    clickButtonWithText(modal, "Uložit vzpomínku");
    await vi.waitFor(() => {
      if (!document.body.textContent?.includes(text)) throw new Error("memory not created yet");
    });
  }

  it("hromadná akce deaktivuje více vybraných vzpomínek najednou", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => document.querySelector(".toolbar"));

    await createMemoryViaUi("První vzpomínka");
    await createMemoryViaUi("Druhá vzpomínka");

    const checkboxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('.memory-card input[type="checkbox"]'),
    );
    expect(checkboxes).toHaveLength(2);
    for (const checkbox of checkboxes) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Vybráno: 2")) {
        throw new Error("selection count not updated yet");
      }
    });

    const bulkSelect = Array.from(document.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "deactivate"),
    ) as HTMLSelectElement;
    bulkSelect.value = "deactivate";
    bulkSelect.dispatchEvent(new Event("change", { bubbles: true }));

    clickButtonWithText(document, "Použít");

    await vi.waitFor(() => {
      const disabledCards = document.querySelectorAll(".memory-card.disabled");
      if (disabledCards.length !== 2) throw new Error("not both disabled yet");
    });
  });

  it("hromadná akce 'Navrhnout klíčová slova' doplní klíčová slova bez otevření editace", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => document.querySelector(".toolbar"));

    await createMemoryViaUi("Vlastním B2B úklidovou firmu v Brně");

    const checkbox = document.querySelector<HTMLInputElement>(
      '.memory-card input[type="checkbox"]',
    );
    expect(checkbox).toBeTruthy();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Vybráno: 1")) {
        throw new Error("selection count not updated yet");
      }
    });

    const bulkSelect = Array.from(document.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "suggest-keywords"),
    ) as HTMLSelectElement;
    bulkSelect.value = "suggest-keywords";
    bulkSelect.dispatchEvent(new Event("change", { bubbles: true }));

    clickButtonWithText(document, "Použít");

    await vi.waitFor(() => {
      if (document.body.textContent?.includes("Vybráno:")) {
        throw new Error("selection not cleared yet (bulk action not finished)");
      }
    });

    clickButtonWithText(document, "Upravit");
    const modal = await vi.waitFor(() => {
      const m = document.querySelector(".modal-backdrop .modal");
      if (!m) throw new Error("edit modal not open");
      return m;
    });
    const keywordsInput = modal.querySelector(
      'input[placeholder="klíčová slova oddělená čárkou"]',
    ) as HTMLInputElement;
    expect(keywordsInput.value.length).toBeGreaterThan(0);
    expect(keywordsInput.value).toContain("úklidovou");
  });

  it("vyhledávání filtruje seznam podle textu", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => document.querySelector(".toolbar"));

    await createMemoryViaUi("Preferuje kávu ráno");
    await createMemoryViaUi("Vlastní úklidovou firmu");

    const searchInput = document.querySelector(
      'input[placeholder="Hledat v textu nebo klíčových slovech…"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    searchInput.value = "úklidovou";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => {
      const cards = document.querySelectorAll(".memory-card");
      if (cards.length !== 1) throw new Error("filter not applied yet");
    });
    expect(document.body.textContent).toContain("Vlastní úklidovou firmu");
    expect(document.body.textContent).not.toContain("Preferuje kávu ráno");
  });

  it("tlačítko 'Navrhnout z textu' doplní klíčová slova z rozepsaného textu", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => document.querySelector(".toolbar"));

    clickButtonWithText(document, "+ Přidat vzpomínku");
    const modal = await vi.waitFor(() => {
      const m = document.querySelector(".modal-backdrop .modal");
      if (!m) throw new Error("modal not open");
      return m;
    });

    const textarea = modal.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "Vlastní B2B úklidovou firmu v Brně.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    clickButtonWithText(modal, "Navrhnout z textu");

    const keywordsInput = modal.querySelector(
      'input[placeholder="klíčová slova oddělená čárkou"]',
    ) as HTMLInputElement;
    expect(keywordsInput.value.length).toBeGreaterThan(0);
    expect(keywordsInput.value).toContain("úklidovou");
  });

  it("nástroj 'Zkontrolovat duplicity' najde a umožní smazat téměř identickou vzpomínku", async () => {
    await bootApp();
    clickButtonWithText(document, "Moje paměť");
    await vi.waitFor(() => document.querySelector(".toolbar"));

    await createMemoryViaUi("Vlastním B2B úklidovou firmu v Brně");
    await createMemoryViaUi("Vlastním B2B úklidovou firmu v Brně.");

    clickButtonWithText(document, "Zkontrolovat duplicity");
    const modal = await vi.waitFor(() => {
      const m = document.querySelector(".modal-backdrop .modal");
      if (!m) throw new Error("duplicates modal not open");
      return m;
    });
    expect(modal.textContent).toContain("Možná duplicita");

    clickButtonWithText(modal, "Smazat první");

    await vi.waitFor(() => {
      if (!modal.textContent?.includes("Žádné další duplicity")) {
        throw new Error("pair not resolved yet");
      }
    });

    await vi.waitFor(() => {
      const cards = document.querySelectorAll(".memory-card");
      if (cards.length !== 1) throw new Error("memory not actually deleted yet");
    });
  });

  it("přepnutí jazyka v Nastavení skutečně přeloží rozhraní do angličtiny", async () => {
    await bootApp();
    clickButtonWithText(document, "⚙");

    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Jazyk rozhraní")) {
        throw new Error("settings not ready yet");
      }
    });

    const languageSelect = Array.from(document.querySelectorAll("select")).find((select) =>
      Array.from(select.options).some((o) => o.value === "en"),
    ) as HTMLSelectElement;
    expect(languageSelect).toBeTruthy();

    languageSelect.value = "en";
    languageSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Interface language")) {
        throw new Error("english translation not applied yet");
      }
    });

    // Statický shell (nadpis, navigace) se přeloží také.
    expect(document.querySelector(".app-title span:last-child")?.textContent).toBe(
      "Shared Memory for AI",
    );
    const memoriesNavBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".tabs__item"),
    ).find((b) => b.dataset.view === "memories");
    expect(memoriesNavBtn?.textContent).toBe("My Memory");

    // Ostatní views taky reagují na nové nastavení.
    clickButtonWithText(document, "My Memory");
    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Add memory")) {
        throw new Error("memories view not translated yet");
      }
    });
  });

  it("úvodní nápověda na Přehledu jde skrýt a znovu zobrazit z Nastavení", async () => {
    await bootApp();
    expect(document.body.textContent).toContain("Vítejte ve Sdílené paměti");

    clickButtonWithText(document, "Rozumím, skrýt");
    await vi.waitFor(() => {
      if (document.body.textContent?.includes("Vítejte ve Sdílené paměti")) {
        throw new Error("onboarding still visible");
      }
    });

    clickButtonWithText(document, "⚙");
    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Zobrazit úvodní nápovědu znovu")) {
        throw new Error("settings not ready yet");
      }
    });

    clickButtonWithText(document, "Zobrazit úvodní nápovědu znovu");
    await vi.waitFor(() => {
      if (!document.body.textContent?.includes("Vítejte ve Sdílené paměti")) {
        throw new Error("onboarding should be back on overview");
      }
    });
    expect(document.querySelector("#view-root h2")?.textContent).toBe("Přehled");
  });
});
