import { cloneValue, getLocalStorage, type ChromeStorageArea } from "./chrome-storage";

const PREFERENCES_KEY = "preferences";

export type ThemePreference = "light" | "dark" | "system";

export interface Preferences {
  theme: ThemePreference;
  disclosureAccepted: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  disclosureAccepted: false,
};

export class PreferencesRepository {
  constructor(private readonly storage: ChromeStorageArea = getLocalStorage()) {}

  async get(): Promise<Preferences> {
    const result = await this.storage.get(PREFERENCES_KEY);
    const preferences = result[PREFERENCES_KEY];

    if (!isPreferences(preferences)) {
      return cloneValue(DEFAULT_PREFERENCES);
    }

    return cloneValue(preferences);
  }

  async save(preferences: Preferences): Promise<void> {
    await this.storage.set({ [PREFERENCES_KEY]: cloneValue(preferences) });
  }
}

function isPreferences(value: unknown): value is Preferences {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.theme === "light" || candidate.theme === "dark" || candidate.theme === "system") &&
    typeof candidate.disclosureAccepted === "boolean"
  );
}
