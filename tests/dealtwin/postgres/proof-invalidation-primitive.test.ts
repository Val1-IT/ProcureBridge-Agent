import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QUERY_OPEN_AP_KEY, dealtwinCommitmentKey, erpInvoiceKey } from "../../../lib/dealtwin/erp/dependency-keys";
import { dependencyKey, type DependencyChange } from "../../../lib/dealtwin/erp/dependency-manifest";
import { invalidateAffectedProofs } from "../../../lib/server/postgres/proof-invalidation";
import { withTransaction } from "../../../lib/server/postgres/transaction";
import { PostgresDealTwinRepository } from "../../../lib/server/postgres/postgres-dealtwin-repository";
import { createJudgeFixture } from "../fixtures/judge-scenario";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { buildDealProof } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { PostgresHarness, requiredTestDatabaseUrl } from "./harness";
import { JUDGE_TENANT_ID } from "../../../lib/dealtwin/judge/scenario";
import { createPostgresJudgeRuntime } from "../../../lib/server/dealtwin/runtime";
import { PostgresErpRepository } from "../../../lib/server/postgres/postgres-erp-repository";
import { upsertProduct } from "../../../lib/erp/commands/master-data";
import { isValidServerErpState } from "../../../lib/demo/persistence";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";
const HASH = "a".repeat(64);

let harness: PostgresHarness;

function canonicalProof(id = "proof-a"): DealProofDto {
  const scenario = createJudgeFixture();
  const version = createDealVersion({
    id: "version-a",
    dealId: "deal-a",
    version: 1,
    terms: scenario.candidateTermsA,
    createdBy: "actor-a",
    createdAt: GENERATED_AT,
  });
  const baseResult = compileDeal({
    snapshot: scenario.snapshot,
    terms: scenario.candidateTermsA,
    constraints: scenario.constraints,
    policy: scenario.policy,
    approvedApprovalCodes: [],
  });
  const result = buildDealProof({
    proofId: id,
    dealId: "deal-a",
    version,
    snapshot: scenario.snapshot,
    constraints: scenario.constraints,
    policy: scenario.policy,
    baseResult,
    stressRuns: [],
    assumptions: [{ id: "assumption-horizon", code: "explicit_horizon", detail: "Requested horizon is 30 days from as-of." }],
    approvals: [{ id: "approval-owner", proofId: id, dealVersionId: "version-a", kind: "non_arithmetic_authorization", status: "pending" }],
    approvedApprovalCodes: [],
    generatedAt: GENERATED_AT,
  });
  if (!result.ok) throw new Error(result.error.message);
  return encodeProof(result.value);
}

function change(overrides: Partial<DependencyChange> = {}): DependencyChange {
  return {
    tenantId: "tenant-a",
    priorRevision: 1,
    currentRevision: 2,
    changes: [{ key: dependencyKey(erpInvoiceKey("inv-new")), beforeHash: null, afterHash: HASH }],
    self: null,
    selfCapacityKeys: [],
    ...overrides,
  };
}

async function seedGraph(tenantId: string, proof: DealProofDto, keys: readonly string[]): Promise<void> {
  const owner = await harness.ownerPool.connect();
  try {
    await owner.query("insert into public.erp_tenants (id, name) values ($1, $2) on conflict do nothing", [tenantId, tenantId]);
    await owner.query("insert into public.erp_workspaces (tenant_id, revision, active_role) values ($1, 1, 'admin') on conflict do nothing", [tenantId]);
    await owner.query(`
      insert into public.erp_customers (
        tenant_id, id, code, name, contact_name, phone, email, address, credit_limit, active, created_at, updated_at
      ) values ($1, 'customer-a', 'CUST-A', 'Customer A', 'C', '0', 'a@example.com', 'Addr', 0, true, $2, $2)
      on conflict do nothing
    `, [tenantId, GENERATED_AT]);
    await owner.query(`
      insert into public.erp_cash_accounts (
        tenant_id, id, code, name, currency, opening_balance_rupiah, opening_balance_date,
        opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at
      ) values ($1, 'cash-a', 'BANK', 'Cash', 'IDR', 1, '2026-09-12', 'opening_balance', 'open', '1', true, $2, $2)
      on conflict do nothing
    `, [tenantId, GENERATED_AT]);
  } finally {
    owner.release();
  }
  await withTransaction(harness.appPool, tenantId, async (tx) => {
    const repo = new PostgresDealTwinRepository(tx, tenantId);
    await repo.insertDeal({
      id: "deal-a",
      title: "Deal A",
      customerId: "customer-a",
      status: "PROOF_GENERATED",
      currentVersionId: "",
      committedSalesOrderId: null,
    }, GENERATED_AT);
    await repo.insertDealVersion(createDealVersion({
      id: "version-a",
      dealId: "deal-a",
      version: 1,
      terms: createJudgeFixture().candidateTermsA,
      createdBy: "actor-a",
      createdAt: GENERATED_AT,
    }));
    await repo.insertSnapshot({
      id: "snapshot-a",
      erpRevision: 1,
      asOfDate: "2026-09-12",
      requestedHorizonEnd: "2026-10-12",
      adapterVersion: "dealtwin-erp-adapter-v1",
      dependencyKeys: keys,
      dependencyManifest: { keys },
      canonicalEvents: [],
      stateHash: HASH,
      createdAt: GENERATED_AT,
    });
    await repo.insertCompileRun({
      id: "compile-a",
      dealVersionId: "version-a",
      snapshotId: "snapshot-a",
      kind: "base",
      engineVersion: proof.engineVersion,
      inputHash: proof.inputHash,
      resultHash: proof.resultHash,
      outcome: "CONDITIONALLY_VALID",
      cashFloorRupiah: "5000000",
      shortfallRupiah: "3000000",
      worstMinimumRupiah: "2000000",
      firstViolationDate: "2026-09-22",
      violationData: {},
      parentRunId: null,
      createdAt: GENERATED_AT,
    });
    await repo.insertProof({ ...proof, dependencyManifest: { keys } }, "compile-a");
  });
}

describe("DealTwin proof invalidation primitive", () => {
  beforeAll(async () => {
    harness = await PostgresHarness.connect(requiredTestDatabaseUrl());
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("preserves immutable invalidation evidence through reload, legitimate ERP mutation and save", async () => {
    await harness.resetAndMigrate();
    const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
    await runtime.resetJudgeTenant({ tenantId: JUDGE_TENANT_ID, actorId: "judge-user", role: "admin",
      expectedRevision: 0, idempotencyKey: "invalidation-seed", now: GENERATED_AT });
    const proof = canonicalProof();
    const queryKey = dependencyKey(QUERY_OPEN_AP_KEY);
    await seedGraph(JUDGE_TENANT_ID, proof, [queryKey]);
    expect(await withTransaction(harness.appPool, JUDGE_TENANT_ID, (tx) => invalidateAffectedProofs(tx, change({
      tenantId: JUDGE_TENANT_ID, priorRevision: 0, currentRevision: 1,
      changes: [{ key: queryKey, beforeHash: "b".repeat(64), afterHash: HASH }],
    }), null))).toEqual([proof.id]);

    const repository = new PostgresErpRepository(harness.appPool);
    const loaded = await repository.loadWorkspace(JUDGE_TENANT_ID);
    const staleAudit = loaded.auditLogs.find((event) => event.action === "dealtwin.proof.stale");
    expect(staleAudit).toBeDefined();
    const command = upsertProduct(loaded, "admin", { ...loaded.products[0], name: "Synthetic updated catalogue label" }, GENERATED_AT);
    expect(command.ok).toBe(true);
    const next = command.state;
    // Isolate audit compatibility from fixture/source-chain validation failures.
    expect(isValidServerErpState({ ...next, auditLogs: next.auditLogs.filter((event) => event.id !== staleAudit?.id) })).toBe(true);
    expect(await repository.saveAtomic(JUDGE_TENANT_ID, 1, next)).toEqual({ revision: 2 });
    const reloaded = await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(reloaded).toEqual(next);
    expect(reloaded.auditLogs.find((event) => event.id === staleAudit?.id)).toEqual(staleAudit);
    expect(JSON.parse(String(staleAudit?.detail.changedKeysJson))).toEqual([queryKey]);
    await withTransaction(harness.appPool, JUDGE_TENANT_ID, async (tx) => {
      const stored = await tx.query("select status, proof_json from public.dealtwin_proofs where tenant_id=$1 and id=$2", [JUDGE_TENANT_ID, proof.id]);
      expect(stored.rows[0]?.status).toBe("STALE");
      expect(stored.rows[0]?.proof_json).toEqual({ ...proof, dependencyManifest: { keys: [queryKey] } });
    });
  });

  it("stales intersecting proofs but exempts only the exact self reservation-capacity delta", async () => {
    await harness.resetAndMigrate();
    const proof = canonicalProof();
    const selfKey = dependencyKey(dealtwinCommitmentKey("commit-self"));
    const invoiceKey = dependencyKey(erpInvoiceKey("inv-new"));
    const queryKey = dependencyKey(QUERY_OPEN_AP_KEY);
    await seedGraph("tenant-a", proof, [selfKey, invoiceKey, queryKey]);
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      const repo = new PostgresDealTwinRepository(tx, "tenant-a");
      await repo.insertDeal({
        id: "deal-b",
        title: "Deal B",
        customerId: "customer-a",
        status: "PROOF_GENERATED",
        currentVersionId: "",
        committedSalesOrderId: null,
      }, GENERATED_AT);
      await repo.insertDealVersion(createDealVersion({
        id: "version-b",
        dealId: "deal-b",
        version: 1,
        terms: createJudgeFixture().candidateTermsA,
        createdBy: "actor-a",
        createdAt: GENERATED_AT,
      }));
    });

    const self = { proofId: proof.id, dealVersionId: proof.dealVersionId, canonicalEventHash: proof.canonicalEventHash };
    const staledSelfOnly = await withTransaction(harness.appPool, "tenant-a", (tx) => invalidateAffectedProofs(tx, change({
      changes: [{ key: selfKey, beforeHash: null, afterHash: HASH }],
      self,
      selfCapacityKeys: [selfKey],
    }), self));
    expect(staledSelfOnly).toEqual([]);

    const staledInvoice = await withTransaction(harness.appPool, "tenant-a", (tx) => invalidateAffectedProofs(tx, change({
      changes: [
        { key: selfKey, beforeHash: null, afterHash: HASH },
        { key: invoiceKey, beforeHash: null, afterHash: HASH },
      ],
      self,
      selfCapacityKeys: [selfKey],
    }), self));
    expect(staledInvoice).toContain(proof.id);

    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      const stored = await tx.query<{ status: string; proof_json: DealProofDto; proof_hash: string }>(
        "select status, proof_json, proof_hash from public.dealtwin_proofs where tenant_id = $1 and id = $2",
        ["tenant-a", proof.id],
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]?.status).toBe("STALE");
      expect(stored.rows[0]?.proof_hash).toBe(proof.proofHash);
      expect(stored.rows[0]?.proof_json.proofHash).toBe(proof.proofHash);
      expect(stored.rows[0]?.proof_json.cashEvents).toEqual(proof.cashEvents);
    });
  });

  it("stales a proof when a new-obligation query-set hash changes", async () => {
    await harness.resetAndMigrate();
    const proof = canonicalProof("proof-query");
    const queryKey = dependencyKey(QUERY_OPEN_AP_KEY);
    await seedGraph("tenant-a", { ...proof, id: "proof-query" }, [queryKey]);
    const staled = await withTransaction(harness.appPool, "tenant-a", (tx) => invalidateAffectedProofs(tx, change({
      changes: [{ key: queryKey, beforeHash: "b".repeat(64), afterHash: HASH }],
    }), null));
    expect(staled).toContain("proof-query");
  });

  it("does not stale a non-intersecting proof", async () => {
    await harness.resetAndMigrate();
    const proof = canonicalProof("proof-other");
    await seedGraph("tenant-a", { ...proof, id: "proof-other" }, [dependencyKey(erpInvoiceKey("inv-keep"))]);
    const staled = await withTransaction(harness.appPool, "tenant-a", (tx) => invalidateAffectedProofs(tx, change({
      changes: [{ key: dependencyKey(erpInvoiceKey("inv-other")), beforeHash: null, afterHash: HASH }],
    }), null));
    expect(staled).toEqual([]);
  });
});
