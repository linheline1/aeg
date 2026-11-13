const entries = new Map<string, { value: unknown; savedAt: number }>();
const MAX_AGE_MS = 5 * 60 * 1000;

export function readListCache<T>(key: string): T | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    entries.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeListCache<T>(key: string, value: T): void {
  entries.set(key, { value, savedAt: Date.now() });
}

export function clearListCache(): void {
  entries.clear();
}

export function invalidateListCache(prefix: string): void {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}
