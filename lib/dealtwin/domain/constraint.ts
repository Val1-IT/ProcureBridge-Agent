import type { Rupiah } from "./money";
import type { BasisPoints } from "./rate";
import type { Result } from "./result";

export type ConstraintKind =
  | "customer_deposit_max_bps"
  | "customer_deposit_min_bps"
  | "customer_balance_due_days"
  | "supplier_payment_due_days"
  | "protect_existing_supplier_due_dates"
  | "new_borrowing_allowed"
  | "minimum_cash_rupiah"
  | "required_inventory_available"
  | "required_approval";

export type ConstraintProvenance = "user_confirmed" | "erp_policy" | "ai_extracted" | "judge_seed";
export type ConstraintResolution = "confirmed" | "pending_confirmation" | "unresolved";

interface ConstraintBase {
  readonly id: string;
  readonly provenance: ConstraintProvenance;
  readonly resolution: ConstraintResolution;
  readonly sourceText: string | null;
}

export type CommercialConstraint =
  | (ConstraintBase & { readonly kind: "customer_deposit_max_bps"; readonly operator: "lte"; readonly value: BasisPoints })
  | (ConstraintBase & { readonly kind: "customer_deposit_min_bps"; readonly operator: "gte"; readonly value: BasisPoints })
  | (ConstraintBase & { readonly kind: "customer_balance_due_days"; readonly operator: "lte"; readonly value: number })
  | (ConstraintBase & { readonly kind: "supplier_payment_due_days"; readonly operator: "gte"; readonly value: number })
  | (ConstraintBase & { readonly kind: "protect_existing_supplier_due_dates"; readonly operator: "eq"; readonly value: true })
  | (ConstraintBase & { readonly kind: "new_borrowing_allowed"; readonly operator: "eq"; readonly value: false })
  | (ConstraintBase & { readonly kind: "minimum_cash_rupiah"; readonly operator: "gte"; readonly value: Rupiah })
  | (ConstraintBase & {
    readonly kind: "required_inventory_available";
    readonly operator: "gte";
    readonly value: { readonly productId: string; readonly warehouseId: string; readonly quantity: number };
  })
  | (ConstraintBase & { readonly kind: "required_approval"; readonly operator: "eq"; readonly value: { readonly approvalCode: string } });

export interface ConstraintSet {
  readonly constraints: readonly CommercialConstraint[];
}

function invalid(code: "INVALID_CONSTRAINT" | "DUPLICATE_CONSTRAINT" | "CONFLICTING_CONSTRAINTS", message: string): Result<ConstraintSet> {
  return { ok: false, error: { code, message } };
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function safeInteger(value: unknown, positive = false): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && (positive ? value > 0 : value >= 0);
}

function semanticKey(constraint: CommercialConstraint): string {
  if (constraint.kind === "required_inventory_available") {
    return `${constraint.kind}:${constraint.value.productId}:${constraint.value.warehouseId}`;
  }
  if (constraint.kind === "required_approval") return `${constraint.kind}:${constraint.value.approvalCode}`;
  return constraint.kind;
}

function validMetadata(constraint: CommercialConstraint): boolean {
  if (!canonicalText(constraint.id)) return false;
  if (!["user_confirmed", "erp_policy", "ai_extracted", "judge_seed"].includes(constraint.provenance)) return false;
  if (!["confirmed", "pending_confirmation", "unresolved"].includes(constraint.resolution)) return false;
  const needsSourceText = constraint.provenance === "user_confirmed" || constraint.provenance === "ai_extracted";
  if (needsSourceText && !canonicalText(constraint.sourceText)) return false;
  if (!needsSourceText && constraint.sourceText !== null && !canonicalText(constraint.sourceText)) return false;
  if (constraint.provenance === "ai_extracted") return constraint.resolution !== "confirmed";
  return constraint.resolution === "confirmed";
}

function validConstraint(constraint: CommercialConstraint): boolean {
  if (!validMetadata(constraint)) return false;
  switch (constraint.kind) {
    case "customer_deposit_max_bps":
      return constraint.operator === "lte" && safeInteger(constraint.value) && constraint.value <= 10_000;
    case "customer_deposit_min_bps":
      return constraint.operator === "gte" && safeInteger(constraint.value) && constraint.value <= 10_000;
    case "customer_balance_due_days":
      return constraint.operator === "lte" && safeInteger(constraint.value);
    case "supplier_payment_due_days":
      return constraint.operator === "gte" && safeInteger(constraint.value);
    case "protect_existing_supplier_due_dates":
      return constraint.operator === "eq" && constraint.value === true;
    case "new_borrowing_allowed":
      return constraint.operator === "eq" && constraint.value === false;
    case "minimum_cash_rupiah":
      return constraint.operator === "gte" && typeof constraint.value === "bigint" && constraint.value >= 0n;
    case "required_inventory_available":
      return constraint.operator === "gte"
        && canonicalText(constraint.value?.productId)
        && canonicalText(constraint.value?.warehouseId)
        && safeInteger(constraint.value?.quantity, true);
    case "required_approval":
      return constraint.operator === "eq" && canonicalText(constraint.value?.approvalCode);
    default:
      return false;
  }
}

const constraintOrder: Readonly<Record<CommercialConstraint["kind"], number>> = {
  customer_deposit_max_bps: 0,
  customer_deposit_min_bps: 1,
  customer_balance_due_days: 2,
  supplier_payment_due_days: 3,
  protect_existing_supplier_due_dates: 4,
  new_borrowing_allowed: 5,
  minimum_cash_rupiah: 6,
  required_inventory_available: 7,
  required_approval: 8,
};

export function validateConstraints(constraints: readonly CommercialConstraint[]): Result<ConstraintSet> {
  if (constraints.some((constraint) => !constraint || !validConstraint(constraint))) {
    return invalid("INVALID_CONSTRAINT", "Constraint does not match its locked kind contract.");
  }
  const ids = constraints.map((constraint) => constraint.id);
  const semanticKeys = constraints.map(semanticKey);
  if (new Set(ids).size !== ids.length || new Set(semanticKeys).size !== semanticKeys.length) {
    return invalid("DUPLICATE_CONSTRAINT", "Constraint identities and semantic targets must be unique.");
  }
  const minimum = constraints.find((constraint) => constraint.kind === "customer_deposit_min_bps");
  const maximum = constraints.find((constraint) => constraint.kind === "customer_deposit_max_bps");
  if (minimum?.kind === "customer_deposit_min_bps" && maximum?.kind === "customer_deposit_max_bps" && minimum.value > maximum.value) {
    return invalid("CONFLICTING_CONSTRAINTS", "Customer deposit minimum cannot exceed its maximum.");
  }
  const sorted = [...constraints].sort((left, right) => {
    const kindDifference = constraintOrder[left.kind] - constraintOrder[right.kind];
    if (kindDifference !== 0) return kindDifference;
    const leftKey = semanticKey(left);
    const rightKey = semanticKey(right);
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return { ok: true, value: { constraints: sorted } };
}
