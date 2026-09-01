import type { ModelProfile } from "@/shared/types/domain";
import { cloneValue, getLocalStorage, type ChromeStorageArea } from "./chrome-storage";

const MODEL_PROFILES_KEY = "modelProfiles";

export class ModelProfileRepository {
  constructor(private readonly storage: ChromeStorageArea = getLocalStorage()) {}

  async list(): Promise<ModelProfile[]> {
    const result = await this.storage.get(MODEL_PROFILES_KEY);
    const profiles = result[MODEL_PROFILES_KEY];

    return Array.isArray(profiles) ? cloneValue(profiles as ModelProfile[]) : [];
  }

  async get(id: string): Promise<ModelProfile | undefined> {
    return (await this.list()).find((profile) => profile.id === id);
  }

  async save(profile: ModelProfile): Promise<void> {
    const profiles = await this.list();
    const nextProfile = cloneValue(profile);
    const remainingProfiles = profiles.filter((item) => item.id !== nextProfile.id);
    const nextProfiles = nextProfile.isDefault
      ? remainingProfiles.map((item) => ({ ...item, isDefault: false })).concat(nextProfile)
      : remainingProfiles.concat(nextProfile);

    await this.storage.set({ [MODEL_PROFILES_KEY]: nextProfiles });
  }

  async delete(id: string): Promise<void> {
    const profiles = await this.list();
    const nextProfiles = profiles.filter((profile) => profile.id !== id);

    if (nextProfiles.length === 0) {
      await this.storage.remove(MODEL_PROFILES_KEY);
      return;
    }

    await this.storage.set({ [MODEL_PROFILES_KEY]: nextProfiles });
  }
}
