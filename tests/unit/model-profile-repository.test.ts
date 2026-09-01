import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelProfile } from "@/shared/types/domain";
import {
  ModelProfileRepository,
  PreferencesRepository,
} from "@/services/storage";

type StorageValues = Record<string, unknown>;

function createChromeStorage(): StorageValues {
  const values: StorageValues = {};
  const setAccessLevel = vi.fn(async (): Promise<void> => {});

  vi.stubGlobal("chrome", {
    storage: {
      local: {
        async get(key: string): Promise<StorageValues> {
          return key in values ? { [key]: structuredClone(values[key]) } : {};
        },
        async set(items: StorageValues): Promise<void> {
          Object.assign(values, structuredClone(items));
        },
        async remove(key: string): Promise<void> {
          delete values[key];
        },
        setAccessLevel,
      },
    },
  });

  values.setAccessLevel = setAccessLevel;
  return values;
}

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: "profile-1",
    name: "Test profile",
    provider: "openai-chat",
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-api-key",
    model: "test-model",
    maxOutputTokens: 1024,
    isDefault: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("ModelProfileRepository", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only one default model profile", async () => {
    createChromeStorage();
    const repository = new ModelProfileRepository();

    await repository.save(profile({ id: "a", isDefault: true }));
    await repository.save(profile({ id: "b", isDefault: true }));

    expect((await repository.list()).filter((item) => item.isDefault).map((item) => item.id)).toEqual([
      "b",
    ]);
  });

  it("returns copies and initializes trusted storage access", async () => {
    const storage = createChromeStorage();
    const repository = new ModelProfileRepository();

    await repository.save(profile({ isDefault: true }));
    const result = await repository.get("profile-1");

    expect(result).toEqual(profile({ isDefault: true }));
    expect(result).not.toBe(storage.modelProfiles);
    expect(storage.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    if (result) {
      result.name = "Changed by caller";
    }
    expect((await repository.get("profile-1"))?.name).toBe("Test profile");
  });

  it("deletes a profile", async () => {
    createChromeStorage();
    const repository = new ModelProfileRepository();
    await repository.save(profile());

    await repository.delete("profile-1");

    await expect(repository.get("profile-1")).resolves.toBeUndefined();
  });

  it("promotes a remaining profile when deleting the default", async () => {
    createChromeStorage();
    const repository = new ModelProfileRepository();
    await repository.save(profile({ id: "default", isDefault: true }));
    await repository.save(profile({ id: "backup", isDefault: false }));

    await repository.delete("default");

    await expect(repository.list()).resolves.toMatchObject([
      { id: "backup", isDefault: true },
    ]);
  });
});

describe("PreferencesRepository", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists theme and disclosure acceptance", async () => {
    createChromeStorage();
    const repository = new PreferencesRepository();

    await repository.save({ theme: "dark", disclosureAccepted: true });

    await expect(repository.get()).resolves.toEqual({
      theme: "dark",
      disclosureAccepted: true,
    });
  });
});
