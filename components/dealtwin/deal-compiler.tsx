import type { ReactElement } from 'react';
import type { CompileResultDto } from '../../lib/dealtwin/ui/contracts';
import { formatRupiah } from './format';
export function DealCompiler({result}:{result:CompileResultDto}):ReactElement {
 const failures=result.evaluations.filter(row=>row.status==='fail');
 return <section className="dt-panel" aria-labelledby="compiler-heading"><div className="dt-panel-heading"><h2 id="compiler-heading">Deal Compiler</h2><span className={'dt-outcome dt-'+result.outcome.toLowerCase()} data-testid="compile-outcome">{result.outcome}</span></div>
  <p className="dt-muted">Deterministic server compile. Planning outcomes are not bank transfers or a guarantee of receipt.</p>
  <div className="dt-metrics"><div><span>Projected minimum</span><strong data-testid="projected-minimum">{formatRupiah(result.timeline?.minimumProjectedBalance)}</strong></div><div><span>Confirmed minimum</span><strong>{formatRupiah(result.timeline?.minimumConfirmedBalance)}</strong></div>
   <div><span>Cash floor</span><strong>{formatRupiah(result.cashFloorRupiah)}</strong></div><div><span>Shortfall</span><strong data-testid="shortfall">{formatRupiah(result.shortfallRupiah)}</strong></div></div>
  <dl className="dt-facts"><div><dt>Reason</dt><dd>{result.reasonCode??'No violation'}</dd></div><div><dt>First violation</dt><dd data-testid="first-violation">{result.firstViolationDate??'None'}</dd></div><div><dt>Horizon</dt><dd>{result.effectiveHorizonEnd}{result.horizonExpanded?' · expanded':''}</dd></div></dl>
  {result.unresolvedConstraintIds.length>0?<div className="dt-warning"><h3>Required confirmation / approval</h3><ul>{result.unresolvedConstraintIds.map(id=><li key={id}>{id}</li>)}</ul></div>:null}
  {result.conflictingCommitmentIds.length>0?<div className="dt-warning"><h3>LIQUIDITY_COLLISION · occupied owners</h3><ul>{result.conflictingCommitmentIds.map(id=><li key={id}>{id}</li>)}</ul></div>:null}
  {failures.length>0?<div className="dt-warning" data-testid="constraint-failures"><h3>Failed constraints</h3><ul>{failures.map(row=><li key={row.constraintId}><strong>{row.constraintId}</strong><dl className="dt-facts">
   <div><dt>Constraint kind</dt><dd>{row.kind}</dd></div><div><dt>Reason</dt><dd>{row.reasonCode??'Not reported'}</dd></div>
   <div><dt>Failure date</dt><dd>{row.violationDate??'Not reported'}</dd></div><div><dt>Cash shortfall</dt><dd>{row.shortfallRupiah===null?'Not reported':formatRupiah(row.shortfallRupiah)}</dd></div>
  </dl></li>)}</ul></div>:null}
  <details><summary>Constraint evidence</summary><table className="dt-table"><thead><tr><th>Constraint</th><th>Status</th><th>Reason</th></tr></thead><tbody>{result.evaluations.map(row=><tr key={row.constraintId}><td>{row.constraintId}</td><td>{row.status}</td><td>{row.reasonCode??'—'}</td></tr>)}</tbody></table></details>
 </section>;
}
