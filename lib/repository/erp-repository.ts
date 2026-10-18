import type { ErpAuditEvent, ErpState } from "../erp/types";

/**
 * Optional server-side persistence boundary for a future production adapter.
 * The demo store does not implement or select this interface.
 *
 * `saveAtomic` implementations must validate the complete tenant-scoped state
 * before writing all normalized rows in one transaction. SQL FK/CHECK rules
 * cover row-local shape and tenant provenance only. Whole-state validation
 * remains authoritative for reciprocal RFQ/quotation selection, the selected
 * quotation's full PO request/warehouse/supplier/line provenance, invoice
 * source status/parent/line/lifecycle and payment balances, exact one-to-one
 * receipt/delivery/adjustment movement evidence, non-negative chronological
 * stock and reservation coverage, and reciprocal call/approval/result status.
 *
 * The production PostgreSQL adapter is `lib/server/postgres/postgres-erp-repository.ts`.
 * Browser demo persistence does not select that adapter.
 */
export interface ErpRepository {
  loadWorkspace(tenantId: string): Promise<ErpState>;
  saveAtomic(tenantId: string, expectedRevision: number, state: ErpState): Promise<{ revision: number }>;
  appendAuditEvents(tenantId: string, events: ErpAuditEvent[]): Promise<void>;
}
