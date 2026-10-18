import type { ReactElement } from 'react';
import type { ProofPresentation } from '../../lib/dealtwin/ui/contracts';
import { DealCompiler } from './deal-compiler';
import type { CompileResultDto } from '../../lib/dealtwin/ui/contracts';
export function ProofView({proof,currentStatus,staleReason,replay}:ProofPresentation):ReactElement {
 const approvals=proof.approvals as unknown as readonly {id:string;kind:string;status:string;requirementCode?:string}[];
 const assumptions=proof.assumptions as unknown as readonly {id:string;code:string;detail:string}[];
 return <section className="dt-panel" aria-labelledby="proof-heading"><div className="dt-panel-heading"><h2 id="proof-heading">Deal Proof</h2><span className="dt-badge" data-testid="proof-current-status">Current: {currentStatus??proof.status}</span></div>
  <p className="dt-muted">Historical inputs are immutable. Current metadata and live approvals may have changed.</p>
  {staleReason?<div className="dt-warning" role="status"><strong>PROOF_STALE · changed dependencies</strong><p>{staleReason}</p></div>:null}
  <dl className="dt-facts"><div><dt>Proof</dt><dd><a href={'/dealtwin/proofs/'+encodeURIComponent(proof.id)}>{proof.id}</a></dd></div><div><dt>Version</dt><dd>{proof.dealVersionId} · v{proof.dealVersion}</dd></div><div><dt>Engine</dt><dd>{proof.engineVersion}</dd></div><div><dt>Historical status</dt><dd>{proof.status}</dd></div><div><dt>Generated</dt><dd>{proof.generatedAt}</dd></div></dl>
  <div className="dt-hashes"><p>Proof hash <code>{proof.proofHash}</code></p><p>Input hash <code>{proof.inputHash}</code></p><p>Result hash <code>{proof.resultHash}</code></p><p>Event hash <code>{proof.canonicalEventHash}</code></p></div>
  <h3>Fixed-term approval snapshot</h3>{approvals.length===0?<p>No required approval in this snapshot.</p>:<table className="dt-table"><thead><tr><th>Approval</th><th>Requirement / kind</th><th>Historical status</th></tr></thead><tbody>{approvals.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.requirementCode??row.kind}</td><td>{row.status}</td></tr>)}</tbody></table>}
  <h3>Assumptions</h3>{assumptions.length===0?<p>No additional recorded assumptions.</p>:<ul>{assumptions.map(row=><li key={row.id}><strong>{row.code}</strong> · {row.detail}</li>)}</ul>}
  {replay?.replayed?<div className="dt-success" role="status"><strong>Replay · genuinely recomputed</strong><p>Historical result: <code>{replay.historical?.resultHash}</code></p><p>Recomputed result: <code>{replay.historical?.recomputedResultHash}</code></p></div>:null}
  <details><summary>Historical base compile</summary><DealCompiler result={proof.baseResult as unknown as CompileResultDto}/></details>
  <details><summary>Immutable dependency manifest</summary><pre>{JSON.stringify(proof.dependencyManifest,null,2)}</pre></details>
 </section>;
}
