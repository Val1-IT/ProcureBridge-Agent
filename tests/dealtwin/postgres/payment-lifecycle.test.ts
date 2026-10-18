import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordPayment, cancelPayment } from "../../../lib/erp/commands/finance";
import { selectPayableBalance, selectReceivableBalance } from "../../../lib/erp/selectors-finance";
import { selectCurrentCashBalance } from "../../../lib/erp/selectors-cash";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { createPostgresJudgeRuntime } from "../../../lib/server/dealtwin/runtime";
import { ExpectedRevisionConflict, PostgresErpRepository } from "../../../lib/server/postgres/postgres-erp-repository";
import { withTransaction } from "../../../lib/server/postgres/transaction";
import { JUDGE_TENANT_ID, PostgresHarness } from "./harness";

let harness: PostgresHarness;
const postedAt = "2026-09-13T12:00:00.000Z";
const cancelledAt = "2026-09-14T12:00:00.000Z";
const cases = [
  { direction: "payable" as const, invoiceId: "judge-existing-ap", amount: 6_000_000,
    outstanding: 12_000_000, restored: 18_000_000, cash: 24_000_000n, movement: "outflow", reversal: "inflow", originalOrder: 100, reversalOrder: 400 },
  { direction: "receivable" as const, invoiceId: "judge-existing-ar", amount: 7_000_000,
    outstanding: 13_000_000, restored: 20_000_000, cash: 37_000_000n, movement: "inflow", reversal: "outflow", originalOrder: 400, reversalOrder: 100 },
];

describe("PostgreSQL real ERP payment lifecycle", () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); }, 60_000);
  beforeEach(async () => { await harness.resetAndMigrate(); }, 60_000);
  afterAll(async () => { await harness?.close(); });

  it.each(cases)("persists partial $direction payment and its cancellation without rewriting cash or double-incrementing revision", async (testCase) => {
    await createPostgresJudgeRuntime(harness.appPool, harness.resetPool).resetJudgeTenant({
      tenantId: JUDGE_TENANT_ID, actorId: "judge-user", role: "admin", expectedRevision: 0,
      idempotencyKey: "payment-lifecycle-seed", now: postedAt,
    });
    const repository = new PostgresErpRepository(harness.appPool);
    const seed = await repository.loadWorkspace(JUDGE_TENANT_ID);
    expect(seed.revision).toBe(1);
    const posted = recordPayment(seed, "finance", testCase, postedAt);
    expect(posted.ok, posted.ok ? undefined : posted.error.message).toBe(true);
    if (!posted.ok) throw new Error(posted.error.message);
    expect(posted.state.revision).toBe(2);
    expect(await repository.saveAtomic(JUDGE_TENANT_ID, 1, posted.state)).toEqual({ revision: 2 });
    const paid = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(paid).toEqual(posted.state);
    const invoices = testCase.direction === "payable" ? paid.supplierInvoices : paid.customerInvoices;
    const outstanding = testCase.direction === "payable" ? selectPayableBalance : selectReceivableBalance;
    expect(invoices.find((invoice) => invoice.id === testCase.invoiceId)?.status).toBe("partially_paid");
    expect(outstanding(paid, testCase.invoiceId)).toBe(testCase.outstanding);
    expect(paid.payments).toHaveLength(1);
    expect(paid.payments[0]).toMatchObject({ id: posted.value.id, status: "posted", amount: testCase.amount, paymentDate: "2026-09-13" });
    expect(paid.cashMovements).toHaveLength(1);
    const original = paid.cashMovements[0];
    expect(original).toMatchObject({ accountId: "judge-cash", entryKind: "original", reversesMovementId: null,
      sourceType: "erp_payment", sourceId: posted.value.id, sourceRevision: "2", amountRupiah: String(testCase.amount),
      direction: testCase.movement, effectiveDate: "2026-09-13", sameDayOrder: testCase.originalOrder });
    expect(selectCurrentCashBalance(paid, "judge-cash", isoDate("2026-09-13"))).toEqual({ ok: true, value: testCase.cash });
    const rawOriginal = await withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) =>
      (await tx.query("select * from public.erp_cash_movements where tenant_id=$1 and id=$2", [JUDGE_TENANT_ID, original.id])).rows[0]);

    const cancelled = cancelPayment(paid, "finance", posted.value.id, cancelledAt);
    expect(cancelled.ok, cancelled.ok ? undefined : cancelled.error.message).toBe(true);
    if (!cancelled.ok) throw new Error(cancelled.error.message);
    expect(cancelled.state.revision).toBe(3);
    expect(await repository.saveAtomic(JUDGE_TENANT_ID, 2, cancelled.state)).toEqual({ revision: 3 });
    const restored = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(restored).toEqual(cancelled.state);
    expect(outstanding(restored, testCase.invoiceId)).toBe(testCase.restored);
    const restoredInvoices = testCase.direction === "payable" ? restored.supplierInvoices : restored.customerInvoices;
    expect(restoredInvoices.find((invoice) => invoice.id === testCase.invoiceId)?.status).toBe("unpaid");
    expect(restored.payments).toHaveLength(1);
    expect(restored.payments[0]).toEqual({ ...posted.value, status: "cancelled", updatedAt: cancelledAt });
    expect(restored.cashMovements).toHaveLength(2);
    expect(restored.cashMovements.find((row) => row.id === original.id)).toEqual(original);
    const reversals = restored.cashMovements.filter((row) => row.reversesMovementId === original.id);
    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({ entryKind: "reversal", accountId: "judge-cash", direction: testCase.reversal,
      amountRupiah: String(testCase.amount), sourceType: "cash_movement_reversal", sourceId: original.id,
      sourceRevision: "3", effectiveDate: "2026-09-14", sameDayOrder: testCase.reversalOrder });
    expect(selectCurrentCashBalance(restored, "judge-cash", isoDate("2026-09-14"))).toEqual({ ok: true, value: 30_000_000n });
    await withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) => {
      expect((await tx.query("select * from public.erp_cash_movements where tenant_id=$1 and id=$2", [JUDGE_TENANT_ID, original.id])).rows[0]).toEqual(rawOriginal);
      expect((await tx.query("select revision::text revision from public.erp_workspaces where tenant_id=$1", [JUDGE_TENANT_ID])).rows[0]?.revision).toBe("3");
    });
    expect(restored.auditLogs.filter((event) => event.action === "payment.recorded")).toHaveLength(1);
    expect(restored.auditLogs.filter((event) => event.action === "payment.cancelled")).toHaveLength(1);
    const repeated = cancelPayment(restored, "finance", posted.value.id, cancelledAt);
    expect(repeated.ok).toBe(false);
    expect(repeated.state.revision).toBe(3);
    await expect(repository.saveAtomic(JUDGE_TENANT_ID, 2, cancelled.state)).rejects.toBeInstanceOf(ExpectedRevisionConflict);
    expect(await repository.loadWorkspace(JUDGE_TENANT_ID)).toEqual(restored);
  });
});
