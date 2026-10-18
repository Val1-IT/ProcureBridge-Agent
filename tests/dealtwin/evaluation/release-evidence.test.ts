import { describe, expect, it } from "vitest";
import {
  evaluateReleaseGate,
  verifyEvidencePacket,
  type ReleaseEvidence,
  type TraceabilityRequirement,
} from "../../../evaluation/dealtwin/release-gate";

const candidateSha = "a".repeat(40);
// Independent literal inventory: don't derive expected coverage from the validator.
const dtIds = [
  "DT-001", "DT-002", "DT-003", "DT-004", "DT-005", "DT-006", "DT-007",
  "DT-008", "DT-009", "DT-010", "DT-011", "DT-012", "DT-013", "DT-014",
  "DT-015", "DT-016", "DT-017", "DT-018", "DT-019", "DT-020", "DT-021",
  "DT-022", "DT-023", "DT-024", "DT-025", "DT-026", "DT-027", "DT-028",
  "DT-029", "DT-030", "DT-031", "DT-032", "DT-033", "DT-034", "DT-035",
  "DT-036", "DT-037", "DT-038", "DT-039", "DT-040", "DT-041", "DT-042",
];
const baseChecks = [
  "dependency_audit", "migration_restore", "rls", "cross_tenant_api", "secret_scan",
  "typecheck", "lint", "tests", "coverage", "build", "authenticated_judge_smoke",
  "tls", "least_privilege", "backup_restore",
];
const requirementCheck = (id: string) => id.toLowerCase().replace("-", "_");
const requirements = (): TraceabilityRequirement[] =>
  dtIds.map(id => ({ id, requiredCheckIds: [requirementCheck(id)] }));
const packet = (): ReleaseEvidence => ({
  candidateSha,
  checks: [...baseChecks, ...dtIds.map(requirementCheck)].map(id => ({
    id, status: "pass", testedSha: candidateSha, artifactRef: `artifacts/${id}.json`,
  })),
});

describe("Task29 complete exact-candidate traceability evidence", () => {
  it("accepts a complete passing 42-requirement packet without mutation", () => {
    const evidence = packet(), mapping = requirements();
    const before = structuredClone({ evidence, mapping });
    expect(verifyEvidencePacket(evidence, mapping)).toEqual({ ready: true, blockingReasons: [] });
    expect({ evidence, mapping }).toEqual(before);
  });

  it.each(dtIds)("blocks missing evidence for %s even when the base gate passes", id => {
    const evidence = { ...packet(), checks: packet().checks.filter(row => row.id !== requirementCheck(id)) };
    expect(evaluateReleaseGate(evidence).ready).toBe(true);
    const result = verifyEvidencePacket(evidence, requirements());
    expect(result.ready).toBe(false);
    expect(result.blockingReasons).toContain(`MISSING_REQUIREMENT_EVIDENCE:${id}:${requirementCheck(id)}`);
  });

  it.each(["fail", "skipped"] as const)("blocks %s required evidence", status => {
    const evidence = { ...packet(), checks: packet().checks.map(row =>
      row.id === "dt_001" ? { ...row, status } : row) };
    expect(verifyEvidencePacket(evidence, requirements()).ready).toBe(false);
  });

  it("blocks mismatched SHA, duplicate checks and failed dependency audit", () => {
    for (const evidence of [
      { ...packet(), checks: packet().checks.map(row => row.id === "dt_001" ? { ...row, testedSha: "b".repeat(40) } : row) },
      { ...packet(), checks: [...packet().checks, packet().checks[0]!] },
      { ...packet(), checks: packet().checks.map(row => row.id === "dependency_audit" ? { ...row, status: "fail" as const } : row) },
    ]) expect(verifyEvidencePacket(evidence, requirements()).ready).toBe(false);
  });

  it("requires all 42 distinct locked IDs, not an empty or shortened policy", () => {
    for (const mapping of [[], requirements().slice(1), [...requirements(), requirements()[0]!],
      requirements().map((row, i) => i === 0 ? requirements()[1]! : row),
      requirements().map((row, i) => i === 0 ? { ...row, id: "DT-043" } : row),
    ]) expect(verifyEvidencePacket(packet(), mapping).ready).toBe(false);
  });

  it("rejects vacuous, duplicate or malformed per-requirement check policies", () => {
    for (const change of [
      { requiredCheckIds: [] }, { requiredCheckIds: ["dt_001", "dt_001"] },
      { requiredCheckIds: ["Bad check"] }, { requiredCheckIds: ["dt_001\n"] },
      { id: "DT-001\n" }, { unexpected: true },
    ]) {
      const mapping = requirements().map((row, i) => i === 0 ? { ...row, ...change } : row);
      expect(verifyEvidencePacket(packet(), mapping).ready).toBe(false);
    }
  });

  it("requires every mapped check, not just the first or an unrelated passing check", () => {
    const mapping = requirements().map((row, i) => i === 0
      ? { ...row, requiredCheckIds: ["dt_001", "additional_required"] } : row);
    expect(verifyEvidencePacket(packet(), mapping).ready).toBe(false);
  });

  it.each([null, undefined, {}, "all passed", [null]])("fails closed for malformed requirement policy %#", value => {
    expect(verifyEvidencePacket(packet(), value as unknown as TraceabilityRequirement[]).ready).toBe(false);
  });

  it.each([null, {}, { candidateSha, checks: [] }])("fails closed for malformed evidence %#", value => {
    expect(verifyEvidencePacket(value as ReleaseEvidence, requirements()).ready).toBe(false);
  });

  it.each(["\n", "\r", "\u2028", "\u2029"])("rejects final line terminators in exact candidate metadata %#", ending => {
    const malformedSha = candidateSha + ending;
    for (const evidence of [
      { candidateSha: malformedSha, checks: packet().checks.map(row => ({ ...row, testedSha: malformedSha })) },
      { ...packet(), checks: packet().checks.map(row => ({ ...row, artifactRef: row.artifactRef + ending })) },
      { candidateSha: "0".repeat(40) + ending, checks: packet().checks.map(row => ({ ...row, testedSha: "0".repeat(40) + ending })) },
    ]) expect(verifyEvidencePacket(evidence, requirements()).ready).toBe(false);
  });

  it("rejects a bare all-zero SHA and unsafe artifact traversal", () => {
    for (const evidence of [
      { candidateSha: "0".repeat(40), checks: packet().checks.map(row => ({ ...row, testedSha: "0".repeat(40) })) },
      { ...packet(), checks: packet().checks.map(row => ({ ...row, artifactRef: "artifacts/../private.json" })) },
    ]) expect(verifyEvidencePacket(evidence, requirements()).ready).toBe(false);
  });
});
