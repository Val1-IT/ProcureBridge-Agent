import { PersistenceIntegrityError } from "./errors";

const INTEGER_TEXT = /^-?(?:0|[1-9]\d*)$/;
const HASH = /^[0-9a-f]{64}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new PersistenceIntegrityError(`${label} must be an object.`);
  return value;
}

export function requireCanonicalText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new PersistenceIntegrityError(`${label} must be canonical text.`);
  }
  return value;
}

export function requireNullableCanonicalText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requireCanonicalText(value, label);
}

export function requireHash(value: unknown, label: string): string {
  const text = requireCanonicalText(value, label);
  if (!HASH.test(text)) throw new PersistenceIntegrityError(`${label} must be a SHA-256 hex digest.`);
  return text;
}

export function parseSafeInteger(value: unknown, label: string): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new PersistenceIntegrityError(`${label} must be a safe integer.`);
    return value;
  }
  const text = typeof value === "string" ? value : value instanceof Date ? "" : String(value);
  if (!INTEGER_TEXT.test(text)) throw new PersistenceIntegrityError(`${label} must be an integer string.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new PersistenceIntegrityError(`${label} exceeds a safe integer.`);
  return parsed;
}

export function parseNonNegativeSafeInteger(value: unknown, label: string): number {
  const parsed = parseSafeInteger(value, label);
  if (parsed < 0) throw new PersistenceIntegrityError(`${label} must be non-negative.`);
  return parsed;
}

export function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new PersistenceIntegrityError("Workspace revision must be a non-negative safe integer.");
  }
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new PersistenceIntegrityError("Workspace revision cannot increment safely.");
  }
  return current + 1;
}

export function parseRupiahText(value: unknown, label: string): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new PersistenceIntegrityError(`${label} must be an exact non-negative integer.`);
    }
    return String(value);
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new PersistenceIntegrityError(`${label} must be a canonical non-negative integer string.`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new PersistenceIntegrityError(`${label} must be non-negative.`);
    return parsed.toString(10);
  } catch (error) {
    if (error instanceof PersistenceIntegrityError) throw error;
    throw new PersistenceIntegrityError(`${label} is not a valid integer.`);
  }
}

export function asIsoInstant(value: unknown, label: string): string {
  if (value instanceof Date) {
    const iso = value.toISOString();
    if (Number.isNaN(value.getTime())) throw new PersistenceIntegrityError(`${label} is not a valid timestamp.`);
    return iso;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      throw new PersistenceIntegrityError(`${label} must be a strict ISO instant.`);
    }
    return value;
  }
  throw new PersistenceIntegrityError(`${label} must be a timestamp.`);
}

export function asNullableIsoInstant(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return asIsoInstant(value, label);
}

export function asIsoDate(value: unknown, label: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new PersistenceIntegrityError(`${label} is not a valid date.`);
    // node-postgres DATE parsing creates local midnight, not a UTC instant.
    // Preserve its calendar components instead of shifting the day in UTC+ zones.
    return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const date = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new PersistenceIntegrityError(`${label} must be an ISO date.`);
    return date;
  }
  throw new PersistenceIntegrityError(`${label} must be a date.`);
}

export function asNullableIsoDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return asIsoDate(value, label);
}

export function requireOneRow<T>(rows: readonly T[], label: string): T {
  if (rows.length === 0) throw new PersistenceIntegrityError(`${label} was not found.`);
  if (rows.length > 1) throw new PersistenceIntegrityError(`${label} matched more than one row.`);
  return rows[0]!;
}

export function uniqueOrNone<T>(rows: readonly T[], label: string): T | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new PersistenceIntegrityError(`${label} matched more than one row.`);
  return rows[0]!;
}
