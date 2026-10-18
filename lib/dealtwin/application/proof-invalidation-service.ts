import type { TransactionScopedRepositories } from './ports';
import type { DependencyChange } from '../erp/dependency-manifest';
import { QUERY_ACTIVE_COMMITMENTS_KEY, commitmentIdFromDependencyKey } from '../erp/dependency-keys';

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.trim() === value;
const hash = (value: unknown): boolean => value === null || (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value));

export class ProofInvalidationService {
  async afterErpMutation(repositories: TransactionScopedRepositories, change: DependencyChange): Promise<readonly string[]> {
    const invalid = () => { throw new Error('INVALID_DEPENDENCY_CHANGE'); };
    if (!text(change.tenantId) || !Number.isSafeInteger(change.priorRevision) || change.priorRevision < 0
      || !Number.isSafeInteger(change.currentRevision) || change.currentRevision !== change.priorRevision + 1
      || !Array.isArray(change.changes) || !Array.isArray(change.selfCapacityKeys)) invalid();
    if (change.self && (!text(change.self.proofId) || !text(change.self.dealVersionId)
      || !hash(change.self.canonicalEventHash) || change.self.canonicalEventHash === null)) invalid();
    const byKey = new Map<string, DependencyChange['changes'][number]>();
    for (const item of change.changes) {
      if (!text(item.key) || !hash(item.beforeHash) || !hash(item.afterHash)) invalid();
      const prior = byKey.get(item.key);
      if (prior && (prior.beforeHash !== item.beforeHash || prior.afterHash !== item.afterHash)) invalid();
      byKey.set(item.key, item);
    }
    const changes = [...byKey.values()].filter(item => item.beforeHash !== item.afterHash)
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    // Only capacity can be exempted, never cash, stock, invoices or other ERP changes.
    const selfCapacityKeys = change.self ? [...new Set(change.selfCapacityKeys.filter(key =>
      key === QUERY_ACTIVE_COMMITMENTS_KEY || commitmentIdFromDependencyKey(key) !== null))] : [];
    if (changes.length === 0) return [];
    return repositories.invalidate({ ...change, changes, selfCapacityKeys }, change.self);
  }
}
