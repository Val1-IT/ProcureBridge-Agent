import type { Pool, PoolClient } from "pg";
import type { ErpAuditEvent, ErpState } from "../../erp/types";
import type { ErpRepository } from "../../repository/erp-repository";
import { ExpectedRevisionConflict, PersistenceIntegrityError } from "./errors";
import { loadMappedWorkspace, saveMappedWorkspace } from "./erp-workspace-mapper";
import { nextRevision, requireCanonicalText } from "./pg-codec";
import { lockTenantWorkspace } from "./proof-invalidation";
import { withTransaction } from "./transaction";
import { currentProofContexts, publishErpDependencyChanges } from "./erp-proof-invalidation";

export { ExpectedRevisionConflict } from "./errors";

export async function loadErpWorkspace(tx: PoolClient, tenantId: string): Promise<ErpState> {
  return loadMappedWorkspace(tx, tenantId);
}

export async function saveErpWorkspace(
  tx: PoolClient,
  tenantId: string,
  expectedRevision: number,
  state: ErpState,
): Promise<{ revision: number }> {
  const canonicalTenant = requireCanonicalText(tenantId, "tenantId");
  if (state.revision !== nextRevision(expectedRevision)) {
    throw new PersistenceIntegrityError("saveAtomic requires state.revision === expectedRevision + 1.");
  }
  const locked = await lockTenantWorkspace(tx, canonicalTenant);
  if (locked !== expectedRevision) {
    throw new ExpectedRevisionConflict(locked);
  }
  const proofContexts = await currentProofContexts(tx, canonicalTenant);
  const before = proofContexts.length > 0 ? await loadMappedWorkspace(tx, canonicalTenant) : null;
  await saveMappedWorkspace(tx, canonicalTenant, state);
  const updatedAt = state.products[0]?.updatedAt ?? new Date().toISOString();
  const updated = await tx.query<{ revision: string }>(
    `update public.erp_workspaces
     set revision = $2::bigint, active_role = $3, updated_at = $4
     where tenant_id = $1 and revision = $5::bigint
     returning revision::text as revision`,
    [canonicalTenant, String(state.revision), state.activeRole, updatedAt, String(expectedRevision)],
  );
  if (updated.rows.length !== 1) throw new ExpectedRevisionConflict(locked);
  if (before) {
    // Compare persisted state, not an optimistic payload; item-pruning remains a known mapper boundary.
    const after = await loadMappedWorkspace(tx, canonicalTenant);
    await publishErpDependencyChanges(tx, canonicalTenant, before, after, proofContexts);
  }
  return { revision: state.revision };
}

export async function appendErpAuditEvents(tx: PoolClient, tenantId: string, events: ErpAuditEvent[]): Promise<void> {
  const canonicalTenant = requireCanonicalText(tenantId, "tenantId");
  for (const event of events) {
    await tx.query(
      `insert into public.erp_audit_events (
         tenant_id, id, entity_type, entity_id, action, actor_role, actor_id, detail, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
      [
        canonicalTenant, event.id, event.entityType, event.entityId, event.action, event.actorRole, event.actorId,
        JSON.stringify(event.detail), event.createdAt, event.updatedAt,
      ],
    );
  }
}

export class PostgresErpRepository implements ErpRepository {
  constructor(private readonly pool: Pool) {}

  async loadWorkspace(tenantId: string): Promise<ErpState> {
    return withTransaction(this.pool, tenantId, (tx) => loadErpWorkspace(tx, tenantId));
  }

  async saveAtomic(tenantId: string, expectedRevision: number, state: ErpState): Promise<{ revision: number }> {
    return withTransaction(this.pool, tenantId, (tx) => saveErpWorkspace(tx, tenantId, expectedRevision, state));
  }

  async appendAuditEvents(tenantId: string, events: ErpAuditEvent[]): Promise<void> {
    await withTransaction(this.pool, tenantId, (tx) => appendErpAuditEvents(tx, tenantId, events));
  }
}
