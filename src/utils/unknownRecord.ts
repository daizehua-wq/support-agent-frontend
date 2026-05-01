export type UnknownRecord = Record<string, unknown>;

export function isUnknownRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asUnknownRecord(value: unknown): UnknownRecord {
  return isUnknownRecord(value) ? value : {};
}

export function readValue(value: unknown, key: string): unknown {
  return asUnknownRecord(value)[key];
}

export function readRecord(value: unknown, key: string): UnknownRecord {
  return asUnknownRecord(readValue(value, key));
}

export function readArray(value: unknown, key: string): unknown[] {
  const candidate = readValue(value, key);
  return Array.isArray(candidate) ? candidate : [];
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readString(value: unknown, key: string, fallback = ''): string {
  const candidate = readValue(value, key);
  if (typeof candidate === 'string') return candidate;
  if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate);
  return fallback;
}

export function readNumber(value: unknown, key: string, fallback = 0): number {
  const candidate = readValue(value, key);
  const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readBoolean(value: unknown, key: string, fallback = false): boolean {
  const candidate = readValue(value, key);
  return typeof candidate === 'boolean' ? candidate : fallback;
}

export function firstPresent(value: unknown, keys: string[]): unknown {
  const record = asUnknownRecord(value);
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

export function firstString(value: unknown, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const candidate = readString(value, key);
    if (candidate) return candidate;
  }
  return fallback;
}

export function firstRecord(value: unknown, keys: string[]): UnknownRecord {
  return asUnknownRecord(firstPresent(value, keys));
}

export function firstArray(value: unknown, keys: string[]): unknown[] {
  const candidate = firstPresent(value, keys);
  return Array.isArray(candidate) ? candidate : [];
}
