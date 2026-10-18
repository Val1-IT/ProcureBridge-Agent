import { describe, expect, it } from 'vitest';
import { validateCommitmentApproval } from '../../../lib/dealtwin/application/commitment-service';
import type { DealProof } from '../../../lib/dealtwin/domain/proof';
const proof: DealProof = { id: 'proof', dealId: 'deal', dealVersionId: 'version', status: 'CONDITIONALLY_VALID', canonicalEventHash: 'a'.repeat(64),
  approvals: [{ id: 'approval', proofId: 'proof', dealVersionId: 'version', kind: 'non_arithmetic_authorization', status: 'pending' }] };
describe('commitment approval gates over fixed terms', () => {
  it('allows pending non-arithmetic reserve but blocks commit', () => {
    expect(validateCommitmentApproval(proof, 'reserve').ok).toBe(true);
    expect(validateCommitmentApproval(proof, 'commit')).toMatchObject({ ok: false, error: { code: 'APPROVAL_REQUIRED' } });
  });
  it.each(['STALE', 'INVALID'] as const)('blocks non-current %s proof', status => {
    expect(validateCommitmentApproval({ ...proof, status }, 'reserve')).toMatchObject({ ok: false, error: { code: 'PROOF_NOT_CURRENT' } });
  });
  it('does not reserve unresolved arithmetic or rejected authorization', () => {
    expect(validateCommitmentApproval({ ...proof, approvals: [{ ...proof.approvals[0]!, kind: 'arithmetic_uncertainty' }] }, 'reserve'))
      .toMatchObject({ ok: false, error: { code: 'ARITHMETIC_UNCERTAINTY' } });
    expect(validateCommitmentApproval({ ...proof, approvals: [{ ...proof.approvals[0]!, status: 'rejected' }] }, 'commit'))
      .toMatchObject({ ok: false, error: { code: 'APPROVAL_REJECTED' } });
  });
  it('requires exact approval identity and permits approved fixed authorization', () => {
    expect(validateCommitmentApproval({ ...proof, approvals: [{ ...proof.approvals[0]!, dealVersionId: 'other' }] }, 'reserve'))
      .toMatchObject({ ok: false, error: { code: 'APPROVAL_IDENTITY_MISMATCH' } });
    expect(validateCommitmentApproval({ ...proof, approvals: [{ ...proof.approvals[0]!, status: 'approved' }] }, 'commit').ok).toBe(true);
  });
});
