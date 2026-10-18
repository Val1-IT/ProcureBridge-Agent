import { describe, expect, it } from "vitest";
import { decideApproval } from "../../../lib/dealtwin/application/approval-service";
import type { MutationContext, OperationReceipt } from "../../../lib/dealtwin/application/operation-contracts";
import type { ApplicationPorts, ApprovalRecord, TransactionScopedRepositories } from "../../../lib/dealtwin/application/ports";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { canCommitProof, canReserveProof, type Approval } from "../../../lib/dealtwin/domain/proof";
import { buildDealProof } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { createJudgeFixture } from "../fixtures/judge-scenario";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";
const NOW = "2026-09-16T09:00:00.000Z";

function pendingApproval(kind: Approval["kind"] = "non_arithmetic_authorization", id = "approval-owner"): Approval {
  return { id, proofId: "proof-a", dealVersionId: "version-a", kind, status: "pending" };
}

function canonicalProof(approvals: readonly Approval[] = [pendingApproval()]): DealProofDto {
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
    proofId: "proof-a",
    dealId: "deal-a",
    version,
    snapshot: scenario.snapshot,
    constraints: scenario.constraints,
    policy: scenario.policy,
    baseResult,
    stressRuns: [],
    assumptions: [{ id: "assumption-horizon", code: "explicit_horizon", detail: "Requested horizon is 30 days from as-of." }],
    approvals,
    approvedApprovalCodes: [],
    generatedAt: GENERATED_AT,
  });
  if (!result.ok) throw new Error(result.error.message);
  return encodeProof(result.value);
}

function toRecord(approval: Approval): ApprovalRecord {
  return { ...approval, comment: null, decidedBy: null, decidedAt: null };
}

function authorizationView(dto: DealProofDto, approvals: readonly Approval[]) {
  return {
    id: dto.id,
    dealId: dto.dealId,
    dealVersionId: dto.dealVersionId,
    status: dto.status,
    canonicalEventHash: dto.canonicalEventHash,
    approvals,
  };
}

function createMemoryPorts(seed: { proof: DealProofDto; approvals: readonly ApprovalRecord[] }): ApplicationPorts & {
  proofSnapshot(): DealProofDto;
  currentApprovals(): ApprovalRecord[];
} {
  const proofs = new Map<string, DealProofDto>([[seed.proof.id, structuredClone(seed.proof)]]);
  const approvals = new Map<string, ApprovalRecord>(seed.approvals.map((item) => [item.id, { ...item }]));
  const receipts = new Map<string, OperationReceipt>();
  const repos: TransactionScopedRepositories = {
    proofs: {
      async getById(proofId) {
        const value = proofs.get(proofId);
        return value ? structuredClone(value) : null;
      },
    },
    approvals: {
      async getById(approvalId) {
        const value = approvals.get(approvalId);
        return value ? { ...value } : null;
      },
      async listByProofVersion(proofId, dealVersionId) {
        return [...approvals.values()].filter((item) => item.proofId === proofId && item.dealVersionId === dealVersionId).map((item) => ({ ...item }));
      },
      async save(record) {
        approvals.set(record.id, { ...record });
      },
    },
    receipts: {
      async findSuccess(tenantId, action, idempotencyKey) {
        return receipts.get(`${tenantId}:${action}:${idempotencyKey}`) ?? null;
      },
      async appendSuccess(receipt) {
        receipts.set(`${receipt.tenantId}:${receipt.action}:${receipt.idempotencyKey}`, receipt);
      },
    },
    async invalidate() {
      return [];
    },
  };
  return {
    async transact(_context, _action, _input, work) {
      return work(repos);
    },
    proofSnapshot() {
      return structuredClone(proofs.get(seed.proof.id)!);
    },
    currentApprovals() {
      return [...approvals.values()].map((item) => ({ ...item }));
    },
  };
}

function context(overrides: Partial<MutationContext> = {}): MutationContext {
  return {
    tenantId: "dealtwin-judge-v1",
    actorId: "approver-a",
    role: "approver",
    expectedRevision: 1,
    idempotencyKey: "decision-1",
    now: NOW,
    ...overrides,
  };
}

describe("decideApproval", () => {
  it("allows RESERVE for fixed non-arithmetic pending approval and blocks COMMIT until decided", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const pendingView = authorizationView(proof, ports.currentApprovals());
    expect(canReserveProof(pendingView)).toMatchObject({ ok: true });
    expect(canCommitProof(pendingView)).toMatchObject({ ok: false, error: { code: "APPROVAL_REQUIRED" } });
    const approved = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "Owner exception granted.",
    });
    expect(approved).toMatchObject({ httpStatus: 200, body: { ok: true, status: "approved" } });
    expect(ports.proofSnapshot()).toEqual(proof);
    expect(canCommitProof(authorizationView(ports.proofSnapshot(), ports.currentApprovals()))).toMatchObject({ ok: true });
  });

  it("blocks RESERVE while arithmetic uncertainty remains unresolved", () => {
    const approvals = [pendingApproval(), pendingApproval("arithmetic_uncertainty", "approval-arithmetic")];
    const proof = canonicalProof(approvals);
    expect(canReserveProof(authorizationView(proof, approvals))).toMatchObject({
      ok: false,
      error: { code: "ARITHMETIC_UNCERTAINTY" },
    });
  });

  it("blocks COMMIT after rejection and does not rewrite the historical proof", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const rejected = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "rejected",
      comment: "Owner declined.",
    });
    expect(rejected).toMatchObject({ httpStatus: 200, body: { ok: true, status: "rejected" } });
    expect(ports.proofSnapshot()).toEqual(proof);
    expect(canCommitProof(authorizationView(proof, ports.currentApprovals()))).toMatchObject({
      ok: false,
      error: { code: "APPROVAL_REJECTED" },
    });
  });

  it("replays a successful decision key and rejects a reused key with a different request", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const input = {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "approved" as const,
      comment: "Owner exception granted.",
    };
    const first = await decideApproval(ports, context(), input);
    const replayed = await decideApproval(ports, context({ now: "2026-09-16T10:00:00.000Z" }), input);
    expect(replayed).toEqual(first);
    expect(ports.proofSnapshot()).toEqual(proof);
    const reused = await decideApproval(ports, context(), { ...input, decision: "rejected" });
    expect(reused).toMatchObject({
      httpStatus: 409,
      body: { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED" } },
    });
  });

  it("fails closed for cross-proof, cross-version, and non-approver decisions", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const crossProof = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-other",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "no",
    });
    expect(crossProof).toMatchObject({ httpStatus: 422, body: { ok: false, error: { code: "APPROVAL_IDENTITY_MISMATCH" } } });
    const crossVersion = await decideApproval(ports, context({ idempotencyKey: "decision-2" }), {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-other",
      decision: "approved",
      comment: "no",
    });
    expect(crossVersion).toMatchObject({ httpStatus: 422, body: { ok: false, error: { code: "APPROVAL_IDENTITY_MISMATCH" } } });
    const forbidden = await decideApproval(ports, context({ role: "sales", idempotencyKey: "decision-3" }), {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "no",
    });
    expect(forbidden).toMatchObject({ httpStatus: 403, body: { ok: false, error: { code: "FORBIDDEN_ROLE" } } });
    expect(ports.proofSnapshot()).toEqual(proof);
    expect(ports.currentApprovals()[0]?.status).toBe("pending");
  });

  it("rejects every non-approver role before persistence", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const input = {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "approved" as const,
      comment: "no",
    };
    for (const role of ["admin", "procurement", "warehouse", "sales", "finance", "root", ""] as const) {
      const denied = await decideApproval(ports, context({
        role: role as MutationContext["role"],
        idempotencyKey: `role-${role || "blank"}`,
      }), input);
      expect(denied).toMatchObject({ httpStatus: 403, body: { ok: false, error: { code: "FORBIDDEN_ROLE" } } });
    }
    expect(ports.currentApprovals()[0]?.status).toBe("pending");
  });

  it("does not consume a success key on a failed decision, then accepts the same key", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const failed = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-other",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "no",
    });
    expect(failed).toMatchObject({ httpStatus: 422, body: { ok: false, error: { code: "APPROVAL_IDENTITY_MISMATCH" } } });
    const succeeded = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "Owner exception granted.",
    });
    expect(succeeded).toMatchObject({ httpStatus: 200, body: { ok: true, status: "approved" } });
    expect(ports.currentApprovals()[0]?.status).toBe("approved");
  });

  it("rejects the same success key when reused against a different proof identity", async () => {
    const proof = canonicalProof();
    const ports = createMemoryPorts({ proof, approvals: [toRecord(pendingApproval())] });
    const first = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-a",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "Owner exception granted.",
    });
    expect(first).toMatchObject({ httpStatus: 200 });
    const crossProof = await decideApproval(ports, context(), {
      approvalId: "approval-owner",
      proofId: "proof-b",
      dealVersionId: "version-a",
      decision: "approved",
      comment: "Owner exception granted.",
    });
    expect(crossProof).toMatchObject({
      httpStatus: 409,
      body: { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED" } },
    });
    expect(ports.proofSnapshot()).toEqual(proof);
  });
});
