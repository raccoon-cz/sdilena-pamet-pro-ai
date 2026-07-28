import { describe, it, expect, beforeEach } from "vitest";
import { ChromeStorageRepository } from "../src/storage/ChromeStorageRepository";
import { makeMemory, makeProfile, makeSettings } from "./helpers";

function installFakeChromeStorage(initial: Record<string, unknown> = {}) {
  let store: Record<string, unknown> = { ...initial };

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { lastError: undefined },
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
  };

  return {
    getRawStore: () => store,
    setRawStore: (next: Record<string, unknown>) => {
      store = next;
    },
  };
}

describe("ChromeStorageRepository", () => {
  let repo: ChromeStorageRepository;

  beforeEach(() => {
    installFakeChromeStorage();
    repo = new ChromeStorageRepository();
  });

  it("uloží a znovu načte vzpomínku", async () => {
    const memory = makeMemory({ text: "Test" });
    await repo.saveMemory(memory);
    const loaded = await repo.getMemory(memory.id);
    expect(loaded?.text).toBe("Test");
  });

  it("upravuje existující vzpomínku podle ID místo duplikace", async () => {
    const memory = makeMemory({ text: "Původní" });
    await repo.saveMemory(memory);
    await repo.saveMemory({ ...memory, text: "Upravené" });
    const all = await repo.listMemories();
    expect(all).toHaveLength(1);
    expect(all[0]?.text).toBe("Upravené");
  });

  it("smaže vzpomínku", async () => {
    const memory = makeMemory();
    await repo.saveMemory(memory);
    await repo.deleteMemory(memory.id);
    expect(await repo.listMemories()).toHaveLength(0);
  });

  it("saveMemories hromadně upraví více vzpomínek najednou beze ztráty ostatních", async () => {
    const a = makeMemory({ text: "A", enabled: true });
    const b = makeMemory({ text: "B", enabled: true });
    const untouched = makeMemory({ text: "Nedotčená", enabled: true });
    await repo.saveMemory(a);
    await repo.saveMemory(b);
    await repo.saveMemory(untouched);

    await repo.saveMemories([
      { ...a, enabled: false },
      { ...b, enabled: false },
    ]);

    const all = await repo.listMemories();
    expect(all).toHaveLength(3);
    expect(all.find((m) => m.id === a.id)?.enabled).toBe(false);
    expect(all.find((m) => m.id === b.id)?.enabled).toBe(false);
    expect(all.find((m) => m.id === untouched.id)?.enabled).toBe(true);
  });

  it("při nastavení profilu jako výchozího zruší výchozí u ostatních", async () => {
    const a = makeProfile({ isDefault: true });
    const b = makeProfile({ isDefault: false });
    await repo.saveProfile(a);
    await repo.saveProfile(b);
    await repo.saveProfile({ ...b, isDefault: true });
    const all = await repo.listProfiles();
    expect(all.find((p) => p.id === a.id)?.isDefault).toBe(false);
    expect(all.find((p) => p.id === b.id)?.isDefault).toBe(true);
  });

  it("vrátí výchozí nastavení, pokud v úložišti nic není", async () => {
    const settings = await repo.getSettings();
    expect(settings.maxMemoriesPerPrompt).toBe(8);
    expect(settings.maxContextCharacters).toBe(2500);
  });

  it("přežije poškozená data v úložišti (špatný tvar) a vrátí bezpečné výchozí hodnoty", async () => {
    const fake = installFakeChromeStorage({
      memories: "toto neni pole",
      profiles: { neco: "spatne" },
      settings: 12345,
    });
    repo = new ChromeStorageRepository();

    expect(await repo.listMemories()).toEqual([]);
    expect(await repo.listProfiles()).toEqual([]);
    const settings = await repo.getSettings();
    expect(settings.maxMemoriesPerPrompt).toBe(8);
    expect(fake.getRawStore().memories).toBe("toto neni pole");
  });

  it("wipeAll vymaže veškerá data", async () => {
    await repo.saveMemory(makeMemory());
    await repo.saveProfile(makeProfile());
    await repo.saveSettings(makeSettings());
    await repo.wipeAll();
    expect(await repo.listMemories()).toEqual([]);
    expect(await repo.listProfiles()).toEqual([]);
  });
});
