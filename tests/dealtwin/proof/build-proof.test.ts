import { describe, expect, it } from "vitest";
import { compileDeal, type CompileResult } from "../../../lib/dealtwin/compiler/compile-deal";
import { sha256Canonical, type CanonicalJsonValue } from "../../../lib/dealtwin/domain/canonical-json";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import type { Approval } from "../../../lib/dealtwin/domain/proof";
import { buildSnapshot } from "../../../lib/dealtwin/erp/build-snapshot";
import { buildDealProof, type ProofBuildInput } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { CANONICALIZATION_VERSION, DEALTWIN_ENGINE_VERSION } from "../../../lib/dealtwin/proof/version";
import { createJudgeFixture } from "../fixtures/judge-scenario";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";

function pendingApproval(proofId = "proof-a", dealVersionId = "version-a"): Approval {
  return {
    id: "approval-owner",
    proofId,
    dealVersionId,
    kind: "non_arithmetic_authorization",
    status: "pending",
  };
}

function proofInput(overrides: Partial<ProofBuildInput> = {}): ProofBuildInput {
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
  return {
    proofId: "proof-a",
    dealId: "deal-a",
    version,
    snapshot: scenario.snapshot,
    constraints: scenario.constraints,
    policy: scenario.policy,
    baseResult,
    stressRuns: [{
      id: "stress-delay-receipt",
      transformType: "delay_specified_receipt",
      parameters: { days: 3, eventId: "receivable:judge-existing-so" },
      inputPayload: { eventId: "receivable:judge-existing-so", days: 3 },
      resultPayload: { outcome: "CONDITIONALLY_VALID", minimumProjectedBalanceRupiah: "5000000" },
    }],
    assumptions: [{ id: "assumption-horizon", code: "explicit_horizon", detail: "Requested horizon is 30 days from as-of." }],
    approvals: [pendingApproval()],
    approvedApprovalCodes: [],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

function built(overrides: Partial<ProofBuildInput> = {}) {
  const result = buildDealProof(proofInput(overrides));
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function hashedBody(dto: DealProofDto): CanonicalJsonValue {
  return Object.fromEntries(Object.entries(dto).filter(([key]) => key !== "proofHash"));
}

function reverseEntries(value: CanonicalJsonValue): CanonicalJsonValue {
  if (Array.isArray(value)) return value.map(reverseEntries);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseEntries(child)]));
  }
  return value;
}

describe("canonical Deal Proof builder", () => {
  it("records complete canonical proof evidence and versioned hashes", () => {
    const proof = built();
    const dto = encodeProof(proof);
    expect(dto).toMatchObject({
      id: "proof-a",
      dealId: "deal-a",
      dealVersionId: "version-a",
      dealVersion: 1,
      status: "CONDITIONALLY_VALID",
      generatedAt: GENERATED_AT,
      engineVersion: DEALTWIN_ENGINE_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      adapterVersion: "dealtwin-erp-adapter-v1",
      erpRevision: 1,
    });
    expect(dto.snapshotHash).toBe(proof.snapshotHash);
    expect(dto.canonicalEventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dto.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dto.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dto.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dto.proofHash).toBe(sha256Canonical(hashedBody(dto)));
    expect(dto).not.toHaveProperty("replayedAt");
    expect(dto.terms).toMatchObject({ schemaVersion: "dealtwin.deal-terms.v1", customerId: "judge-customer-a" });
    expect(dto.constraints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "minimum_cash_rupiah", value: "5000000" })]));
    expect(dto.policy).toMatchObject({ minimumCashRupiah: "5000000", newBorrowingAllowed: false, defaultHorizonDays: 30 });
    expect(dto.cashEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "cash-opening:judge-cash:2026-09-12", amountRupiah: "30000000" }),
      expect.objectContaining({ eventId: "payable:judge-existing-po", amountRupiah: "18000000" }),
    ]));
    expect(dto.dependencyManifest).toEqual(expect.objectContaining({
      keys: expect.arrayContaining(["query:open-ap", "query:cash", "query:stock", "erp.invoice:judge-existing-ap"]),
    }));
    expect(dto.baseResult).toMatchObject({ outcome: "CONDITIONALLY_VALID", reasonCode: "APPROVAL_REQUIRED", shortfallRupiah: null });
    expect(dto.stressRuns).toEqual([expect.objectContaining({ id: "stress-delay-receipt", transformType: "delay_specified_receipt" })]);
    expect(dto.assumptions).toEqual([expect.objectContaining({ id: "assumption-horizon", code: "explicit_horizon" })]);
    expect(dto.approvals).toEqual([expect.objectContaining({ id: "approval-owner", status: "pending", kind: "non_arithmetic_authorization" })]);
    expect(proof.canonicalEventHash).toBe(dto.canonicalEventHash);
  });

  it("preserves hashes under object-key permutation", () => {
    const dto = encodeProof(built());
    expect(sha256Canonical(reverseEntries(hashedBody(dto)))).toBe(dto.proofHash);
  });

  it("preserves hashes under cash-event, constraint, and stress-run permutation", () => {
    const baseline = built();
    const input = proofInput();
    const eventPermuted = built({ snapshot: { ...input.snapshot, cashEvents: [...input.snapshot.cashEvents].reverse() } });
    const constraintPermuted = built({ constraints: { constraints: [...input.constraints.constraints].reverse() } });
    const extraStress = { id: "stress-z", transformType: "delay_customer_receipt", parameters: { days: 7 }, inputPayload: { days: 7 }, resultPayload: { outcome: "CONDITIONALLY_VALID" } };
    const stressPermuted = built({ stressRuns: [extraStress, input.stressRuns[0]] });
    const stressSorted = built({ stressRuns: [input.stressRuns[0], extraStress] });
    expect(baseline.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect(eventPermuted.proofHash).toBe(baseline.proofHash);
    expect(constraintPermuted.proofHash).toBe(baseline.proofHash);
    expect(stressPermuted.proofHash).toBe(stressSorted.proofHash);
    expect(stressPermuted.proofHash).not.toBe(baseline.proofHash);
  });

  it("encodes bigint money as canonical decimal strings, never as JSON numbers", () => {
    const input = proofInput();
    const baseResult: CompileResult = {
      ...input.baseResult,
      shortfallRupiah: rupiah(9_007_199_254_740_993n),
      cashFloorRupiah: rupiah(9_007_199_254_740_993n),
    };
    const dto = encodeProof(built({ baseResult }));
    expect(dto.baseResult).toMatchObject({ shortfallRupiah: "9007199254740993", cashFloorRupiah: "9007199254740993" });
    expect(JSON.stringify(dto.baseResult)).not.toMatch(/9007199254740993[^"]/);
    expect(dto.terms).toMatchObject({ productLines: [expect.objectContaining({ unitPriceRupiah: "60000000" })] });
  });

  it("stamps the locked engine and canonicalization versions", () => {
    const dto = encodeProof(built());
    expect(dto.engineVersion).toBe("dealtwin-engine-v1");
    expect(dto.canonicalizationVersion).toBe("dealtwin-canonicalization-v1");
    expect(DEALTWIN_ENGINE_VERSION).toBe("dealtwin-engine-v1");
    expect(CANONICALIZATION_VERSION).toBe("dealtwin-canonicalization-v1");
  });

  it("records unresolved approvals without letting them cover a failed compile", () => {
    const scenario = createJudgeFixture();
    const failed = compileDeal({
      snapshot: scenario.snapshot,
      terms: scenario.initialTermsA,
      constraints: scenario.constraints,
      policy: scenario.policy,
      approvedApprovalCodes: [],
    });
    const version = createDealVersion({
      id: "version-a",
      dealId: "deal-a",
      version: 1,
      terms: scenario.initialTermsA,
      createdBy: "actor-a",
      createdAt: GENERATED_AT,
    });
    const dto = encodeProof(built({ version, baseResult: failed }));
    expect(failed.outcome).toBe("DOES_NOT_COMPILE");
    expect(dto.status).toBe("INVALID");
    expect(dto.baseResult).toMatchObject({
      outcome: "DOES_NOT_COMPILE",
      reasonCode: "MINIMUM_CASH_VIOLATION",
      firstViolationDate: "2026-09-22",
      shortfallRupiah: "3000000",
    });
    expect(dto.approvals).toEqual([expect.objectContaining({ status: "pending" })]);
  });

  it("changes the proof hash when an assumption changes and keeps it when assumption order is permuted", () => {
    const baseline = encodeProof(built());
    const extra = { id: "assumption-stock", code: "inventory_as_of", detail: "Available stock is taken from the snapshot." };
    const added = encodeProof(built({
      assumptions: [...proofInput().assumptions, extra],
    }));
    const permuted = encodeProof(built({
      assumptions: [extra, ...proofInput().assumptions],
    }));
    expect(added.proofHash).not.toBe(baseline.proofHash);
    expect(added.inputHash).not.toBe(baseline.inputHash);
    expect(permuted.proofHash).toBe(added.proofHash);
  });

  it("changes hashes when canonical terms, snapshot evidence, or identity change", () => {
    const scenario = createJudgeFixture();
    const baseline = encodeProof(built());
    const mutatedTerms = {
      ...scenario.candidateTermsA,
      directCostEvents: [{ ...scenario.candidateTermsA.directCostEvents[0], amountRupiah: rupiah(42_000_001n) }],
    };
    const mutatedVersion = createDealVersion({
      id: "version-a",
      dealId: "deal-a",
      version: 1,
      terms: mutatedTerms,
      createdBy: "actor-a",
      createdAt: GENERATED_AT,
    });
    const cloned = structuredClone(scenario.snapshot);
    const mutatedSnapshot = {
      ...cloned,
      obligations: cloned.obligations.map((item) => item.economicEventId === "payable:judge-existing-po"
        ? { ...item, amountRupiah: rupiah(18_000_001n) }
        : item),
      cashEvents: cloned.cashEvents.map((event) => event.eventId === "payable:judge-existing-po"
        ? { ...event, amountRupiah: rupiah(18_000_001n) }
        : event),
    };
    const mutatedResult = compileDeal({
      snapshot: scenario.snapshot,
      terms: mutatedTerms,
      constraints: scenario.constraints,
      policy: scenario.policy,
      approvedApprovalCodes: [],
    });
    const rebuilt = buildSnapshot({
      state: scenario.apMutationState,
      tenantId: scenario.tenantId,
      asOfDate: isoDate("2026-09-12"),
      requestedHorizonEnd: isoDate("2026-10-12"),
      adapterVersion: "dealtwin-erp-adapter-v1",
      commitments: [],
      self: null,
    });
    expect(rebuilt).toMatchObject({ ok: true });
    expect(encodeProof(built({ version: mutatedVersion })).proofHash).not.toBe(baseline.proofHash);
    expect(encodeProof(built({ version: mutatedVersion, baseResult: mutatedResult })).canonicalEventHash).not.toBe(baseline.canonicalEventHash);
    expect(buildDealProof(proofInput({ snapshot: mutatedSnapshot }))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_HASH_MISMATCH" } });
    if (rebuilt.ok) {
      expect(encodeProof(built({ snapshot: rebuilt.value })).proofHash).not.toBe(baseline.proofHash);
    }
    expect(encodeProof(built({ proofId: "proof-b", approvals: [pendingApproval("proof-b")] })).proofHash).not.toBe(baseline.proofHash);
    expect(encodeProof(built({
      version: createDealVersion({
        id: "version-b",
        dealId: "deal-a",
        version: 2,
        terms: scenario.candidateTermsA,
        createdBy: "actor-a",
        createdAt: GENERATED_AT,
      }),
      approvals: [pendingApproval("proof-a", "version-b")],
    })).proofHash).not.toBe(baseline.proofHash);
  });

  it("fails closed for mismatched identity, malformed input, and duplicate evidence", () => {
    expect(buildDealProof(proofInput({ approvals: [pendingApproval("proof-other")] })))
      .toMatchObject({ ok: false, error: { code: "APPROVAL_IDENTITY_MISMATCH" } });
    expect(buildDealProof(proofInput({ dealId: "deal-other" })))
      .toMatchObject({ ok: false, error: { code: "PROOF_IDENTITY_MISMATCH" } });
    expect(buildDealProof(proofInput({ proofId: " proof-a" })))
      .toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(buildDealProof(proofInput({ generatedAt: "not-a-timestamp" })))
      .toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(buildDealProof(proofInput({
      stressRuns: [proofInput().stressRuns[0], { ...proofInput().stressRuns[0] }],
    }))).toMatchObject({ ok: false, error: { code: "DUPLICATE_PROOF_EVIDENCE" } });
    const snapshot = structuredClone(proofInput().snapshot);
    expect(buildDealProof(proofInput({
      snapshot: {
        ...snapshot,
        dependencyManifest: {
          ...snapshot.dependencyManifest,
          entries: [...snapshot.dependencyManifest.entries, { ...snapshot.dependencyManifest.entries[0], contentHash: "0".repeat(64) }],
        },
      },
    }))).toMatchObject({ ok: false, error: { code: "DEPENDENCY_HASH_CONFLICT" } });
  });

  it("fails closed when encoded snapshot contents do not match the recorded stateHash", () => {
    const input = proofInput();
    const snapshot = {
      ...input.snapshot,
      cashEvents: input.snapshot.cashEvents.map((event) => event.eventId === "payable:judge-existing-po"
        ? { ...event, amountRupiah: rupiah(18_000_001n) }
        : event),
    };
    expect(buildDealProof(proofInput({ snapshot }))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_HASH_MISMATCH" } });
  });

  it("preserves proofHash when nested cash dependency order is permuted", () => {
    const input = proofInput();
    const opening = input.snapshot.cash.dependencies[0];
    const extra = { key: "erp.cash_movement:manual-a", contentHash: "a".repeat(64) };
    const left = built({ snapshot: { ...input.snapshot, cash: { ...input.snapshot.cash, dependencies: [opening, extra] } } });
    const right = built({ snapshot: { ...input.snapshot, cash: { ...input.snapshot.cash, dependencies: [extra, opening] } } });
    expect(left.proofHash).toBe(right.proofHash);
  });

  it("rejects pending approvals on a COMPILES proof and omitted approvals on a conditional proof", () => {
    const scenario = createJudgeFixture();
    const compiles = compileDeal({
      snapshot: scenario.snapshot,
      terms: scenario.candidateTermsA,
      constraints: scenario.constraints,
      policy: scenario.policy,
      approvedApprovalCodes: ["owner_commercial_exception"],
    });
    expect(compiles.outcome).toBe("COMPILES");
    expect(buildDealProof(proofInput({
      baseResult: compiles,
      approvedApprovalCodes: ["owner_commercial_exception"],
      approvals: [pendingApproval()],
    }))).toMatchObject({ ok: false, error: { code: "APPROVAL_STATE_INVALID" } });
    expect(encodeProof(built({
      baseResult: compiles,
      approvedApprovalCodes: ["owner_commercial_exception"],
      approvals: [],
    })).status).toBe("VALID");
    expect(buildDealProof(proofInput({ approvals: [] }))).toMatchObject({ ok: false, error: { code: "APPROVAL_STATE_INVALID" } });
  });
});
