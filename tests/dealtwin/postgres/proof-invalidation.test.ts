import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ErpState } from '../../../lib/erp/types';
import type { ErpCommandResult } from '../../../lib/erp/errors';
import { recordPayment, cancelPayment } from '../../../lib/erp/commands/finance';
import { postCashMovement, reverseCashMovement } from '../../../lib/erp/commands/cash';
import { proposeStockAdjustment, approveStockAdjustment } from '../../../lib/erp/commands/inventory';
import { createSalesOrder, confirmSalesOrder } from '../../../lib/erp/commands/sales';
import { upsertProduct, upsertCustomer } from '../../../lib/erp/commands/master-data';
import { isValidServerErpState } from '../../../lib/demo/persistence';
import { PostgresErpRepository } from '../../../lib/server/postgres/postgres-erp-repository';
import { PostgresDealTwinRepository } from '../../../lib/server/postgres/postgres-dealtwin-repository';
import { withTransaction } from '../../../lib/server/postgres/transaction';
import { invalidateAffectedProofs } from '../../../lib/server/postgres/proof-invalidation';
import { dependencyKey } from '../../../lib/dealtwin/erp/dependency-manifest';
import { replayProof } from '../../../lib/dealtwin/proof/replay-proof';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
import { PostgresHarness, JUDGE_TENANT_ID } from './harness';
import { seed, proofFixture, evidence } from './commitment-fixture';

let harness: PostgresHarness;
const now = '2026-09-13T12:00:00.000Z'; const nextDay = '2026-09-14T12:00:00.000Z';
async function load() { return new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID); }
async function persist<T>(command: (state: ErpState) => ErpCommandResult<T>): Promise<T> {
  const state = await load(); const result = command(state); if (!result.ok) throw new Error(result.error.message);
  await new PostgresErpRepository(harness.appPool).saveAtomic(JUDGE_TENANT_ID, state.revision, result.state); return result.value;
}
async function proofRow(id: string) {
  return withTransaction(harness.appPool, JUDGE_TENANT_ID, async tx => (await tx.query('select status,proof_json,stale_reason from public.dealtwin_proofs where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,id])).rows[0]!);
}
function newObligation(before: ErpState): ErpState {
  const state = structuredClone(before); const po = { ...state.purchaseOrders[0]!, id: 't19-new-po', orderNumber: 'T19-PO-NEW' };
  const receipt = { ...state.goodsReceipts[0]!, id: 't19-new-gr', receiptNumber: 'T19-GR-NEW', purchaseOrderId: po.id };
  const invoice = { ...state.supplierInvoices[0]!, id: 't19-new-ap', invoiceNumber: 'T19-AP-NEW', purchaseOrderId: po.id, sourceDocumentIds: [receipt.id] };
  const movement = { ...state.stockMovements.find(row => row.sourceType === 'goods_receipt')!, id: 't19-new-receipt-movement', sourceId: receipt.id };
  state.purchaseOrders.push(po); state.goodsReceipts.push(receipt); state.supplierInvoices.push(invoice); state.stockMovements.push(movement); state.revision++;
  return state;
}
describe('Task19 every server ERP save publishes atomic financial dependency changes', () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); });
  afterAll(async () => { await harness?.close(); });
  beforeEach(async () => { await harness.resetAndMigrate(); await seed(harness); });
  it('stock adjustment commands round-trip through the real application repository', async () => {
    const adjustment = await persist(state => proposeStockAdjustment(state, 'warehouse', { productId: 'judge-product-b', quantityDelta: 1, reason: 'Synthetic stock fixture' }, now));
    expect((await load()).stockAdjustments).toEqual([adjustment]);
    const approved = await persist(state => approveStockAdjustment(state, 'admin', adjustment.id, nextDay));
    const state = await load(); expect(state.stockAdjustments).toEqual([approved]);
    expect(state.stockMovements.filter(row => row.sourceType === 'adjustment' && row.sourceId === adjustment.id)).toHaveLength(1);
    expect(state.revision).toBe(3); expect(state.cashMovements).toEqual([]);
  });
  it('snapshot-scoped invalidation cannot stale a different proof merely sharing a query key', async () => {
    const a = await proofFixture(harness, 'scoped-a', true); const b = await proofFixture(harness, 'scoped-b', true);
    await withTransaction(harness.appPool, JUDGE_TENANT_ID, async tx => {
      expect(await invalidateAffectedProofs(tx, { tenantId: JUDGE_TENANT_ID, priorRevision: 1, currentRevision: 2,
        changes: [{ key: dependencyKey('query:cash'), beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) }], self: null, selfCapacityKeys: [] }, null, [a.proof.id])).toEqual([a.proof.id]);
    });
    expect((await proofRow(a.proof.id)).status).toBe('STALE'); expect((await proofRow(b.proof.id)).status).toBe('VALID');
  });
  it.each(['new invoice','invoice timing','cancelled invoice','partial payment','cash movement','supplier terms'] as const)('%s stales the current proof inside its save without changing immutable proof/replay', async kind => {
    const a = await proofFixture(harness, 'automatic', true); const before = await load(); let next: ErpState;
    if (kind === 'partial payment') {
      const result = recordPayment(before, 'finance', { invoiceId: 'judge-existing-ap', direction: 'payable', amount: 1000000 }, now);
      if (!result.ok) throw new Error(result.error.message); next = result.state;
    } else if (kind === 'cash movement') {
      const result = postCashMovement(before, 'finance', { accountId: 'judge-cash', effectiveDate: '2026-09-13', sameDayOrder: 100, direction: 'outflow', amountRupiah: '1000000', sourceType: 'task19_synthetic', sourceId: 'cost', sourceRevision: String(before.revision+1), actorId: 'task19-user', reason: 'Synthetic test obligation' }, now);
      if (!result.ok) throw new Error(result.error.message); next = result.state;
    } else {
      next = kind === 'new invoice' ? newObligation(before) : structuredClone(before);
      if (kind === 'invoice timing') next.supplierInvoices[0]!.dueDate = '2026-09-16';
      if (kind === 'cancelled invoice') { next.supplierInvoices[0]!.status = 'cancelled'; next.purchaseOrders[0]!.status = 'fully_received'; }
      if (kind === 'supplier terms') next.suppliers[0]!.paymentTermDays = 1;
      if (kind !== 'new invoice') next.revision++;
    }
    expect(isValidServerErpState(next), 'fixture must satisfy unchanged ERP financial/source validator').toBe(true);
    await new PostgresErpRepository(harness.appPool).saveAtomic(JUDGE_TENANT_ID, before.revision, next);
    const current = await proofRow(a.proof.id); expect(current.status).toBe('STALE'); expect(current.proof_json).toEqual(a.proof);
    const state = await load(); expect(state.revision).toBe(before.revision+1);
    const audits = state.auditLogs.filter(row => row.action === 'dealtwin.proof.stale'); expect(audits).toHaveLength(1);
    expect(audits[0]!.detail).toMatchObject({ proofId: a.proof.id, priorRevision: before.revision, currentRevision: before.revision+1 });
    if (kind === 'new invoice') expect(current.stale_reason).toContain('query:open-ap');
    expect(replayProof(a.proof).ok).toBe(true);
  });
  it.each(['payment cancellation','cash reversal'] as const)('%s keeps original cash evidence and stales on compensating change', async kind => {
    const id = kind === 'payment cancellation'
      ? (await persist(state => recordPayment(state, 'finance', { invoiceId: 'judge-existing-ap', direction: 'payable', amount: 1000000 }, now))).id
      : (await persist(state => postCashMovement(state, 'finance', { accountId: 'judge-cash', effectiveDate: '2026-09-13', sameDayOrder: 400, direction: 'inflow', amountRupiah: '1000000', sourceType: 'task19_synthetic', sourceId: 'credit', sourceRevision: String(state.revision+1), actorId: 'task19-user', reason: 'Synthetic test credit' }, now))).id;
    const a = await proofFixture(harness, 'compensation', true); const before = await load(); const original = before.cashMovements[0]!;
    if (kind === 'payment cancellation') await persist(state => cancelPayment(state, 'finance', id, nextDay));
    else await persist(state => reverseCashMovement(state, 'finance', { originalMovementId: id, effectiveDate: '2026-09-14', sameDayOrder: 100, actorId: 'task19-user', reason: 'Synthetic test reversal' }, nextDay));
    const state = await load(); expect(state.cashMovements.find(row => row.id === original.id)).toEqual(original);
    expect(state.cashMovements.filter(row => row.reversesMovementId === original.id)).toHaveLength(1); expect(state.revision).toBe(before.revision+1);
    expect((await proofRow(a.proof.id)).status).toBe('STALE'); expect((await proofRow(a.proof.id)).proof_json).toEqual(a.proof);
  });
  it('confirmed inventory reservation invalidates stock dependencies without inventing a cash movement', async () => {
    const adjustment = await persist(state => proposeStockAdjustment(state, 'warehouse', { productId: 'judge-product-b', quantityDelta: 1, reason: 'Synthetic stock fixture' }, now));
    await persist(state => approveStockAdjustment(state, 'admin', adjustment.id, now));
    const order = await persist(state => createSalesOrder(state, 'sales', { customerId: 'judge-customer-a', warehouseId: 'judge-warehouse', lines: [{ productId: 'judge-product-b', quantity: 1, unitPrice: 8000000 }] }, now));
    const a = await proofFixture(harness, 'inventory', true); const before = await load();
    await persist(state => confirmSalesOrder(state, 'sales', order.id, now));
    expect((await proofRow(a.proof.id)).status).toBe('STALE'); expect((await proofRow(a.proof.id)).stale_reason).toContain('query:stock');
    const state = await load(); expect(state.revision).toBe(before.revision+1); expect(state.cashMovements).toEqual(before.cashMovements);
  });
  it('an unrelated product label change advances revision but preserves current proof and adds no stale audit', async () => {
    const a = await proofFixture(harness, 'label', true); const before = await load(); const product = before.products[0]!;
    const result = upsertProduct(before, 'admin', { ...product, name: 'Updated synthetic label only' }, now); if (!result.ok) throw new Error(result.error.message);
    await new PostgresErpRepository(harness.appPool).saveAtomic(JUDGE_TENANT_ID, before.revision, result.state);
    expect((await proofRow(a.proof.id)).status).toBe('VALID'); expect((await proofRow(a.proof.id)).proof_json).toEqual(a.proof);
    const state = await load(); expect(state.revision).toBe(before.revision+1); expect(state.auditLogs.filter(row => row.action === 'dealtwin.proof.stale')).toHaveLength(0);
  });
  it('a valid legacy fractional credit limit still saves but cannot leave an exact-money proof current', async () => {
    const a = await proofFixture(harness, 'fractional', true); const before = await load();
    await persist(state => upsertCustomer(state, 'admin', { ...state.customers[0]!, phone: '081234567890', creditLimit: 0.5 }, now));
    const state = await load(); expect(state.customers[0]!.creditLimit).toBe(0.5); expect(state.revision).toBe(before.revision+1);
    expect((await proofRow(a.proof.id)).status).toBe('STALE'); expect((await proofRow(a.proof.id)).proof_json).toEqual(a.proof);
  });
  it('failure after the stale audit rolls back payment, cash, revision, proof status and all audit evidence', async () => {
    await proofFixture(harness, 'rollback', true); const before = await evidence(harness);
    await harness.ownerPool.query("create function public.t19_failure() returns trigger language plpgsql as $$ begin if new.action='dealtwin.proof.stale' then raise exception 'task19 injected failure'; end if; return new; end $$;create trigger t19_failure after insert on public.erp_audit_events for each row execute function public.t19_failure()");
    try { await expect(persist(state => recordPayment(state, 'finance', { invoiceId: 'judge-existing-ap', direction: 'payable', amount: 1000000 }, now))).rejects.toThrow('task19 injected failure'); }
    finally { await harness.ownerPool.query('drop trigger t19_failure on public.erp_audit_events;drop function public.t19_failure()'); }
    expect(await evidence(harness)).toEqual(before);
  });
  it('fresh repository instances retain current STALE separately from the historical proof result', async () => {
    const a = await proofFixture(harness, 'restart', true); await persist(state => recordPayment(state, 'finance', { invoiceId: 'judge-existing-ap', direction: 'payable', amount: 1000000 }, now));
    const original = await withTransaction(harness.appPool, JUDGE_TENANT_ID, tx => new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID).getProof(a.proof.id));
    expect(original).toEqual(a.proof); expect((await proofRow(a.proof.id)).status).toBe('STALE'); expect(replayProof(original!).ok).toBe(true);
  });
  it('an ERP save never invalidates another tenant proof sharing every business ID', async () => {
    const tenant = 'task19-foreign-synthetic';
    await withTransaction(harness.appPool, tenant, async tx => {
      await tx.query('insert into public.erp_tenants(id,name) values($1,$1)', [tenant]);
      await tx.query("insert into public.erp_workspaces(tenant_id,revision,active_role) values($1,0,'admin')", [tenant]);
    });
    await new PostgresErpRepository(harness.appPool).saveAtomic(tenant, 0, { ...createJudgeScenario().erpState, revision: 1 });
    const foreign = await proofFixture(harness, 'foreign-isolation', true, undefined, undefined, [], tenant);
    const local = await proofFixture(harness, 'local-isolation', true);
    const before = await new PostgresErpRepository(harness.appPool).loadWorkspace(tenant);
    await persist(state => recordPayment(state, 'finance', { invoiceId: 'judge-existing-ap', direction: 'payable', amount: 1000000 }, now));
    expect((await proofRow(local.proof.id)).status).toBe('STALE');
    expect(await new PostgresErpRepository(harness.appPool).loadWorkspace(tenant)).toEqual(before);
    const current = await withTransaction(harness.appPool, tenant, async tx => (await tx.query('select status,proof_json from public.dealtwin_proofs where tenant_id=$1 and id=$2', [tenant,foreign.proof.id])).rows[0]);
    expect(current).toEqual({ status: 'VALID', proof_json: foreign.proof });
  });
});
