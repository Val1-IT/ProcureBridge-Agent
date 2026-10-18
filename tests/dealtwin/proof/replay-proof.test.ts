import { describe, expect, it } from "vitest";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { sha256Canonical, type CanonicalJsonValue } from "../../../lib/dealtwin/domain/canonical-json";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import type { Approval } from "../../../lib/dealtwin/domain/proof";
import { hashCanonicalSnapshotState } from "../../../lib/dealtwin/erp/build-snapshot";
import { buildDealProof, type ProofBuildInput } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof, type DealProofDto } from "../../../lib/dealtwin/proof/proof-dto";
import { replayProof } from "../../../lib/dealtwin/proof/replay-proof";
import { createJudgeFixture } from "../fixtures/judge-scenario";

const GENERATED_AT = "2026-09-16T08:00:00.000Z";
const HEX = /^[0-9a-f]{64}$/;

function pendingApproval(proofId = "proof-a", dealVersionId = "version-a"): Approval {
  return { id: "approval-owner", proofId, dealVersionId, kind: "non_arithmetic_authorization", status: "pending" };
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

function canonicalProof(): DealProofDto {
  const result = buildDealProof(proofInput());
  if (!result.ok) throw new Error(result.error.message);
  return encodeProof(result.value);
}

function hashedBody(dto: DealProofDto): CanonicalJsonValue {
  return Object.fromEntries(Object.entries(dto).filter(([key]) => key !== "proofHash"));
}

function seal(dto: Omit<DealProofDto, "proofHash"> & { readonly proofHash?: string }): DealProofDto {
  const body = hashedBody(dto as DealProofDto);
  return { ...dto, proofHash: sha256Canonical(body) };
}

function reverseEntries(value: CanonicalJsonValue): CanonicalJsonValue {
  if (Array.isArray(value)) return value.map(reverseEntries);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseEntries(child)]));
  }
  return value;
}

function record(value: CanonicalJsonValue): Record<string, CanonicalJsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
  return value as Record<string, CanonicalJsonValue>;
}

describe("replayProof", () => {
  it("invokes the compiler and matches the stored result hash", () => {
    const dto = canonicalProof();
    const original = structuredClone(dto);
    let invocations = 0;
    const spy = ((input: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(input);
    }) as typeof compileDeal;
    const first = replayProof(dto, spy);
    const second = replayProof(dto, compileDeal);
    expect(invocations).toBe(1);
    expect(first).toMatchObject({
      ok: true,
      value: { resultHash: dto.resultHash, recomputedResultHash: dto.resultHash, proofHash: dto.proofHash },
    });
    expect(second).toEqual(first);
    expect(dto).toEqual(original);
    expect(dto).not.toHaveProperty("replayedAt");
  });

  it("preserves success under object-key permutation", () => {
    const dto = canonicalProof();
    expect(replayProof(reverseEntries(dto as unknown as CanonicalJsonValue) as unknown as DealProofDto))
      .toMatchObject({ ok: true, value: { resultHash: dto.resultHash } });
  });

  it("rejects unsupported engine, canonicalization, and adapter versions without invoking the compiler", () => {
    const dto = canonicalProof();
    let invocations = 0;
    const spy = ((input: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(input);
    }) as typeof compileDeal;
    expect(replayProof(seal({ ...dto, engineVersion: "dealtwin-engine-v0" }), spy))
      .toMatchObject({ ok: false, error: { code: "UNSUPPORTED_ENGINE_VERSION" } });
    expect(replayProof(seal({ ...dto, canonicalizationVersion: "dealtwin-canonicalization-v0" })))
      .toMatchObject({ ok: false, error: { code: "UNSUPPORTED_ENGINE_VERSION" } });
    expect(replayProof(seal({ ...dto, adapterVersion: "dealtwin-erp-adapter-v0" })))
      .toMatchObject({ ok: false, error: { code: "UNSUPPORTED_ENGINE_VERSION" } });
    expect(invocations).toBe(0);
  });

  it("fails closed on malformed identity, hash, timestamp, and bigint payload", () => {
    const dto = canonicalProof();
    expect(replayProof({ ...dto, id: " proof-a" })).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(replayProof({ ...dto, generatedAt: "2026-09-16 08:00:00" })).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(replayProof({ ...dto, proofHash: "0x" + "a".repeat(64) })).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(replayProof({ ...dto, inputHash: "A".repeat(64) })).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(replayProof({ ...dto, resultHash: "a".repeat(63) })).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    const snapshot = record(structuredClone(dto.snapshot));
    snapshot.openingBalanceRupiah = "+30000000";
    expect(replayProof(seal({ ...dto, snapshot }))).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
    expect(replayProof({ ...dto, terms: null })).toMatchObject({ ok: false, error: { code: "INVALID_PROOF" } });
  });

  it("detects isolated hash tampering", () => {
    const dto = canonicalProof();
    expect(replayProof({ ...dto, proofHash: "b".repeat(64) })).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof(seal({ ...dto, inputHash: "b".repeat(64) }))).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof(seal({ ...dto, resultHash: "b".repeat(64) }))).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof(seal({ ...dto, snapshotHash: "b".repeat(64) }))).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof(seal({ ...dto, canonicalEventHash: "b".repeat(64) }))).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    const snapshot = record(structuredClone(dto.snapshot));
    snapshot.stateHash = "b".repeat(64);
    expect(replayProof(seal({ ...dto, snapshot, snapshotHash: sha256Canonical(snapshot) })))
      .toMatchObject({ ok: false, error: { code: "SNAPSHOT_HASH_MISMATCH" } });
  });

  it("detects a payload change that only reseals snapshotHash", () => {
    const dto = canonicalProof();
    const snapshot = record(structuredClone(dto.snapshot));
    const obligations = snapshot.obligations;
    if (!Array.isArray(obligations)) throw new Error("obligations");
    snapshot.obligations = obligations.map((item) => {
      const row = record(item);
      return row.economicEventId === "payable:judge-existing-po" ? { ...row, amountRupiah: "18000001" } : row;
    });
    const events = snapshot.cashEvents;
    if (!Array.isArray(events)) throw new Error("cashEvents");
    snapshot.cashEvents = events.map((item) => {
      const row = record(item);
      return row.eventId === "payable:judge-existing-po" ? { ...row, amountRupiah: "18000001" } : row;
    });
    const resealedSnapshotHash = sha256Canonical(snapshot);
    expect(replayProof(seal({ ...dto, snapshot, snapshotHash: resealedSnapshotHash })))
      .toMatchObject({ ok: false, error: { code: "SNAPSHOT_HASH_MISMATCH" } });
  });

  it("detects a sealed recorded-result forgery after genuine recompute", () => {
    const dto = canonicalProof();
    const baseResult = { ...record(dto.baseResult), outcome: "COMPILES", reasonCode: null, shortfallRupiah: null };
    const stressRuns = dto.stressRuns;
    if (!Array.isArray(stressRuns)) throw new Error("stressRuns");
    const resultHash = sha256Canonical({
      baseResult,
      stressResults: stressRuns.map((run) => {
        const row = record(run);
        return { id: row.id, resultPayload: row.resultPayload };
      }),
    });
    let invocations = 0;
    const spy = ((input: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(input);
    }) as typeof compileDeal;
    const forged = seal({ ...dto, status: "VALID", baseResult, resultHash });
    expect(forged.proofHash).toMatch(HEX);
    expect(replayProof(forged, spy)).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(invocations).toBe(1);
  });

  it("detects material identity and evidence mutations that are not resealed", () => {
    const dto = canonicalProof();
    expect(replayProof({ ...dto, dealId: "deal-other" })).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof({ ...dto, dealVersionId: "version-other" })).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof({ ...dto, generatedAt: "2026-09-16T08:00:01.000Z" })).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(replayProof({ ...dto, engineVersion: "dealtwin-engine-v1" })).toMatchObject({
      ok: true,
    });
  });

  it("returns INVALID_PROOF for hostile top-level DTO shapes instead of throwing", () => {
    const dto = canonicalProof();
    let invocations = 0;
    const spy = ((input: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(input);
    }) as typeof compileDeal;
    const cycle: Record<string, unknown> = { ...dto };
    cycle.loop = cycle;
    const hostiles: unknown[] = [
      null,
      undefined,
      [],
      "proof",
      1,
      { ...dto, extra: 1.5 },
      { ...dto, extra: undefined },
      { ...dto, extra: new Date(GENERATED_AT) },
      cycle,
    ];
    for (const hostile of hostiles) {
      expect(() => replayProof(hostile as DealProofDto, spy)).not.toThrow();
      expect(replayProof(hostile as DealProofDto, spy)).toMatchObject({
        ok: false,
        error: { code: "INVALID_PROOF" },
      });
    }
    expect(invocations).toBe(0);
  });

  it("rejects malformed dealVersion values before compilation", () => {
    const dto = canonicalProof();
    let invocations = 0;
    const spy = ((input: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(input);
    }) as typeof compileDeal;
    const malformed: unknown[] = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1"];
    for (const dealVersion of malformed) {
      expect(replayProof({ ...dto, dealVersion } as DealProofDto, spy)).toMatchObject({
        ok: false,
        error: { code: "INVALID_PROOF" },
      });
    }
    expect(invocations).toBe(0);
  });

  it("rejects additional non-canonical money encodings", () => {
    const dto = canonicalProof();
    const encodings = ["", " ", " 100", "100 ", "+100", "1e3", "1.0", "1.5", "NaN", "Infinity", "--1", "01"];
    for (const openingBalanceRupiah of encodings) {
      const snapshot = { ...record(structuredClone(dto.snapshot)), openingBalanceRupiah };
      expect(replayProof(seal({ ...dto, snapshot }))).toMatchObject({
        ok: false,
        error: { code: "INVALID_PROOF" },
      });
    }
  });

  it("does not mutate the stored DTO when an injected compiler mutates reconstructed inputs", () => {
    const dto = canonicalProof();
    const original = structuredClone(dto);
    Object.freeze(dto);
    const mutating = ((input: Parameters<typeof compileDeal>[0]) => {
      const mutableSnapshot = input.snapshot as { tenantId: string };
      mutableSnapshot.tenantId = "mutated-tenant";
      return compileDeal(input);
    }) as typeof compileDeal;
    const result = replayProof(dto, mutating);
    expect(result.ok).toBe(false);
    expect(dto).toEqual(original);
  });

  it("rejects a fully resealed recorded-result forgery including reason, shortfall, and evaluations", () => {
    const dto = canonicalProof();
    const evaluations = dto.baseResult && typeof dto.baseResult === "object" && !Array.isArray(dto.baseResult)
      ? record(dto.baseResult).evaluations
      : null;
    if (!Array.isArray(evaluations)) throw new Error("evaluations");
    const baseResult = {
      ...record(dto.baseResult),
      reasonCode: "OWNER_EXCEPTION_REQUIRED",
      shortfallRupiah: "1",
      firstViolationDate: "2099-01-01",
      evaluations: evaluations.map((item) => ({ ...record(item), status: "fail" })),
    };
    const stressRuns = dto.stressRuns;
    if (!Array.isArray(stressRuns)) throw new Error("stressRuns");
    const resultHash = sha256Canonical({
      baseResult,
      stressResults: stressRuns.map((run) => {
        const row = record(run);
        return { id: row.id, resultPayload: row.resultPayload };
      }),
    });
    let invocations = 0;
    const spy = ((input: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(input);
    }) as typeof compileDeal;
    expect(replayProof(seal({ ...dto, baseResult, resultHash }), spy)).toMatchObject({
      ok: false,
      error: { code: "REPLAY_MISMATCH" },
    });
    expect(invocations).toBe(1);
  });

  it("rejects a fully resealed snapshot change that leaves the recorded compile result stale", () => {
    const input = proofInput();
    const cashEvents = input.snapshot.cashEvents.map((item) => (
      item.eventId === "payable:judge-existing-po"
        ? { ...item, amountRupiah: item.amountRupiah + 1n as typeof item.amountRupiah }
        : item
    ));
    const snapshot = {
      ...input.snapshot,
      cashEvents,
      stateHash: hashCanonicalSnapshotState({ ...input.snapshot, cashEvents }),
    };
    const forged = buildDealProof({ ...input, snapshot, baseResult: input.baseResult });
    if (!forged.ok) throw new Error(forged.error.message);
    const dto = encodeProof(forged.value);
    let invocations = 0;
    const spy = ((compileInput: Parameters<typeof compileDeal>[0]) => {
      invocations += 1;
      return compileDeal(compileInput);
    }) as typeof compileDeal;
    expect(replayProof(dto, spy)).toMatchObject({ ok: false, error: { code: "REPLAY_MISMATCH" } });
    expect(invocations).toBe(1);
  });
});
