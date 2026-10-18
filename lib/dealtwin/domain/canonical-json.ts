import { createHash } from "node:crypto";

export type CanonicalJsonValue =
  | null
  | boolean
  | string
  | number
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error("Canonical JSON numbers must be finite safe integers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("Unsupported canonical JSON value.");
  }
  if (ancestors.has(value)) {
    throw new Error("Canonical JSON cannot contain cycles.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serialize(item, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Canonical JSON objects must be plain objects.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("Canonical JSON object keys must be strings.");
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalStringify(value: CanonicalJsonValue): string {
  return serialize(value, new Set<object>());
}

export function sha256Canonical(value: CanonicalJsonValue): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}
