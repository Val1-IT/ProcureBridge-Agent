import { compileDeal, type CompileInput, type CompileResult } from '../compiler/compile-deal';
import type { DealTermsV1 } from '../domain/deal-terms';
import { validateConstraints, type ConstraintSet, type CommercialConstraint } from '../domain/constraint';
import { runStressLab, type StressRun } from '../stress/run-stress-lab';
import { enumerateAmendments, type AmendmentPolicy } from './search-space';
import { canonicalizeDealTermsV1 } from '../domain/deal-terms';
import { sha256Canonical, type CanonicalJsonValue } from '../domain/canonical-json';

export interface AmendmentCandidate {
  readonly terms: DealTermsV1;
  readonly constraints: ConstraintSet;
  readonly baseResult: CompileResult;
  readonly stressRuns: readonly StressRun[];
  readonly changedFields: readonly string[];
  readonly score: readonly [number,number,number,number,number,string];
  readonly termsHash: string;
}
export type AmendmentSearchResult = { readonly outcome: 'AMENDMENT_FOUND'; readonly candidate: AmendmentCandidate; readonly evaluatedCandidates: number; readonly feasibleCandidates: number }
  | { readonly outcome: 'NO_FEASIBLE_AMENDMENT'; readonly evaluatedCandidates: number; readonly feasibleCandidates: 0 };

export function findSmallestAmendment(input: CompileInput, policy: AmendmentPolicy): AmendmentSearchResult {
  const feasible: AmendmentCandidate[] = []; let evaluatedCandidates = 0;
  const eligible = (result: CompileResult) => result.outcome === 'COMPILES' || result.outcome === 'CONDITIONALLY_VALID';
  for (const point of enumerateAmendments(input.terms,policy)) {
    evaluatedCandidates++;
    const requirements: CommercialConstraint[] = [...input.constraints.constraints];
    if (point.supplierDelta > 0) {
      const code = policy.supplierApprovalCode ?? 'supplier_timing_exception';
      if (!requirements.some(row => row.kind==='required_approval' && row.value.approvalCode===code)) requirements.push({
        id: `amendment:approval:${sha256Canonical({ code })}`, kind: 'required_approval', operator: 'eq', value: { approvalCode: code },
        resolution: 'confirmed', provenance: 'erp_policy', sourceText: 'Non-arithmetic supplier authorization over fixed proposed payment timing',
      });
    }
    const constraints = validateConstraints(requirements); if (!constraints.ok) throw new Error('INVALID_AMENDMENT_POLICY');
    const proposed = { ...input, terms: point.terms, constraints: constraints.value };
    const baseResult = compileDeal(proposed); if (!eligible(baseResult)) continue;
    const stressRuns = runStressLab(proposed,policy.requiredStressScenarios); if (stressRuns.some(run => !eligible(run.result))) continue;
    const changedFields = [point.depositDelta>0 ? 'deposit_basis_points' : null, point.customerDelta>0 ? 'customer_balance_timing' : null,
      point.supplierDelta>0 ? 'supplier_payment_timing' : null].filter((field): field is string => field !== null);
    const termsHash = sha256Canonical(canonicalizeDealTermsV1(point.terms) as unknown as CanonicalJsonValue);
    feasible.push({ terms: point.terms, constraints: constraints.value, baseResult, stressRuns, changedFields, termsHash,
      score: [changedFields.length, point.depositDelta/100+point.customerDelta+point.supplierDelta, point.depositDelta, point.customerDelta, point.supplierDelta, termsHash] });
  }
  feasible.sort((a,b) => { for (let i=0;i<5;i++) if (a.score[i]!==b.score[i]) return (a.score[i] as number)-(b.score[i] as number);
    return a.termsHash < b.termsHash ? -1 : a.termsHash > b.termsHash ? 1 : 0; });
  return feasible.length > 0 ? { outcome: 'AMENDMENT_FOUND', candidate: structuredClone(feasible[0]!), evaluatedCandidates, feasibleCandidates: feasible.length }
    : { outcome: 'NO_FEASIBLE_AMENDMENT', evaluatedCandidates, feasibleCandidates: 0 };
}
