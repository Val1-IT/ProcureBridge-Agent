import { describe, expect, it } from 'vitest';
import { ProofInvalidationService } from '../../../lib/dealtwin/application/proof-invalidation-service';
import type { TransactionScopedRepositories } from '../../../lib/dealtwin/application/ports';
import type { DependencyChange } from '../../../lib/dealtwin/erp/dependency-manifest';
import { dependencyKey } from '../../../lib/dealtwin/erp/dependency-manifest';

const hash = 'a'.repeat(64); const nextHash = 'b'.repeat(64);
function fixture() {
  const rows = [{ id: 'a', version: 'va', hash, keys: ['query:cash','query:active-commitments'], status: 'VALID' },
    { id: 'b', version: 'vb', hash, keys: ['query:cash','query:active-commitments'], status: 'CONDITIONALLY_VALID' },
    { id: 'unrelated', version: 'vc', hash, keys: ['erp.invoice:other'], status: 'VALID' }];
  const repos: TransactionScopedRepositories = {
    proofs: { getById: async () => null }, approvals: { getById: async () => null, listByProofVersion: async () => [], save: async () => { throw new Error('No approval write authorized'); } },
    receipts: { findSuccess: async () => null, appendSuccess: async () => { throw new Error('No operation receipt authorized'); } },
    invalidate: async (change, self) => {
      const affected: string[] = [];
      for (const row of rows) {
        const owner = self?.proofId === row.id && self.dealVersionId === row.version && self.canonicalEventHash === row.hash;
        const material = change.changes.filter(item => item.beforeHash !== item.afterHash && row.keys.includes(item.key));
        if (material.some(item => !owner || !change.selfCapacityKeys.includes(item.key))) { row.status = 'STALE'; affected.push(row.id); }
      }
      return affected;
    },
  };
  return { rows, repos };
}
function change(key = 'query:cash', overrides: Partial<DependencyChange> = {}): DependencyChange {
  return { tenantId: 'tenant-a', priorRevision: 1, currentRevision: 2,
    changes: [{ key: dependencyKey(key), beforeHash: hash, afterHash: nextHash }], self: null, selfCapacityKeys: [], ...overrides };
}
describe('transaction-local invalidation service materiality and owner bounds', () => {
  it('stales intersecting proofs but retains unrelated ones', async () => {
    const { rows, repos } = fixture(); expect(await new ProofInvalidationService().afterErpMutation(repos, change())).toEqual(['a','b']);
    expect(rows.map(row => row.status)).toEqual(['STALE','STALE','VALID']);
  });
  it('does not stale on an equal content hash even after a revision advance', async () => {
    const { rows, repos } = fixture(); expect(await new ProofInvalidationService().afterErpMutation(repos, change('query:cash', { changes: [{ key: dependencyKey('query:cash'), beforeHash: hash, afterHash: hash }] }))).toEqual([]);
    expect(rows.map(row => row.status)).toEqual(['VALID','CONDITIONALLY_VALID','VALID']);
  });
  it('never treats a material ERP key as an exempt self-capacity key', async () => {
    const { rows, repos } = fixture(); expect(await new ProofInvalidationService().afterErpMutation(repos, change('query:cash', {
      self: { proofId: 'a', dealVersionId: 'va', canonicalEventHash: hash }, selfCapacityKeys: [dependencyKey('query:cash')] }))).toEqual(['a','b']);
    expect(rows[0]!.status).toBe('STALE');
  });
  it('preserves an exact owner capacity exemption while staling its external observer', async () => {
    const { rows, repos } = fixture(); expect(await new ProofInvalidationService().afterErpMutation(repos, change('query:active-commitments', {
      self: { proofId: 'a', dealVersionId: 'va', canonicalEventHash: hash }, selfCapacityKeys: [dependencyKey('query:active-commitments')] }))).toEqual(['b']);
    expect(rows.map(row => row.status)).toEqual(['VALID','STALE','VALID']);
  });
  it.each([{ currentRevision: 1 }, { priorRevision: -1 }, { currentRevision: 3 }, { changes: [{ key: dependencyKey('query:cash'), beforeHash: hash, afterHash: 'bad-hash' }] }])('rejects invalid change metadata before mutating proof state (%j)', async invalid => {
    const { rows, repos } = fixture(); await expect(new ProofInvalidationService().afterErpMutation(repos, change('query:cash', invalid))).rejects.toThrow('INVALID_DEPENDENCY_CHANGE');
    expect(rows.map(row => row.status)).toEqual(['VALID','CONDITIONALLY_VALID','VALID']);
  });
});
