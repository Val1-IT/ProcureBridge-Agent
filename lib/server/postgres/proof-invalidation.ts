import type { PoolClient } from "pg";
import type { SelfReservationIdentity } from "../../dealtwin/domain/commitment";
import { canonicalStringify } from "../../dealtwin/domain/canonical-json";
import type { DependencyChange } from "../../dealtwin/erp/dependency-manifest";
import { ExpectedRevisionConflict, PersistenceIntegrityError } from "./errors";
import {
  asIsoInstant,
  nextRevision,
  parseNonNegativeSafeInteger,
  requireCanonicalText,
  requireOneRow,
} from "./pg-codec";

export async function lockTenantWorkspace(tx: PoolClient, tenantId: string): Promise<number> {
  const canonicalTenant = requireCanonicalText(tenantId, "tenantId");
  const result = await tx.query<{ revision: string }>(
    "select revision::text as revision from public.erp_workspaces where tenant_id = $1 for update",
    [canonicalTenant],
  );
  const row = requireOneRow(result.rows, "erp_workspaces");
  return parseNonNegativeSafeInteger(row.revision, "erp_workspaces.revision");
}

export async function bumpWorkspaceRevision(
  tx: PoolClient,
  tenantId: string,
  expectedRevision: number,
  updatedAt: string,
): Promise<number> {
  const next = nextRevision(expectedRevision);
  const result = await tx.query<{ revision: string }>(
    `update public.erp_workspaces
     set revision = $2::bigint, updated_at = $3
     where tenant_id = $1 and revision = $4::bigint
     returning revision::text as revision`,
    [requireCanonicalText(tenantId, "tenantId"), String(next), updatedAt, String(expectedRevision)],
  );
  if (result.rows.length === 0) throw new ExpectedRevisionConflict(expectedRevision);
  return parseNonNegativeSafeInteger(requireOneRow(result.rows, "erp_workspaces bump").revision, "bumped revision");
}

function exactSelf(
  proofId: string,
  dealVersionId: string,
  canonicalEventHash: string | null,
  self: SelfReservationIdentity | null,
): boolean {
  return Boolean(
    self
    && self.proofId === proofId
    && self.dealVersionId === dealVersionId
    && canonicalEventHash !== null
    && self.canonicalEventHash === canonicalEventHash,
  );
}

export async function invalidateAffectedProofs(
  tx: PoolClient,
  change: DependencyChange,
  self: SelfReservationIdentity | null,
  proofIds?: readonly string[],
): Promise<readonly string[]> {
  const tenantId = requireCanonicalText(change.tenantId, "change.tenantId");
  const materialKeys = [...new Set(
    change.changes
      .filter((entry) => entry.beforeHash !== entry.afterHash)
      .map((entry) => entry.key),
  )];
  if (materialKeys.length === 0) return [];

  const capacity = new Set<string>(self ? [...change.selfCapacityKeys] : []);
  const proofs = await tx.query<{
    id: string;
    deal_version_id: string;
    dependency_keys: string[] | null;
    canonical_event_hash: string | null;
  }>(
    `select id, deal_version_id, dependency_keys, proof_json->>'canonicalEventHash' as canonical_event_hash
     from public.dealtwin_proofs
     where tenant_id = $1
       and status in ('VALID', 'CONDITIONALLY_VALID')
       and dependency_keys && $2::text[]
       and ($3::text[] is null or id = any($3::text[]))
     order by id`,
    [tenantId, materialKeys, proofIds ? proofIds.map(id => requireCanonicalText(id, 'affected proof ID')) : null],
  );

  const staled: string[] = [];
  const staleAt = asIsoInstant(new Date(), "invalidation timestamp");
  for (const proof of proofs.rows) {
    const keys = Array.isArray(proof.dependency_keys) ? proof.dependency_keys : [];
    const intersecting = keys.filter((key) => (materialKeys as readonly string[]).includes(key));
    const owner = exactSelf(proof.id, proof.deal_version_id, proof.canonical_event_hash, self);
    const remaining = owner ? intersecting.filter((key) => !capacity.has(key)) : intersecting;
    if (remaining.length === 0) continue;

    const updated = await tx.query(
      `update public.dealtwin_proofs
       set status = 'STALE',
           stale_reason = $3,
           updated_at = $4
       where tenant_id = $1 and id = $2 and status in ('VALID', 'CONDITIONALLY_VALID')
       returning id`,
      [tenantId, proof.id, `dependency_change:${remaining.slice().sort().join(",")}`, staleAt],
    );
    if (updated.rows.length !== 1) {
      throw new PersistenceIntegrityError("Proof invalidation updated an unexpected row count.");
    }
    await tx.query(
      `insert into public.erp_audit_events (
         tenant_id, id, entity_type, entity_id, action, actor_role, actor_id, detail, created_at, updated_at
       ) values (
         $1, $2, 'dealtwin_proof', $3, 'dealtwin.proof.stale', 'system', 'system:invalidation', $4::jsonb, $5, $5
       )`,
      [
        tenantId,
        `stale:${proof.id}:${change.currentRevision}:${remaining.slice().sort().join(",")}`,
        proof.id,
        JSON.stringify({
          schemaVersion: "dealtwin.audit.v1",
          tenantId,
          actorId: "system:invalidation",
          actorRole: "system",
          proofId: proof.id,
          dealVersionId: proof.deal_version_id,
          canonicalEventHash: proof.canonical_event_hash,
          priorRevision: change.priorRevision,
          currentRevision: change.currentRevision,
          dependencyChangesJson: canonicalStringify(change.changes.filter((entry) => remaining.includes(entry.key))),
          // ERP audit detail is scalar-only; retain the full ordered keys as canonical JSON text.
          changedKeysJson: canonicalStringify(remaining.slice().sort()),
        }),
        staleAt,
      ],
    );
    staled.push(proof.id);
  }
  return staled;
}
