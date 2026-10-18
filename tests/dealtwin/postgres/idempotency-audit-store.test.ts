import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideApproval } from "../../../lib/dealtwin/application/approval-service";
import { canonicalStringify, sha256Canonical } from "../../../lib/dealtwin/domain/canonical-json";
import type { MutationContext, OperationReceipt } from "../../../lib/dealtwin/application/operation-contracts";
import { appendOperationReceipt, findSuccessReceipt, readOperationReceipt } from "../../../lib/server/postgres/idempotency-audit-store";
import { createPostgresApplicationPorts, PostgresDealTwinRepository } from "../../../lib/server/postgres/postgres-dealtwin-repository";
import { withTransaction } from "../../../lib/server/postgres/transaction";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { buildDealProof } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { createJudgeFixture } from "../fixtures/judge-scenario";
import { PostgresHarness, requiredTestDatabaseUrl } from "./harness";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";
const NOW = "2026-09-16T09:00:00.000Z";
const HASH = "a".repeat(64);
const ACTION = "dealtwin.approval.decide";

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
    stressRuns: [], assumptions: [{ id: "a", code: "explicit_horizon", detail: "Requested horizon is 30 days from as-of." }],
    approvals: [{ id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization", status: "pending" }],
    approvedApprovalCodes: [], generatedAt: GENERATED_AT,
  });
  if (!result.ok) throw new Error(result.error.message);
  return encodeProof(result.value);
}

function receipt(overrides: Partial<OperationReceipt> = {}): OperationReceipt {
  const encoded = { httpStatus: 200, body: { ok: true, action: ACTION } };
  return {
    tenantId: "tenant-a",
    actorId: "approver-a",
    action: ACTION,
    idempotencyKey: "decision-1",
    requestHash: HASH,
    responseJson: canonicalStringify(encoded),
    responseHash: sha256Canonical(encoded),
    priorRevision: 1,
    currentRevision: 2,
    createdAt: NOW,
    ...overrides,
  };
}

async function seedTenant(tenantId: string): Promise<void> {
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
  } finally {
    owner.release();
  }
}

async function seedProofAndApproval(tenantId: string, proof: DealProofDto): Promise<void> {
  await seedTenant(tenantId);
  await withTransaction(harness.appPool, tenantId, async (tx) => {
    const repo = new PostgresDealTwinRepository(tx, tenantId);
    await repo.insertDeal({ id: "deal-a", title: "Deal A", customerId: "customer-a", status: "PROOF_GENERATED", currentVersionId: "", committedSalesOrderId: null }, GENERATED_AT);
    await repo.insertDealVersion(createDealVersion({
      id: "version-a", dealId: "deal-a", version: 1, terms: createJudgeFixture().candidateTermsA, createdBy: "actor-a", createdAt: GENERATED_AT,
    }));
    await repo.insertSnapshot({
      id: "snapshot-a", erpRevision: 1, asOfDate: "2026-09-12", requestedHorizonEnd: "2026-10-12", adapterVersion: "dealtwin-erp-adapter-v1",
      dependencyKeys: [], dependencyManifest: {}, canonicalEvents: [], stateHash: HASH, createdAt: GENERATED_AT,
    });
    await repo.insertCompileRun({
      id: "compile-a", dealVersionId: "version-a", snapshotId: "snapshot-a", kind: "base", engineVersion: proof.engineVersion,
      inputHash: proof.inputHash, resultHash: proof.resultHash, outcome: "CONDITIONALLY_VALID", cashFloorRupiah: "5000000",
      shortfallRupiah: "3000000", worstMinimumRupiah: "2000000", firstViolationDate: "2026-09-22", violationData: {}, parentRunId: null, createdAt: GENERATED_AT,
    });
    await repo.insertProof(proof, "compile-a");
    await repo.insertApproval({
      id: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization", status: "pending",
      comment: null, decidedBy: null, decidedAt: null,
    }, GENERATED_AT);
  });
}

function context(overrides: Partial<MutationContext> = {}): MutationContext {
  return {
    tenantId: "tenant-a", actorId: "approver-a", role: "approver", expectedRevision: 1, idempotencyKey: "decision-1", now: NOW, ...overrides,
  };
}

describe("DealTwin idempotency audit store", () => {
  beforeAll(async () => {
    harness = await PostgresHarness.connect(requiredTestDatabaseUrl());
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("replays the original success response after later mutable approval status changes", async () => {
    await harness.resetAndMigrate();
    await seedProofAndApproval("tenant-a", proofDto());
    const first = receipt();
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      await appendOperationReceipt(tx, first);
      const loaded = await findSuccessReceipt(tx, "tenant-a", ACTION, "decision-1");
      expect(loaded?.responseJson).toBe(first.responseJson);
      expect(loaded?.responseHash).toBe(first.responseHash);
      await tx.query("update public.dealtwin_approvals set status = 'rejected' where tenant_id = $1 and id = $2", ["tenant-a", "approval-owner"]);
      const replay = await readOperationReceipt(tx, "tenant-a", ACTION, "decision-1", first.requestHash);
      expect(replay).toEqual({ httpStatus: 200, body: { ok: true, action: ACTION } });
    });
  });

  it("scopes lookup by tenant and action and rejects a corrupted response hash", async () => {
    await harness.resetAndMigrate();
    await seedTenant("tenant-a");
    await seedTenant("tenant-b");
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      await appendOperationReceipt(tx, receipt());
    });
    await withTransaction(harness.appPool, "tenant-b", async (tx) => {
      await appendOperationReceipt(tx, receipt({ tenantId: "tenant-b", idempotencyKey: "decision-1" }));
      expect(await findSuccessReceipt(tx, "tenant-b", ACTION, "decision-1")).not.toBeNull();
      expect(await findSuccessReceipt(tx, "tenant-a", ACTION, "decision-1")).toBeNull();
    });
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      expect(await findSuccessReceipt(tx, "tenant-a", "dealtwin.commit", "decision-1")).toBeNull();
      await expect(readOperationReceipt(tx, "tenant-a", ACTION, "decision-1", "b".repeat(64))).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED|different request/);
      await expect(appendOperationReceipt(tx, receipt({
        idempotencyKey: "corrupt-1",
        responseHash: "c".repeat(64),
      }))).rejects.toThrow(/hash|integrity/i);
    });
    const owner = await harness.ownerPool.connect();
    try {
      await owner.query(`
        insert into public.erp_audit_events (
          tenant_id, id, entity_type, entity_id, action, actor_role, actor_id, detail, created_at, updated_at
        ) values (
          'tenant-a', 'corrupt-row', 'dealtwin_operation', 'corrupt-2', $1, 'system', 'approver-a',
          $2::jsonb, $3, $3
        )
      `, [ACTION, JSON.stringify({
        operationSucceeded: "true",
        idempotencyKey: "corrupt-2",
        requestHash: HASH,
        responseHash: "c".repeat(64),
        responseJson: canonicalStringify({ httpStatus: 200, body: { ok: true } }),
        actorId: "approver-a",
        priorRevision: 1,
        currentRevision: 2,
      }), NOW]);
    } finally {
      owner.release();
    }
    await withTransaction(harness.appPool, "tenant-a", async (tx) => {
      await expect(findSuccessReceipt(tx, "tenant-a", ACTION, "corrupt-2")).rejects.toThrow(/hash|integrity/i);
    });
  });

  it("wires decideApproval idempotency through PostgreSQL including concurrent same-key races", async () => {
    await harness.resetAndMigrate();
    await seedProofAndApproval("tenant-a", proofDto());
    const ports = createPostgresApplicationPorts(harness.appPool);
    const input = {
      approvalId: "approval-owner", proofId: "proof-a", dealVersionId: "version-a", decision: "approved" as const, comment: "Owner exception granted.",
    };
    const first = await decideApproval(ports, context(), input);
    expect(first).toMatchObject({ httpStatus: 200, body: { ok: true, status: "approved", proofUnchanged: true } });
    const replay = await decideApproval(ports, context(), input);
    expect(replay).toEqual(first);
    const conflict = await decideApproval(ports, context(), { ...input, comment: "Different payload." });
    expect(conflict).toMatchObject({ httpStatus: 409, body: { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED" } } });
    const crossProof = await decideApproval(ports, context({ idempotencyKey: "decision-1" }), { ...input, proofId: "proof-b" });
    expect(crossProof.httpStatus).toBe(409);

    await harness.resetAndMigrate();
    await seedProofAndApproval("tenant-a", proofDto());
    const failed = await decideApproval(ports, context({ idempotencyKey: "retry-key" }), { ...input, proofId: "missing" });
    expect(failed.httpStatus).toBe(422);
    const recovered = await decideApproval(ports, context({ idempotencyKey: "retry-key" }), input);
    expect(recovered.httpStatus).toBe(200);

    await harness.resetAndMigrate();
    await seedProofAndApproval("tenant-a", proofDto());
    const [left, right] = await Promise.all([
      decideApproval(ports, context({ idempotencyKey: "race-same" }), input),
      decideApproval(ports, context({ idempotencyKey: "race-same" }), input),
    ]);
    expect([left.httpStatus, right.httpStatus].every((status) => status === 200)).toBe(true);
    expect(left).toEqual(right);
    const owner = await harness.ownerPool.connect();
    try {
      const approvals = await owner.query("select status from public.dealtwin_approvals where tenant_id = $1", ["tenant-a"]);
      expect(approvals.rows).toHaveLength(1);
      const receipts = await owner.query(
        "select count(*)::int as n from public.erp_audit_events where tenant_id = $1 and action = $2 and detail->>'operationSucceeded' = 'true'",
        ["tenant-a", ACTION],
      );
      expect(receipts.rows[0]?.n).toBe(1);
    } finally {
      owner.release();
    }

    await harness.resetAndMigrate();
    await seedProofAndApproval("tenant-a", proofDto());
    const concurrent = await Promise.allSettled([
      decideApproval(ports, context({ idempotencyKey: "race-diff" }), input),
      decideApproval(ports, context({ idempotencyKey: "race-diff" }), { ...input, comment: "Other comment." }),
    ]);
    const statuses = concurrent.map((item) => item.status === "fulfilled" ? item.value.httpStatus : 500);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
  });
});
