import { isStrictIsoDate, isStrictIsoInstant } from "../../erp/date-validation";

export class MapperError extends Error {
  constructor(entity: string, field?: string) {
    super(`Invalid ${entity} row${field ? `: ${field}.` : "."}`);
    this.name = "MapperError";
  }
}

export function record(value: unknown, entity: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MapperError(entity);
  return value as Record<string, unknown>;
}

export function text(row: Record<string, unknown>, key: string, entity: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new MapperError(entity, `${key} must be text`);
  return value;
}

export function nullableText(row: Record<string, unknown>, key: string, entity: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new MapperError(entity, `${key} must be text or null`);
  return value;
}

export function strictText(row: Record<string, unknown>, key: string, entity: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) throw new MapperError(entity, `${key} must be trimmed text`);
  return value;
}

export function nullableStrictText(row: Record<string, unknown>, key: string, entity: string): string | null {
  if (row[key] === null) return null;
  return strictText(row, key, entity);
}

export function bool(row: Record<string, unknown>, key: string, entity: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") throw new MapperError(entity, `${key} must be boolean`);
  return value;
}

export function numeric(row: Record<string, unknown>, key: string, entity: string): number {
  const value = row[key];
  if ((typeof value !== "number" && typeof value !== "string") || value === "") throw new MapperError(entity, `${key} must be numeric`);
  const converted = Number(value);
  if (!Number.isFinite(converted)) throw new MapperError(entity, `${key} must be numeric`);
  return converted;
}

function strictNumericValue(value: unknown, key: string, entity: string, scale: number): number {
  if (typeof value !== "number" && typeof value !== "string") throw new MapperError(entity, `${key} must be numeric`);
  const serialized = typeof value === "number" ? String(value) : value;
  const pattern = new RegExp(`^-?(?:0|[1-9]\\d*)(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(serialized)) throw new MapperError(entity, `${key} must be a strict numeric with at most ${scale} decimal places`);

  const unsigned = serialized.startsWith("-") ? serialized.slice(1) : serialized;
  const [whole, fraction = ""] = unsigned.split(".");
  const unscaled = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  if (unscaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new MapperError(entity, `${key} exceeds safe precision`);

  const converted = Number(serialized);
  if (!Number.isFinite(converted)) throw new MapperError(entity, `${key} must be numeric`);
  return converted;
}

export function positiveNumeric(row: Record<string, unknown>, key: string, entity: string, scale: number): number {
  const value = strictNumericValue(row[key], key, entity, scale);
  if (value <= 0) throw new MapperError(entity, `${key} must be positive`);
  return value;
}

export function nonNegativeNumeric(row: Record<string, unknown>, key: string, entity: string, scale: number): number {
  const value = strictNumericValue(row[key], key, entity, scale);
  if (value < 0) throw new MapperError(entity, `${key} must be non-negative`);
  return value;
}

function strictIntegerValue(value: unknown, key: string, entity: string): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new MapperError(entity, `${key} must be a safe integer`);
    return value;
  }
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.0+)?$/.test(value)) throw new MapperError(entity, `${key} must be an integer`);
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new MapperError(entity, `${key} must be a safe integer`);
  return converted;
}

export function integer(row: Record<string, unknown>, key: string, entity: string): number {
  return strictIntegerValue(row[key], key, entity);
}

export function positiveInteger(row: Record<string, unknown>, key: string, entity: string): number {
  const value = integer(row, key, entity);
  if (value <= 0) throw new MapperError(entity, `${key} must be positive`);
  return value;
}

export function nonNegativeInteger(row: Record<string, unknown>, key: string, entity: string): number {
  const value = integer(row, key, entity);
  if (value < 0) throw new MapperError(entity, `${key} must be non-negative`);
  return value;
}

export function nonZeroInteger(row: Record<string, unknown>, key: string, entity: string): number {
  const value = integer(row, key, entity);
  if (value === 0) throw new MapperError(entity, `${key} must be non-zero`);
  return value;
}

export function strictInstant(row: Record<string, unknown>, key: string, entity: string): string {
  const value = row[key];
  if (!isStrictIsoInstant(value)) throw new MapperError(entity, `${key} must be a strict ISO instant`);
  return value;
}

export function nullableStrictInstant(row: Record<string, unknown>, key: string, entity: string): string | null {
  if (row[key] === null) return null;
  return strictInstant(row, key, entity);
}

export function strictDate(row: Record<string, unknown>, key: string, entity: string): string {
  const value = row[key];
  if (!isStrictIsoDate(value)) throw new MapperError(entity, `${key} must be a strict ISO date`);
  return value;
}

export function nullableStrictDate(row: Record<string, unknown>, key: string, entity: string): string | null {
  if (row[key] === null) return null;
  return strictDate(row, key, entity);
}

export function expectedTenant(row: Record<string, unknown>, expectedTenantId: string, entity: string): string {
  const expected = strictText({ tenant_id: expectedTenantId }, "tenant_id", entity);
  const actual = strictText(row, "tenant_id", entity);
  if (actual !== expected) throw new MapperError(entity, "tenant_id does not match the requested tenant");
  return actual;
}

export function enumText<const T extends readonly string[]>(row: Record<string, unknown>, key: string, allowed: T, entity: string): T[number] {
  const value = strictText(row, key, entity);
  if (!allowed.includes(value)) throw new MapperError(entity, `${key} is unsupported`);
  return value as T[number];
}

export function arrayValue(row: Record<string, unknown>, key: string, entity: string): unknown[] {
  const value = row[key];
  if (!Array.isArray(value)) throw new MapperError(entity, `${key} must be an array`);
  return value;
}

export function optionalArray(row: Record<string, unknown>, key: string, entity: string): unknown[] | undefined {
  const value = row[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new MapperError(entity, `${key} must be an array`);
  return value;
}
