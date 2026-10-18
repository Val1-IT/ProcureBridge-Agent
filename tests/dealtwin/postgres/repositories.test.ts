import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideApproval } from "../../../lib/dealtwin/application/approval-service";
import type { MutationContext } from "../../../lib/dealtwin/application/operation-contracts";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { buildDealProof } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { replayProof } from "../../../lib/dealtwin/proof/replay-proof";
import { createErpSeedState } from "../../../lib/erp/seed";
import { createJudgeScenario } from "../../../lib/dealtwin/judge/scenario";
import { ExpectedRevisionConflict, PostgresErpRepository } from "../../../lib/server/postgres/postgres-erp-repository";
import { createPostgresApplicationPorts, PostgresDealTwinRepository } from "../../../lib/server/postgres/postgres-dealtwin-repository";
import { lockTenantWorkspace } from "../../../lib/server/postgres/proof-invalidation";
import { withTransaction } from "../../../lib/server/postgres/transaction";
import { createJudgeFixture } from "../fixtures/judge-scenario";
import { PostgresHarness, requiredTestDatabaseUrl } from "./harness";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";
const NOW = "2026-09-16T09:00:00.000Z";
const HASH = "a".repeat(64);

let harness: PostgresHarness;

function proofDto(): DealProofDto {
  const scenario = createJudgeFixture();
  const version = createDealVersion({
    id: "version-a", dealId: "deal-a", version: 1, terms: scenario.candidateTermsA, createdBy: "actor-a", createdAt: GENERATED_AT,
  });
  const baseResult = compileDeal({
    snapshot: scenario.snapshot, terms: scenario.candidateTermsA, constraints: scenario.constraints, policy: scenario.policy, approvedApprovalCodes: [],
  });
  const result = buildDealProof({
    proofId: "proof-a", dealId: "deal-a", version, snapshot: scenario.snapshot, constraints: scenario.constraints, policy: scenario.policy, baseResult,
    stressRuns: [{
      id: "stress-delay-receipt", transformType: "delay_specified_receipt",
      parameters: { days: 3, eventId: "receivable:judge-existing-so" },
      inputPayload: { eventId: "receivable:judge-existing-so", days: 3 },
      resultPayload: { outcome: "CONDITIONALLY_VALID", minimumProjectedBalanceRupiah: "5000000" },
    }],
    assumptions: [{ id: "assumption-horizon", code: "explicit_horizon", detail: "Requested horizon is 30 days from as-of." }],
    approvals: [{ id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization", status: "pending" }],
    approvedApprovalCodes: [], generatedAt: GENERATED_AT,
  });
  if (!result.ok) throw new Error(result.error.message);
  return encodeProof(result.value);
}

async function seedTenant(tenantId: string, revision = 0): Promise<void> {
  const owner = await harness.ownerPool.connect();
  try {
    await owner.query("insert into public.erp_tenants (id, name) values ($1, $2) on conflict do nothing", [tenantId, tenantId]);
    await owner.query("insert into public.erp_workspaces (tenant_id, revision, active_role) values ($1, $2, 'admin') on conflict do nothing", [tenantId, revision]);
  } finally {
    owner.release();
  }
}

describe("DealTwin PostgreSQL repositories", () => {
  beforeAll(async () => {
    harness = await PostgresHarness.connect(requiredTestDatabaseUrl());
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("persists the complete canonical Judge invoice source chain and rejects invalid state atomically", async () => {
    await harness.resetAndMigrate();
    await seedTenant("tenant-a");
    const repository = new PostgresErpRepository(harness.appPool);
    const seed = createJudgeScenario().erpState;
    await repository.saveAtomic("tenant-a", 0, seed);
    const loaded = await new PostgresErpRepository(harness.appPool).loadWorkspace("tenant-a");
    expect(loaded).toEqual(seed);
    const invalid = { ...seed, revision: 2, goodsReceipts: [] };
    await expect(repository.saveAtomic("tenant-a", 1, invalid)).rejects.toThrow();
    expect(await repository.loadWorkspace("tenant-a")).toEqual(seed);
  });

  it("does not silently accept a rewrite of append-only ERP audit evidence", async () => {
    await harness.resetAndMigrate(); await seedTenant("tenant-a");
    const repo = new PostgresErpRepository(harness.appPool);
    const seed = createJudgeScenario().erpState;
    seed.auditLogs = [{ id:"immutable-audit",entityType:"erp_workspace",entityId:"tenant-a",action:"test.synthetic",actorRole:"admin",actorId:"judge-user",
      detail:{ reason:"original evidence" },createdAt:GENERATED_AT,updatedAt:GENERATED_AT }];
    await repo.saveAtomic("tenant-a",0,seed);
    const forged = { ...seed,revision:2,auditLogs:seed.auditLogs.map((row)=>({ ...row,detail:{ reason:"rewritten evidence" } })) };
    await expect(repo.saveAtomic("tenant-a",1,forged)).rejects.toThrow();
    expect(await repo.loadWorkspace("tenant-a")).toEqual(seed);
  });

  it("round-trips ERP seed state with exact string/bigint cash mapping and revision conflict", async () => {
    await harness.resetAndMigrate();
    await seedTenant("tenant-a");
    await seedTenant("tenant-b");
    const repository = new PostgresErpRepository(harness.appPool);
    const seed = createErpSeedState();
    seed.cashAccounts = [{
      id: "cash-a", code: "BANK-IDR", name: "Primary", currency: "IDR", openingBalanceRupiah: "9007199254740993",
      openingBalanceDate: "2026-09-12", openingSourceType: "opening_balance", openingSourceId: "opening-a",
      openingSourceRevision: "1", active: true, createdAt: GENERATED_AT, updatedAt: GENERATED_AT,
    }];
    seed.revision = 1;
    const saved = await repository.saveAtomic("tenant-a", 0, seed);
    expect(saved.revision).toBe(1);
    const loaded = await repository.loadWorkspace("tenant-a");
    expect(loaded.revision).toBe(1);
    expect(loaded.products).toEqual(seed.products);
    expect(loaded.purchaseOrders).toEqual(seed.purchaseOrders);
    expect(loaded.salesOrders).toEqual(seed.salesOrders);
    expect(loaded.stockMovements).toEqual(seed.stockMovements);
    expect(loaded.cashAccounts[0]?.openingBalanceRupiah).toBe("9007199254740993");
    await expect(repository.saveAtomic("tenant-a", 0, { ...seed, revision: 1 })).rejects.toBeInstanceOf(ExpectedRevisionConflict);
    const tenantB = await repository.loadWorkspace("tenant-b");
    expect(tenantB.products).toEqual([]);
  });

  it("round-trips proof JSON, keeps versions immutable, and denies cross-tenant reads", async () => {
    await harness.resetAndMigrate();
    await seedTenant("tenant-a", 1);
    await seedTenant("tenant-b", 1);
    const owner = await harness.ownerPool.connect();
    try {
      await owner.query(`
        insert into public.erp_customers (
          tenant_id, id, code, name, contact_name, phone, email, address, credit_limit, active, created_at, updated_at
        ) values
          ('tenant-a', 'customer-a', 'CUST-A', 'A', 'C', '0', 'a@example.com', 'Addr', 0, true, $1, $1),
          ('tenant-b', 'customer-a', 'CUST-A', 'A', 'C', '0', 'a@example.com', 'Addr', 0, true, $1, $1)
      `, [GENERATED_AT]);
      await owner.query(`
        insert into public.erp_cash_accounts (
          tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
          opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
        ) values ('tenant-a', 'cash-a', 'BANK', 'Cash', 'IDR', 1, '2026-09-12', 'opening_balance', 'open', '1', true, $1, $1)
      `, [GENERATED_AT]);
    } finally {
      owner.release();
    }
    const proof = proofDto();
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      const repo = new PostgresDealTwinRepository(tx, "tenant-a");
      await repo.insertDeal({ id: "deal-a", title: "Deal A", customerId: "customer-a", status: "DRAFT", currentVersionId: "", committedSalesOrderId: null }, GENERATED_AT);
      const version = createDealVersion({
        id: "version-a", dealId: "deal-a", version: 1, terms: createJudgeFixture().candidateTermsA, createdBy: "actor-a", createdAt: GENERATED_AT,
      });
      await repo.insertDealVersion(version);
      await tx.query("savepoint immutable_version");
      await expect(repo.insertDealVersion({ ...version, termsHash: "b".repeat(64) })).rejects.toThrow();
      await tx.query("rollback to savepoint immutable_version");
      await repo.insertSnapshot({
        id: "snapshot-a", erpRevision: 1, asOfDate: "2026-09-12", requestedHorizonEnd: "2026-10-12",
        adapterVersion: proof.adapterVersion, dependencyKeys: ["erp.invoice:inv-1"], dependencyManifest: proof.dependencyManifest,
        canonicalEvents: proof.cashEvents, stateHash: proof.snapshotHash, createdAt: GENERATED_AT,
      });
      await repo.insertCompileRun({
        id: "compile-a", dealVersionId: "version-a", snapshotId: "snapshot-a", kind: "base", engineVersion: proof.engineVersion,
        inputHash: proof.inputHash, resultHash: proof.resultHash, outcome: "CONDITIONALLY_VALID", cashFloorRupiah: "5000000",
        shortfallRupiah: "3000000", worstMinimumRupiah: "2000000", firstViolationDate: "2026-09-22", violationData: {}, parentRunId: null, createdAt: GENERATED_AT,
      });
      await repo.insertProof(proof, "compile-a");
      await expect(repo.insertProof({ ...proof, dealVersionId: "version-b" }, "compile-a")).rejects.toThrow();
      const fetched = await repo.getProof("proof-a");
      expect(fetched?.id).toBe(proof.id);
      expect(fetched?.proofHash).toBe(proof.proofHash);
      expect(fetched?.generatedAt).toBe(proof.generatedAt);
      expect(fetched?.dealVersionId).toBe(proof.dealVersionId);
      const replay = replayProof(fetched!);
      expect(replay.ok, replay.ok ? undefined : replay.error.message).toBe(true);
      await repo.insertApproval({
        id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization",
        status: "pending", comment: "select 1; --", decidedBy: null, decidedAt: null,
      }, GENERATED_AT);
      await repo.insertCommitment({
        id: "commit-a", proofId: "proof-a", dealVersionId: "version-a", accountId: "cash-a",
        canonicalEventHash: proof.canonicalEventHash, canonicalEvents: [{ amountRupiah: "9007199254740993" }],
        amountRupiah: "9007199254740993", direction: "outflow", status: "reserved",
        reserveIdempotencyKey: "reserve-a", createdAt: GENERATED_AT, updatedAt: GENERATED_AT,
      });
      expect(await repo.listActiveCommitments()).toHaveLength(1);
      await tx.query("update public.dealtwin_liquidity_commitments set status = 'released' where tenant_id = $1 and id = $2", ["tenant-a", "commit-a"]);
      expect(await repo.listActiveCommitments()).toEqual([]);
    });
    await withTransaction(harness.appPool, "tenant-b", async (tx) => {
      const repo = new PostgresDealTwinRepository(tx, "tenant-b");
      expect(await repo.getProof("proof-a")).toBeNull();
    });
  });

  it("binds ApplicationPorts.transact to one client, locks the workspace, and rolls back mutation without a receipt", async () => {
    await harness.resetAndMigrate();
    await seedTenant("tenant-a", 1);
    const owner = await harness.ownerPool.connect();
    try {
      await owner.query(`
        insert into public.erp_customers (
          tenant_id, id, code, name, contact_name, phone, email, address, credit_limit, active, created_at, updated_at
        ) values ('tenant-a', 'customer-a', 'CUST-A', 'A', 'C', '0', 'a@example.com', 'Addr', 0, true, $1, $1)
      `, [GENERATED_AT]);
    } finally {
      owner.release();
    }
    const proof = proofDto();
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      const repo = new PostgresDealTwinRepository(tx, "tenant-a");
      await repo.insertDeal({ id: "deal-a", title: "Deal A", customerId: "customer-a", status: "PROOF_GENERATED", currentVersionId: "", committedSalesOrderId: null }, GENERATED_AT);
      await repo.insertDealVersion(createDealVersion({
        id: "version-a", dealId: "deal-a", version: 1, terms: createJudgeFixture().candidateTermsA, createdBy: "actor-a", createdAt: GENERATED_AT,
      }));
      await repo.insertSnapshot({
        id: "snapshot-a", erpRevision: 1, asOfDate: "2026-09-12", requestedHorizonEnd: "2026-10-12", adapterVersion: proof.adapterVersion,
        dependencyKeys: [], dependencyManifest: {}, canonicalEvents: [], stateHash: HASH, createdAt: GENERATED_AT,
      });
      await repo.insertCompileRun({
        id: "compile-a", dealVersionId: "version-a", snapshotId: "snapshot-a", kind: "base", engineVersion: proof.engineVersion,
        inputHash: proof.inputHash, resultHash: proof.resultHash, outcome: "CONDITIONALLY_VALID", cashFloorRupiah: "5000000",
        shortfallRupiah: null, worstMinimumRupiah: null, firstViolationDate: null, violationData: {}, parentRunId: null, createdAt: GENERATED_AT,
      });
      await repo.insertProof(proof, "compile-a");
      await repo.insertApproval({
        id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization",
        status: "pending", comment: null, decidedBy: null, decidedAt: null,
      }, GENERATED_AT);
    });

    const ports = createPostgresApplicationPorts(harness.appPool);
    const seen: string[] = [];
    await ports.transact({
      tenantId: "tenant-a", actorId: "approver-a", role: "approver", expectedRevision: 1, idempotencyKey: "tx-1", now: NOW,
    }, "dealtwin.approval.decide", { approvalId: "approval-owner" }, async (repos) => {
      const proofRow = await repos.proofs.getById("proof-a");
      const approval = await repos.approvals.getById("approval-owner");
      seen.push(proofRow?.id ?? "missing-proof", approval?.id ?? "missing-approval");
      await repos.approvals.save({ ...approval!, status: "approved", comment: "ok", decidedBy: "approver-a", decidedAt: NOW });
      const reread = await repos.approvals.getById("approval-owner");
      expect(reread?.status).toBe("approved");
      throw new Error("forced receipt failure");
    }).catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
    });
    expect(seen).toEqual(["proof-a", "approval-owner"]);
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      const approval = await tx.query("select status from public.dealtwin_approvals where tenant_id = $1 and id = $2", ["tenant-a", "approval-owner"]);
      expect(approval.rows[0]?.status).toBe("pending");
      const receipts = await tx.query("select count(*)::int as n from public.erp_audit_events where tenant_id = $1", ["tenant-a"]);
      expect(receipts.rows[0]?.n).toBe(0);
      const revision = await lockTenantWorkspace(tx, "tenant-a");
      expect(revision).toBe(1);
    });

    const decided = await decideApproval(ports, {
      tenantId: "tenant-a", actorId: "approver-a", role: "approver", expectedRevision: 1, idempotencyKey: "decision-sql", now: NOW,
    } satisfies MutationContext, {
      approvalId: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", decision: "approved", comment: "select 1; drop table dealtwin_proofs; --",
    });
    expect(decided).toMatchObject({ httpStatus: 200, body: { ok: true, status: "approved" } });
    const mismatch = await decideApproval(ports, {
      tenantId: "tenant-a", actorId: "approver-a", role: "approver", expectedRevision: 2, idempotencyKey: "decision-mismatch", now: NOW,
    }, {
      approvalId: "approval-owner", proofId: "proof-a", dealVersionId: "version-b", decision: "rejected", comment: "no",
    });
    expect(mismatch).toMatchObject({ httpStatus: 422, body: { ok: false, error: { code: "APPROVAL_IDENTITY_MISMATCH" } } });

    await harness.resetAndMigrate();
    await seedTenant("tenant-a", 1);
    const ownerRace = await harness.ownerPool.connect();
    try {
      await ownerRace.query(`
        insert into public.erp_customers (
          tenant_id, id, code, name, contact_name, phone, email, address, credit_limit, active, created_at, updated_at
        ) values ('tenant-a', 'customer-a', 'CUST-A', 'A', 'C', '0', 'a@example.com', 'Addr', 0, true, $1, $1)
      `, [GENERATED_AT]);
    } finally {
      ownerRace.release();
    }
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      const repo = new PostgresDealTwinRepository(tx, "tenant-a");
      await repo.insertDeal({ id: "deal-a", title: "Deal A", customerId: "customer-a", status: "PROOF_GENERATED", currentVersionId: "", committedSalesOrderId: null }, GENERATED_AT);
      await repo.insertDealVersion(createDealVersion({
        id: "version-a", dealId: "deal-a", version: 1, terms: createJudgeFixture().candidateTermsA, createdBy: "actor-a", createdAt: GENERATED_AT,
      }));
      await repo.insertSnapshot({
        id: "snapshot-a", erpRevision: 1, asOfDate: "2026-09-12", requestedHorizonEnd: "2026-10-12", adapterVersion: proof.adapterVersion,
        dependencyKeys: [], dependencyManifest: {}, canonicalEvents: [], stateHash: HASH, createdAt: GENERATED_AT,
      });
      await repo.insertCompileRun({
        id: "compile-a", dealVersionId: "version-a", snapshotId: "snapshot-a", kind: "base", engineVersion: proof.engineVersion,
        inputHash: proof.inputHash, resultHash: proof.resultHash, outcome: "CONDITIONALLY_VALID", cashFloorRupiah: "5000000",
        shortfallRupiah: null, worstMinimumRupiah: null, firstViolationDate: null, violationData: {}, parentRunId: null, createdAt: GENERATED_AT,
      });
      await repo.insertProof(proof, "compile-a");
      await repo.insertApproval({
        id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization",
        status: "pending", comment: null, decidedBy: null, decidedAt: null,
      }, GENERATED_AT);
    });
    const racingPorts = createPostgresApplicationPorts(harness.appPool);
    const racing = await Promise.allSettled([
      decideApproval(racingPorts, {
        tenantId: "tenant-a", actorId: "approver-a", role: "approver", expectedRevision: 1, idempotencyKey: "rev-a", now: NOW,
      }, { approvalId: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", decision: "approved", comment: "Approve." }),
      decideApproval(racingPorts, {
        tenantId: "tenant-a", actorId: "approver-a", role: "approver", expectedRevision: 1, idempotencyKey: "rev-b", now: NOW,
      }, { approvalId: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", decision: "rejected", comment: "Reject." }),
    ]);
    const fulfilled = racing.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof decideApproval>>> => item.status === "fulfilled");
    const successes = fulfilled.filter((item) => item.value.httpStatus === 200);
    expect(successes).toHaveLength(1);
    const losers = racing.filter((item) => item.status === "rejected" || (item.status === "fulfilled" && item.value.httpStatus !== 200));
    expect(losers).toHaveLength(1);
  });
});
