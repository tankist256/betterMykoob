export interface StoragePort {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

export const storage: StoragePort = {
  async get<T>(key: string, fallback: T): Promise<T> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return fallback;
    const result = await chrome.storage.local.get(key);
    return (result[key] as T | undefined) ?? fallback;
  },
  async set<T>(key: string, value: T): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [key]: value });
  },
};
