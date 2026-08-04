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

export function enumText<const T extends readonly string[]>(row: Record<string, unknown>, key: string, allowed: T, entity: string): T[number] {
  const value = text(row, key, entity);
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
