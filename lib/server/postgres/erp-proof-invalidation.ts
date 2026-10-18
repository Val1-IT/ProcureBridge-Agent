import type { PoolClient } from 'pg';
import type { ErpState } from '../../erp/types';
import { ProofInvalidationService } from '../../dealtwin/application/proof-invalidation-service';
import { buildSnapshot } from '../../dealtwin/erp/build-snapshot';
import { dependencyKey } from '../../dealtwin/erp/dependency-manifest';
import { isoDate } from '../../dealtwin/domain/date';
import { sha256Canonical, type CanonicalJsonValue } from '../../dealtwin/domain/canonical-json';
import { bindTransactionRepositories } from './postgres-dealtwin-repository';
import { invalidateAffectedProofs } from './proof-invalidation';

export interface ProofSnapshotContext { id: string; as_of_date: string; horizon_end: string; adapter_version: string }

export async function currentProofContexts(tx: PoolClient, tenantId: string): Promise<ProofSnapshotContext[]> {
  return (await tx.query<ProofSnapshotContext>(`select p.id, s.as_of_date::text, s.requested_horizon_end::text as horizon_end, s.adapter_version
    from public.dealtwin_proofs p
    join public.dealtwin_compile_runs r on r.tenant_id=p.tenant_id and r.id=p.compile_run_id
    join public.dealtwin_erp_snapshots s on s.tenant_id=r.tenant_id and s.id=r.snapshot_id
    where p.tenant_id=$1 and p.status in ('VALID','CONDITIONALLY_VALID') order by p.id`, [tenantId])).rows;
}

// createdAt can anchor a PO due date; it is not presentation metadata.
const presentation = new Set(['updatedAt', 'name', 'code', 'sku', 'unit', 'phone', 'email', 'address', 'contactName', 'reason', 'actorId', 'actorRole', 'doNotContact', 'reorderPoint']);
function rawMaterial(value: unknown): CanonicalJsonValue {
  // This is a staleness fingerprint only: unsupported legacy decimals are never rounded into compiler money.
  if (typeof value === 'number') return String(value);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(rawMaterial);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !presentation.has(key) && !key.endsWith('Number')).map(([key, item]) => [key, rawMaterial(item)]));
  throw new Error('Invalid legacy financial fingerprint');
}
function rawManifest(state: ErpState): Map<string, string> {
  const entries = new Map<string, string>();
  const sorted = <T extends { id: string }>(rows: readonly T[]) => [...rows].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const add = (key: string, value: unknown) => entries.set(key, sha256Canonical({ schemaVersion: 'dealtwin.invalidatable-legacy.v1', material: rawMaterial(value) }));
  add('query:cash', [sorted(state.cashAccounts), sorted(state.cashMovements)]);
  add('query:open-ap', [sorted(state.purchaseOrders), sorted(state.goodsReceipts), sorted(state.supplierInvoices), sorted(state.payments.filter(row => row.direction==='payable'))]);
  add('query:open-ar', [sorted(state.salesOrders), sorted(state.deliveryOrders), sorted(state.customerInvoices), sorted(state.payments.filter(row => row.direction==='receivable'))]);
  add('query:stock', [sorted(state.stockMovements), sorted(state.salesOrders), sorted(state.warehouses).map(row => ({ id: row.id, active: row.active }))]);
  for (const [prefix, rows] of [
    ['cash_account', state.cashAccounts], ['cash_movement', state.cashMovements], ['purchase_order', state.purchaseOrders],
    ['goods_receipt', state.goodsReceipts], ['sales_order', state.salesOrders], ['delivery', state.deliveryOrders],
    ['invoice', [...state.supplierInvoices,...state.customerInvoices]], ['payment', state.payments],
  ] as const) for (const row of rows) add(`erp.${prefix}:${row.id}`, row);
  for (const row of state.suppliers) add(`erp.supplier:${row.id}`, { supplierId: row.id, paymentTermDays: row.paymentTermDays });
  for (const row of state.customers) add(`erp.customer:${row.id}`, { customerId: row.id, creditLimit: row.creditLimit });
  return entries;
}

export async function publishErpDependencyChanges(tx: PoolClient, tenantId: string, before: ErpState, after: ErpState, contexts: readonly ProofSnapshotContext[]): Promise<void> {
  const cache = new Map<string, { before: Map<string,string>; after: Map<string,string> }>();
  const repositories = bindTransactionRepositories(tx, tenantId);
  for (const context of contexts) {
    const key = JSON.stringify([context.as_of_date, context.horizon_end, context.adapter_version]);
    let manifests = cache.get(key);
    if (!manifests) {
      const input = { tenantId, asOfDate: isoDate(context.as_of_date), requestedHorizonEnd: isoDate(context.horizon_end), adapterVersion: context.adapter_version, commitments: [], self: null };
      const oldSnapshot = buildSnapshot({ ...input, state: before }); const newSnapshot = buildSnapshot({ ...input, state: after });
      // Valid ERP mutations may make the exact adapter unavailable (e.g. legacy fractional credit).
      // Publish material raw changes instead of rejecting a legitimate save or leaving a current proof.
      manifests = oldSnapshot.ok && newSnapshot.ok
        ? { before: new Map(oldSnapshot.value.dependencyManifest.entries.map(row => [row.key,row.contentHash])), after: new Map(newSnapshot.value.dependencyManifest.entries.map(row => [row.key,row.contentHash])) }
        : { before: rawManifest(before), after: rawManifest(after) };
      cache.set(key, manifests);
    }
    const changes = [...new Set([...manifests.before.keys(), ...manifests.after.keys()])].sort()
      .filter(item => manifests.before.get(item) !== manifests.after.get(item))
      .map(item => ({ key: dependencyKey(item), beforeHash: manifests!.before.get(item) ?? null, afterHash: manifests!.after.get(item) ?? null }));
    await new ProofInvalidationService().afterErpMutation({ ...repositories,
      invalidate: (change,self) => invalidateAffectedProofs(tx,change,self,[context.id]),
    }, { tenantId, priorRevision: before.revision, currentRevision: after.revision, changes, self: null, selfCapacityKeys: [] });
  }
}
