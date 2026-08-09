import type { DemoState } from "../domain/types";
import type { ErpState } from "../erp/types";
import { createErpSeedState } from "../erp/seed";
import { createSeedState } from "./seed";

export const DEMO_SCHEMA_VERSION = 3;
export const DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v3";
export type DemoRecoveryReason = "INVALID_JSON" | "INVALID_SCHEMA" | null;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isArrayField(value: Record<string, unknown>, field: string): boolean { return Array.isArray(value[field]); }

function hasValidLegacyCollections(value: Record<string, unknown>): boolean {
  return ["customers", "invoices", "calls", "approvals", "pendingResults", "paymentCommitments", "disputes", "auditLogs"].every((field) => isArrayField(value, field))
    && isRecord(value.demo);
}

function hasValidErpCollections(value: unknown): value is ErpState {
  if (!isRecord(value) || typeof value.revision !== "number" || typeof value.activeRole !== "string") return false;
  return ["products", "suppliers", "customers", "warehouses", "purchaseRequests", "purchaseOrders", "goodsReceipts", "salesOrders", "deliveryOrders", "supplierInvoices", "customerInvoices", "payments", "stockMovements", "supplierCalls", "supplierApprovals", "supplierResults", "disputes", "followUps", "auditLogs"].every((field) => isArrayField(value, field));
}

export function migrateDemoState(value: unknown): DemoState | null {
  if (!isRecord(value) || !hasValidLegacyCollections(value)) return null;
  if (value.schemaVersion === 2) return { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, erp: createErpSeedState() };
  if (value.schemaVersion === DEMO_SCHEMA_VERSION && hasValidErpCollections(value.erp)) return value as unknown as DemoState;
  return null;
}

export function loadDemoState(value: string | null): { state: DemoState; recoveryReason: DemoRecoveryReason } {
  if (!value) return { state: createSeedState(), recoveryReason: null };
  try {
    const state = migrateDemoState(JSON.parse(value));
    return state ? { state, recoveryReason: null } : { state: createSeedState(), recoveryReason: "INVALID_SCHEMA" };
  } catch {
    return { state: createSeedState(), recoveryReason: "INVALID_JSON" };
  }
}

export function serializeDemoState(state: DemoState): string { return JSON.stringify(state); }
export function deserializeDemoState(value: string | null): DemoState { return loadDemoState(value).state; }
