export interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  setAccessLevel?(options: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void>;
}

export function getLocalStorage(): ChromeStorageArea {
  const storage = chrome.storage.local as unknown as ChromeStorageArea;

  if (storage.setAccessLevel) {
    void storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }

  return storage;
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
