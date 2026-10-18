import type { Approval, ProofStatus } from "../domain/proof";
import type { CanonicalJsonValue } from "../domain/canonical-json";

export interface DealProofDto {
  readonly id: string;
  readonly dealId: string;
  readonly dealVersionId: string;
  readonly dealVersion: number;
  readonly status: ProofStatus;
  readonly generatedAt: string;
  readonly engineVersion: string;
  readonly canonicalizationVersion: string;
  readonly adapterVersion: string;
  readonly erpRevision: number;
  readonly snapshotHash: string;
  readonly proofHash: string;
  readonly inputHash: string;
  readonly resultHash: string;
  readonly canonicalEventHash: string;
  readonly terms: CanonicalJsonValue;
  readonly constraints: CanonicalJsonValue;
  readonly policy: CanonicalJsonValue;
  readonly cashEvents: CanonicalJsonValue;
  readonly snapshot: CanonicalJsonValue;
  readonly dependencyManifest: CanonicalJsonValue;
  readonly baseResult: CanonicalJsonValue;
  readonly stressRuns: CanonicalJsonValue;
  readonly assumptions: CanonicalJsonValue;
  readonly approvals: CanonicalJsonValue;
  readonly approvedApprovalCodes: CanonicalJsonValue;
}

export interface DealProof {
  readonly id: string;
  readonly dealId: string;
  readonly dealVersionId: string;
  readonly status: ProofStatus;
  readonly canonicalEventHash: string;
  readonly approvals: readonly Approval[];
  readonly proofHash: string;
  readonly inputHash: string;
  readonly resultHash: string;
  readonly generatedAt: string;
  readonly engineVersion: string;
  readonly canonicalizationVersion: string;
  readonly snapshotHash: string;
  readonly dto: DealProofDto;
}

export function encodeProof(proof: DealProof): DealProofDto {
  return proof.dto;
}
