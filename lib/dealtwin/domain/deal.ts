import type { DealTermsV1, DealTermsV1Dto } from "./deal-terms";
import { canonicalizeDealTermsV1 } from "./deal-terms";
import { sha256Canonical, type CanonicalJsonValue } from "./canonical-json";
import type { Result } from "./result";

export type DealStatus = "DRAFT" | "COMPILED" | "PROOF_GENERATED" | "RESERVED" | "COMMITTED" | "STALE";

export interface Deal {
  readonly id: string;
  readonly title: string;
  readonly customerId: string;
  readonly status: DealStatus;
  readonly currentVersionId: string;
  readonly committedSalesOrderId: string | null;
}

export interface DealVersion {
  readonly id: string;
  readonly dealId: string;
  readonly version: number;
  readonly terms: DealTermsV1Dto;
  readonly termsHash: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface DealVersionInput {
  readonly id: string;
  readonly dealId: string;
  readonly version: number;
  readonly terms: DealTermsV1;
  readonly createdBy: string;
  readonly createdAt: string;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireIdentity(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) throw new Error(`${label} must be non-empty.`);
}

export function createDealVersion(input: DealVersionInput): DealVersion {
  requireIdentity(input.id, "Deal version ID");
  requireIdentity(input.dealId, "Deal ID");
  requireIdentity(input.createdBy, "Creator ID");
  requireIdentity(input.createdAt, "Creation timestamp");
  if (!Number.isSafeInteger(input.version) || input.version <= 0) throw new Error("Deal version number must be a positive safe integer.");
  const terms = canonicalizeDealTermsV1(input.terms);
  return deepFreeze({
    id: input.id,
    dealId: input.dealId,
    version: input.version,
    terms,
    termsHash: sha256Canonical(terms as unknown as CanonicalJsonValue),
    createdBy: input.createdBy,
    createdAt: input.createdAt,
  }) as DealVersion;
}

export function createNextDealVersion(previous: DealVersion, input: Omit<DealVersionInput, "dealId" | "version">): Result<DealVersion> {
  if (!Number.isSafeInteger(previous.version) || previous.version >= Number.MAX_SAFE_INTEGER) {
    return { ok: false, error: { code: "DEAL_VERSION_OVERFLOW", message: "Deal version cannot advance safely." } };
  }
  try {
    return { ok: true, value: createDealVersion({ ...input, dealId: previous.dealId, version: previous.version + 1 }) };
  } catch (error) {
    return { ok: false, error: { code: "INVALID_DEAL_VERSION", message: error instanceof Error ? error.message : "Deal version is invalid." } };
  }
}
