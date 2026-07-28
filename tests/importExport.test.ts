import { describe, it, expect, beforeEach } from "vitest";
import { validateImportPayload, checkFileSize } from "../src/importExport/validation";
import { applyImport } from "../src/importExport/importData";
import { buildExportPayload, serializeExport } from "../src/importExport/exportData";
import type { MemoryRepository } from "../src/storage/MemoryRepository";
import { makeMemory, makeProfile, makeSettings } from "./helpers";
import type { ExtensionSettings, MemoryItem, MemoryProfile } from "../src/memory/types";

class InMemoryRepository implements MemoryRepository {
  memories: MemoryItem[] = [];
  profiles: MemoryProfile[] = [];
  settings: ExtensionSettings = makeSettings();

  async listMemories() {
    return this.memories;
  }
  async getMemory(id: string) {
    return this.memories.find((m) => m.id === id) ?? null;
  }
  async saveMemory(memory: MemoryItem) {
    const idx = this.memories.findIndex((m) => m.id === memory.id);
    if (idx >= 0) this.memories[idx] = memory;
    else this.memories.push(memory);
  }
  async saveMemories(memories: MemoryItem[]) {
    for (const memory of memories) {
      await this.saveMemory(memory);
    }
  }
  async deleteMemory(id: string) {
    this.memories = this.memories.filter((m) => m.id !== id);
  }
  async listProfiles() {
    return this.profiles;
  }
  async saveProfile(profile: MemoryProfile) {
    const idx = this.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) this.profiles[idx] = profile;
    else this.profiles.push(profile);
  }
  async saveProfiles(profiles: MemoryProfile[]) {
    for (const profile of profiles) {
      await this.saveProfile(profile);
    }
  }
  async deleteProfile(id: string) {
    this.profiles = this.profiles.filter((p) => p.id !== id);
  }
  async getSettings() {
    return this.settings;
  }
  async saveSettings(settings: ExtensionSettings) {
    this.settings = settings;
  }
  async listConnections() {
    return [];
  }
  async saveConnection() {
    /* no-op pro testy importu/exportu */
  }
  async replaceAll(data: { profiles: MemoryProfile[]; memories: MemoryItem[]; settings: ExtensionSettings }) {
    this.profiles = data.profiles;
    this.memories = data.memories;
    this.settings = data.settings;
  }
  async wipeAll() {
    this.memories = [];
    this.profiles = [];
  }
}

describe("validateImportPayload", () => {
  it("odmítne, co není objekt", () => {
    expect(validateImportPayload("řetězec").valid).toBe(false);
    expect(validateImportPayload(null).valid).toBe(false);
    expect(validateImportPayload([1, 2, 3]).valid).toBe(false);
  });

  it("odmítne neznámou verzi formátu", () => {
    const result = validateImportPayload({
      formatVersion: 2,
      profiles: [],
      memories: [],
      settings: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/verze/i);
  });

  it("odmítne poškozenou vzpomínku (chybí povinné pole)", () => {
    const result = validateImportPayload({
      formatVersion: 1,
      profiles: [],
      memories: [{ id: "x", text: "něco" }],
      settings: makeSettings(),
    });
    expect(result.valid).toBe(false);
  });

  it("přijme platný export", () => {
    const profile = makeProfile();
    const memory = makeMemory({ profileId: profile.id });
    const result = validateImportPayload({
      formatVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      profiles: [profile],
      memories: [memory],
      settings: makeSettings(),
    });
    expect(result.valid).toBe(true);
    expect(result.data?.memories).toHaveLength(1);
  });

  it("checkFileSize odmítne příliš velký soubor", () => {
    expect(checkFileSize(1024)).toBeNull();
    expect(checkFileSize(50 * 1024 * 1024)).not.toBeNull();
  });
});

describe("applyImport", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  it("merge: přidá nové a přepíše existující záznamy podle ID, nic jiného nesmaže", async () => {
    const existingProfile = makeProfile({ name: "Stávající" });
    const existingMemory = makeMemory({ text: "Stávající vzpomínka", profileId: existingProfile.id });
    await repo.saveProfile(existingProfile);
    await repo.saveMemory(existingMemory);

    const updatedMemory = { ...existingMemory, text: "Přepsaná vzpomínka" };
    const brandNewMemory = makeMemory({ text: "Nová", profileId: existingProfile.id });

    const summary = await applyImport(
      repo,
      {
        formatVersion: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        profiles: [existingProfile],
        memories: [updatedMemory, brandNewMemory],
        settings: makeSettings(),
      },
      "merge",
    );

    expect(summary.importedMemories).toBe(2);
    const all = await repo.listMemories();
    expect(all).toHaveLength(2);
    expect(all.find((m) => m.id === existingMemory.id)?.text).toBe("Přepsaná vzpomínka");
  });

  it("replace: nahradí veškerá data importovanými", async () => {
    await repo.saveMemory(makeMemory({ text: "Bude smazáno" }));
    const importedMemory = makeMemory({ text: "Jediná po importu" });

    await applyImport(
      repo,
      {
        formatVersion: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        profiles: [],
        memories: [importedMemory],
        settings: makeSettings({ maxMemoriesPerPrompt: 3 }),
      },
      "replace",
    );

    const all = await repo.listMemories();
    expect(all).toHaveLength(1);
    expect(all[0]?.text).toBe("Jediná po importu");
    expect((await repo.getSettings()).maxMemoriesPerPrompt).toBe(3);
  });
});

describe("export", () => {
  it("sestaví export se všemi částmi a serializuje na čitelný JSON", async () => {
    const repo = new InMemoryRepository();
    await repo.saveProfile(makeProfile());
    await repo.saveMemory(makeMemory());

    const payload = await buildExportPayload(repo);
    expect(payload.formatVersion).toBe(1);
    expect(payload.profiles).toHaveLength(1);
    expect(payload.memories).toHaveLength(1);
    expect(typeof payload.exportedAt).toBe("string");

    const json = serializeExport(payload);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
