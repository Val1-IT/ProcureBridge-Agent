import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordPayment, cancelPayment } from "../../../lib/erp/commands/finance";
import { createSalesOrder } from "../../../lib/erp/commands/sales";
import { createJudgeScenario } from "../../../lib/dealtwin/judge/scenario";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { canonicalStringify, sha256Canonical } from "../../../lib/dealtwin/domain/canonical-json";
import { canonicalCashEventDto, hashCanonicalCashEvents } from "../../../lib/dealtwin/domain/canonical-event";
import { buildSnapshot } from "../../../lib/dealtwin/erp/build-snapshot";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { buildDealProof } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof } from "../../../lib/dealtwin/proof/proof-dto";
import { createPostgresJudgeRuntime } from "../../../lib/server/dealtwin/runtime";
import { PostgresErpRepository, saveErpWorkspace } from "../../../lib/server/postgres/postgres-erp-repository";
import { PostgresDealTwinRepository } from "../../../lib/server/postgres/postgres-dealtwin-repository";
import { appendOperationReceipt, findSuccessReceipt, readOperationReceipt } from "../../../lib/server/postgres/idempotency-audit-store";
import { withTransaction } from "../../../lib/server/postgres/transaction";
import { JUDGE_TENANT_ID, PostgresHarness } from "./harness";

let harness: PostgresHarness;
const actor = { tenantId: JUDGE_TENANT_ID, actorId: "judge-user", role: "admin" as const };
const now = "2026-09-18T12:00:00.000Z";
const context = (revision: number, key: string) => ({ ...actor, expectedRevision: revision, idempotencyKey: key, now });
const historyAction = "dealtwin.commitment.committed";
const historyKey = "financial-history-key";
const historyHash = "a".repeat(64);

// All identifiers are test-owned static tables; raw SQL reads add evidence beyond the public DTO.
const evidenceTables = ["erp_workspaces", "erp_products", "erp_cash_accounts", "erp_cash_movements", "erp_payments",
  "erp_trade_invoices", "erp_trade_invoice_lines", "erp_trade_invoice_sources", "erp_sales_orders", "erp_sales_order_lines",
  "dealtwin_deals", "dealtwin_deal_versions", "dealtwin_erp_snapshots", "dealtwin_compile_runs", "dealtwin_proofs",
  "dealtwin_approvals", "dealtwin_liquidity_commitments", "erp_audit_events"] as const;
async function readEvidence() {
  return withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) => {
    const evidence: Record<string, Record<string, unknown>[]> = {};
    for (const table of evidenceTables) {
      evidence[table] = (await tx.query<{ row: Record<string, unknown> }>(
        `select to_jsonb(t) as row from public.${table} t where tenant_id=$1 order by to_jsonb(t)::text`, [JUDGE_TENANT_ID],
      )).rows.map((result) => result.row);
    }
    return evidence;
  });
}

async function seedFinancialHistory() {
  const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
  const initialReceipt = await runtime.resetJudgeTenant(context(0, "financial-initial"));
  expect(initialReceipt.httpStatus).toBe(200);
  const canonical = await runtime.loadJudgeState(actor);
  const repository = new PostgresErpRepository(harness.appPool);
  const seed = await repository.loadWorkspace(JUDGE_TENANT_ID);
  const payable = recordPayment(seed, "finance", { invoiceId: "judge-existing-ap", direction: "payable", amount: 3_000_000 }, "2026-09-13T12:00:00.000Z");
  if (!payable.ok) throw new Error(payable.error.message);
  expect(await repository.saveAtomic(JUDGE_TENANT_ID, 1, payable.state)).toEqual({ revision: 2 });
  const receivable = recordPayment(await repository.loadWorkspace(JUDGE_TENANT_ID), "finance", {
    invoiceId: "judge-existing-ar", direction: "receivable", amount: 5_000_000,
  }, "2026-09-13T13:00:00.000Z");
  if (!receivable.ok) throw new Error(receivable.error.message);
  expect(await repository.saveAtomic(JUDGE_TENANT_ID, 2, receivable.state)).toEqual({ revision: 3 });
  const cancelled = cancelPayment(await repository.loadWorkspace(JUDGE_TENANT_ID), "finance", payable.value.id, "2026-09-14T12:00:00.000Z");
  if (!cancelled.ok) throw new Error(cancelled.error.message);
  expect(await repository.saveAtomic(JUDGE_TENANT_ID, 3, cancelled.state)).toEqual({ revision: 4 });
  const financial = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
  expect(financial.payments.map((payment) => payment.status).sort()).toEqual(["cancelled", "posted"]);
  expect(financial.cashMovements.filter((movement) => movement.entryKind === "original")).toHaveLength(2);
  expect(financial.cashMovements.filter((movement) => movement.entryKind === "reversal")).toHaveLength(1);

  // Historical fixture only, built through existing commands/repositories. No Reserve/Commit service is introduced.
  const scenario = createJudgeScenario();
  const order = createSalesOrder(financial, "sales", { customerId: "judge-customer-a", warehouseId: "judge-warehouse",
    lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 60_000_000 }] }, now);
  if (!order.ok) throw new Error(order.error.message);
  const version = createDealVersion({ id: "financial-history-version", dealId: "financial-history-deal", version: 1,
    terms: scenario.candidateTermsA, createdBy: actor.actorId, createdAt: now });
  const snapshot = buildSnapshot({ state: order.state, tenantId: JUDGE_TENANT_ID, asOfDate: isoDate("2026-09-12"),
    requestedHorizonEnd: isoDate("2026-10-12"), adapterVersion: "dealtwin-erp-adapter-v1", commitments: [], self: null });
  if (!snapshot.ok) throw new Error(snapshot.error.message);
  const result = compileDeal({ snapshot: snapshot.value, terms: scenario.candidateTermsA, constraints: scenario.constraints,
    policy: scenario.policy, approvedApprovalCodes: ["owner_commercial_exception"] });
  expect(result.outcome).toBe("COMPILES");
  const built = buildDealProof({ proofId: "financial-history-proof", dealId: version.dealId, version, snapshot: snapshot.value,
    constraints: scenario.constraints, policy: scenario.policy, baseResult: result, stressRuns: [], assumptions: [],
    approvals: [{ id: "financial-history-approval", proofId: "financial-history-proof", dealVersionId: version.id,
      kind: "non_arithmetic_authorization", status: "approved" }], approvedApprovalCodes: ["owner_commercial_exception"], generatedAt: now });
  if (!built.ok) throw new Error(built.error.message);
  const proof = encodeProof(built.value);
  const reservedEvents = result.timeline!.events.filter((event) => event.dependencyKey.startsWith("deal:event:"));
  expect(reservedEvents).toHaveLength(3);
  expect(hashCanonicalCashEvents(reservedEvents)).toBe(proof.canonicalEventHash);
  const historicalResponse = { httpStatus: 200, body: { ok: true, commitmentId: "financial-history-commitment",
    salesOrderId: order.value.id, revision: 5 } };
  await withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) => {
    expect(await saveErpWorkspace(tx, JUDGE_TENANT_ID, 4, order.state)).toEqual({ revision: 5 });
    const repo = new PostgresDealTwinRepository(tx, JUDGE_TENANT_ID);
    await repo.insertDeal({ id: version.dealId, title: "Synthetic historical committed fixture", customerId: "judge-customer-a",
      status: "COMMITTED", currentVersionId: "", committedSalesOrderId: order.value.id }, now);
    await repo.insertDealVersion(version);
    await repo.insertSnapshot({ id: "financial-history-snapshot", erpRevision: 5, asOfDate: "2026-09-12", requestedHorizonEnd: "2026-10-12",
      adapterVersion: proof.adapterVersion, dependencyKeys: snapshot.value.dependencyManifest.keys, dependencyManifest: snapshot.value.dependencyManifest,
      canonicalEvents: snapshot.value.cashEvents.map(canonicalCashEventDto), stateHash: proof.snapshotHash, createdAt: now });
    await repo.insertCompileRun({ id: "financial-history-run", dealVersionId: version.id, snapshotId: "financial-history-snapshot", kind: "base",
      engineVersion: proof.engineVersion, inputHash: proof.inputHash, resultHash: proof.resultHash, outcome: "COMPILES",
      cashFloorRupiah: "5000000", shortfallRupiah: null, worstMinimumRupiah: "5000000", firstViolationDate: null, violationData: {}, parentRunId: null, createdAt: now });
    await repo.insertProof(proof, "financial-history-run");
    await repo.insertApproval({ id: "financial-history-approval", proofId: proof.id, dealVersionId: version.id, kind: "non_arithmetic_authorization",
      status: "approved", decidedBy: "judge-approver", decidedAt: now, comment: "Synthetic fixture" }, now);
    await repo.insertCommitment({ id: "financial-history-commitment", proofId: proof.id, dealVersionId: version.id, accountId: "judge-cash",
      canonicalEventHash: proof.canonicalEventHash, canonicalEvents: reservedEvents.map(canonicalCashEventDto), amountRupiah: "42000000", direction: "outflow",
      status: "committed", reserveIdempotencyKey: "financial-history-reserve", commitIdempotencyKey: historyKey, createdAt: now, updatedAt: now });
    expect(await repo.listActiveCommitments()).toHaveLength(1);
    expect((await repo.getDeal(version.dealId))?.committedSalesOrderId).toBe(order.value.id);
    await appendOperationReceipt(tx, { tenantId: JUDGE_TENANT_ID, actorId: actor.actorId, action: historyAction, idempotencyKey: historyKey,
      requestHash: historyHash, responseJson: canonicalStringify(historicalResponse), responseHash: sha256Canonical(historicalResponse),
      priorRevision: 4, currentRevision: 5, createdAt: now });
  });
  expect((await runtime.loadJudgeState(actor)).revision).toBe(5);
  return { runtime, canonical, initialReceipt, historicalResponse, orderId: order.value.id };
}

describe("Judge reset with real financial history and linked active commitment", () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); }, 60_000);
  beforeEach(async () => { await harness.resetAndMigrate(); }, 60_000);
  afterAll(async () => { await harness?.close(); });

  it("restores canonical seed atomically and preserves historical receipts after payments, reversal, commitment and linked Sales Order", async () => {
    const fixture = await seedFinancialHistory();
    const before = await readEvidence();
    const response = await fixture.runtime.resetJudgeTenant(context(5, "financial-reset"));
    expect(response.httpStatus).toBe(200);
    const state = await createPostgresJudgeRuntime(harness.appPool, harness.resetPool).loadJudgeState(actor);
    expect(state.revision).toBe(6);
    expect(state.businessSeedHash).toBe(fixture.canonical.businessSeedHash);
    expect({ ...state, revision: 1, erp: null }).toEqual({ ...fixture.canonical, erp: null });
    const erp = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(erp.payments).toEqual([]); expect(erp.cashMovements).toEqual([]);
    expect(erp.salesOrders.some((order) => order.id === fixture.orderId)).toBe(false);
    const evidence = await readEvidence();
    for (const table of ["dealtwin_liquidity_commitments", "dealtwin_proofs", "dealtwin_approvals", "dealtwin_compile_runs", "dealtwin_erp_snapshots"]) {
      expect(evidence[table], table).toEqual([]);
    }
    const oldAuditIds = new Set(before.erp_audit_events.map((event) => event.id));
    expect(evidence.erp_audit_events.filter((event) => oldAuditIds.has(event.id))).toEqual(before.erp_audit_events);
    expect(evidence.erp_audit_events).toHaveLength(before.erp_audit_events.length + 1);
    await withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) => {
      expect(await readOperationReceipt(tx, JUDGE_TENANT_ID, historyAction, historyKey, historyHash)).toEqual(fixture.historicalResponse);
      expect(await new PostgresDealTwinRepository(tx, JUDGE_TENANT_ID).getDealVersion("financial-history-version")).toBeNull();
    });
    expect(await fixture.runtime.resetJudgeTenant(context(0, "financial-initial"))).toEqual(fixture.initialReceipt);
    expect(await fixture.runtime.resetJudgeTenant(context(5, "financial-reset"))).toEqual(response);
    expect((await fixture.runtime.loadJudgeState(actor)).revision).toBe(6);
    expect(await readEvidence()).toEqual(evidence);
  });

  it.each(["payments-delete", "final-receipt"] as const)("rolls back every financial and linked row when reset fails at $0", async (stage) => {
    const fixture = await seedFinancialHistory();
    const beforeState = await fixture.runtime.loadJudgeState(actor);
    const before = await readEvidence();
    if (stage === "payments-delete") {
      await harness.ownerPool.query(`create function reject_financial_reset() returns trigger language plpgsql as $$ begin
        if old.tenant_id='dealtwin-judge-v1' then raise exception 'injected financial reset failure'; end if; return old; end $$;
        create trigger reject_financial_reset before delete on erp_payments for each row execute function reject_financial_reset()`);
    } else {
      await harness.ownerPool.query(`create function reject_financial_reset() returns trigger language plpgsql as $$ begin
        if new.action='dealtwin.judge.reset' and new.detail->>'idempotencyKey'='financial-failed-reset' then
          raise exception 'injected financial reset failure'; end if; return new; end $$;
        create trigger reject_financial_reset before insert on erp_audit_events for each row execute function reject_financial_reset()`);
    }
    try {
      await expect(fixture.runtime.resetJudgeTenant(context(5, "financial-failed-reset"))).rejects.toThrow("injected financial reset failure");
    } finally {
      const table = stage === "payments-delete" ? "erp_payments" : "erp_audit_events";
      await harness.ownerPool.query(`drop trigger reject_financial_reset on ${table}; drop function reject_financial_reset()`);
    }
    expect(await fixture.runtime.loadJudgeState(actor)).toEqual(beforeState);
    expect(await readEvidence()).toEqual(before);
    await withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) => {
      expect(await readOperationReceipt(tx, JUDGE_TENANT_ID, historyAction, historyKey, historyHash)).toEqual(fixture.historicalResponse);
      expect(await findSuccessReceipt(tx, JUDGE_TENANT_ID, "dealtwin.judge.reset", "financial-failed-reset")).toBeNull();
    });
    expect((await fixture.runtime.resetJudgeTenant(context(5, "financial-failed-reset"))).httpStatus).toBe(200);
    const reset = await fixture.runtime.loadJudgeState(actor);
    expect(reset.revision).toBe(6);
    expect(reset.businessSeedHash).toBe(fixture.canonical.businessSeedHash);
  });
});
