import type { ErpAuditEvent, ErpState } from "../erp/types";

/**
 * Optional server-side persistence boundary for a future production adapter.
 * The demo store does not implement or select this interface.
 */
export interface ErpRepository {
  loadWorkspace(tenantId: string): Promise<ErpState>;
  saveAtomic(tenantId: string, expectedRevision: number, state: ErpState): Promise<{ revision: number }>;
  appendAuditEvents(tenantId: string, events: ErpAuditEvent[]): Promise<void>;
}
