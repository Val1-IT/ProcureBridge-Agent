'use client';
import { useParams } from 'next/navigation';
import { useWorkspace } from './workspace-provider';
import { WorkspaceStatus } from './workspace-status';
import { DealInbox } from './deal-inbox';
import { DealCompiler } from './deal-compiler';
import { ProofView } from './proof-view';
import { CommitmentTimeline } from './commitment-timeline';
import { ErpEvidence } from './erp-evidence';
import { formatRupiah } from './format';
import type { CompileResultDto } from '../../lib/dealtwin/ui/contracts';
import type { UiAction } from '../../lib/dealtwin/ui/commands';
export function WorkflowView({mode='deal'}:{mode?:'inbox'|'deal'|'proof'|'commitments'|'erp'}){
 const {snapshot,loading,busy,error,commandError,lastResponse,detail,selectedDealId,refresh,run,canRetry,retryLast}=useWorkspace();const params=useParams<{proofId?:string}>();
 if(loading&&!snapshot)return <WorkspaceStatus state="loading"/>;
 if(error||!snapshot)return <WorkspaceStatus state="error" message={error??'Signed Judge session required. Use the trusted local test launcher; no public session issuance is provided.'} onRetry={()=>void refresh()} retrying={loading}/>;
 const actor=snapshot.actor;const deal=snapshot.deals.find(row=>row.id===selectedDealId);const version=snapshot.versions.find(row=>row.id===deal?.currentVersionId);
 const proofs=snapshot.proofs.filter(row=>row.proof_json.dealId===deal?.id).sort((a,b)=>b.proof_json.dealVersion-a.proof_json.dealVersion||b.proof_json.generatedAt.localeCompare(a.proof_json.generatedAt));
 const proof=mode==='proof'?snapshot.proofs.find(row=>row.id===params.proofId):proofs[0];
 const owned=snapshot.commitments.filter(row=>snapshot.proofs.some(item=>item.id===row.proof_id&&item.proof_json.dealId===deal?.id));
 const active=owned.find(row=>row.status==='reserved'||row.status==='committed');const sales=actor?.role==='admin'||actor?.role==='sales';
 const blocked=busy||loading;const result=detail?.compileRuns.filter(row=>row.kind!=='stress').at(-1)?.violation_data as CompileResultDto|undefined;
 const response=lastResponse as {replayed?:boolean;historical?:{resultHash:string;recomputedResultHash:string};scope?:string;runs?:{id:string;result:CompileResultDto}[]}|null;
 const action=(kind:UiAction['kind'],label:string,disabled=false)=><button type="button" className="dt-button" data-action={kind} disabled={blocked||disabled} onClick={()=>{if(kind==='reset'&&!window.confirm('Reset only the synthetic Judge tenant? Business seed is restored; revision and immutable receipts are retained.'))return;void run({kind} as UiAction);}}>{label}</button>;
 return <div className="dt-workflow" aria-busy={blocked} data-testid="server-workspace">
  <section className="dt-workspace-strip"><div><strong>PostgreSQL source</strong><span data-testid="workspace-revision">Revision {snapshot.revision}</span></div><div>Signed server role: <strong data-testid="server-role">{actor?.role??'unavailable'}</strong><small>{actor?.actorId}</small></div>
   <button className="dt-button dt-secondary" onClick={()=>void refresh()} disabled={blocked}>Refresh server state</button>{action('reset','Reset synthetic Judge',actor?.role!=='admin')}
   {canRetry?<button className="dt-button dt-secondary" onClick={()=>void retryLast()} disabled={blocked}>Retry original successful request</button>:null}
  </section>
  <p className="dt-boundary">Synthetic tenant · planning reservations are not bank transfers · no production or real money. Browser storage is not Judge authority.</p>
  {commandError?<section className="dt-warning" role="alert"><h2 data-testid="operation-error">{commandError.code}</h2><p>The request did not return a successful result. Check the current workspace before taking another action.</p>{commandError.body?<details><summary>Server response details</summary><pre>{JSON.stringify(commandError.body,null,2)}</pre></details>:null}</section>:null}
  {mode==='inbox'?<DealInbox deals={snapshot.deals}/>:null}
  {!deal?<WorkspaceStatus state="empty" message="Selected server Deal or Proof not found. No other Deal is substituted."/>:null}
  {deal&&mode!=='commitments'&&mode!=='erp'?<>
   <section className="dt-panel"><div className="dt-panel-heading"><div><span className="dt-kicker">Live Deal Twin</span><h1>{deal.title}</h1></div><span className="dt-badge">{deal.status}</span></div>
    <dl className="dt-facts"><div><dt>Current operational version</dt><dd>{deal.currentVersionId}</dd></div><div><dt>Linked Sales Order</dt><dd data-testid="linked-sales-order">{deal.committedSalesOrderId??'Not committed'}</dd></div>
     <div><dt>Fixed current deposit</dt><dd data-testid="current-deposit">{version?.terms.customerPaymentEvents[0].basisPoints} basis points</dd></div><div><dt>Customer balance timing</dt><dd>{version?.terms.customerPaymentEvents[1].daysFromAcceptance} days</dd></div></dl>
    {proof&&proof.proof_json.dealVersionId!==deal.currentVersionId&&deal.committedSalesOrderId?<div className="dt-warning" data-testid="remediation-pending"><strong>REMEDIATION_PENDING</strong><p>Proposed version {proof.proof_json.dealVersion}: {JSON.stringify(proof.proof_json.terms)}. Original Sales Order and occupied capacity remain unchanged.</p></div>:null}
    <h2 className="dt-section-heading">Compile and prove</h2><p className="dt-muted">Confirm the constraints, check feasibility, then inspect the smallest permitted amendment and its proof.</p>
    <div className="dt-actions">{action('confirm','Confirm all material constraints',!sales||!!deal.committedSalesOrderId)}{action('compile','Compile current Deal',!sales)}{action('recompile','Find smallest amendment',!sales)}{action('proof','Generate immutable Proof',!sales||!!deal.committedSalesOrderId)}</div>
    <h2 className="dt-section-heading">Reserve and commit</h2><p className="dt-muted">Reservation occupies planning capacity. Commit requires an eligible reservation and all required approvals, and creates one Sales Order.</p>
    <div className="dt-actions">{action('reserve','RESERVE planning liquidity',!sales||!proof||!!active||!!deal.committedSalesOrderId)}{action('commit','COMMIT to Sales Order',!sales||!proof||!active||!!deal.committedSalesOrderId)}
     {action('replace','Replace reserved version atomically',!sales||!proof||active?.status!=='reserved'||!!deal.committedSalesOrderId||active.proof_id===proof.id)}
     {action('replay','Replay immutable Proof',!sales||!proof)}{action('ap19','Set allowlisted AP to Rp19m',actor?.role!=='admin'&&actor?.role!=='finance')}</div>
    <h3>Selected immutable inputs</h3><details><summary>Current fixed terms</summary><pre>{JSON.stringify(version?.terms,null,2)}</pre></details>
    <h3>Confirmed material constraints</h3><ul>{snapshot.constraints.filter(row=>row.deal_version_id===deal.currentVersionId).map(row=><li key={row.id}>{row.kind} · {row.resolution} · <code>{JSON.stringify(row.value)}</code></li>)}</ul>
    <h3>Persisted Proof history</h3><ul>{proofs.map(row=><li key={row.id}><a href={'/dealtwin/proofs/'+encodeURIComponent(row.id)}>{row.id}</a> · {row.status} · version {row.proof_json.dealVersion}</li>)}</ul>
   </section>
   {result?<><DealCompiler result={result}/><CommitmentTimeline result={result}/></>:<WorkspaceStatus state="empty" message="No stored compile run for this selected server Deal yet."/>}
   {proof?<><ProofView proof={proof.proof_json} currentStatus={proof.status} staleReason={proof.stale_reason} replay={response?.replayed?{replayed:true,historical:response.historical}:null}/>
    <section className="dt-panel"><h2>Stress Lab · historical Proof scope</h2><p>Diagnostics are not current allocation authority. Required stress policy stays server-owned.</p><div className="dt-actions">{action('delay3','Customer receipts +3 days',!sales)}{action('delay7','Customer receipts +7 days',!sales)}{action('delay14','Customer receipts +14 days',!sales)}{action('cost500','Direct outflow +500 bps',!sales)}</div>
     {response?.scope==='historical_proof'?response.runs?.map(row=><div key={row.id}><h3>{row.id}</h3><DealCompiler result={row.result}/></div>):null}
     <h3>Current live approvals</h3>{snapshot.approvals.filter(row=>row.proof_id===proof.id).map(row=><div className="dt-approval" key={row.id}><div><code>{row.id}</code><p>{row.requirement_code} · <strong>{row.status}</strong></p></div><button className="dt-button" data-approval={row.id} disabled={blocked||actor?.role!=='approver'||row.status==='approved'} onClick={()=>void run({kind:'approve',approvalId:row.id})}>Approve fixed proof/version terms</button></div>)}
     {actor?.role!=='approver'?<p className="dt-muted">Only a separately signed approver session can decide approval. The browser has no role-grant control.</p>:null}
    </section></>:null}
  </>:null}
  {mode==='commitments'?<section className="dt-panel"><h1>Commitment Ledger</h1><p>Immutable planning events, not cash movements. Lifecycle cleanup does not rewrite a Sales Order.</p>
   {snapshot.commitments.length===0?<p role="status">No planning capacity has been reserved. Generate an eligible proof before reserving liquidity.</p>:<div className="dt-table-scroll" role="region" aria-label="Commitment ledger" tabIndex={0}><table className="dt-table"><thead><tr><th>Commitment / proof</th><th>Status</th><th>Planning amount</th><th>Deadline</th></tr></thead><tbody>{snapshot.commitments.map(row=><tr key={row.id}><td>{row.id}<small>{row.proof_id}</small></td><td>{row.status}</td><td>{formatRupiah(row.amount_rupiah)} · {row.direction}</td><td>{row.expires_at??'No stored deadline'}</td></tr>)}</tbody></table></div>}
   <h2>Selected Deal capacity</h2><p>{deal?.title??'No selected Deal'}</p><div className="dt-actions">{action('release','Release exact selected owner',!sales||!active)}{action('cancel','Cancel exact selected owner',!sales||!active)}{action('expire','Request server expiry',!sales||!active?.expires_at)}</div>
  </section>:null}
  {mode==='erp'?<><ErpEvidence openingCashRupiah={snapshot.cash.openingBalanceRupiah} asOfDate={snapshot.cash.asOfDate} events={snapshot.timeline.erpEvents} revision={snapshot.revision}/>
   <section className="dt-panel"><h2>Authoritative source chain</h2><div className="dt-actions">{action('ap19','Apply locked synthetic AP19m variant',actor?.role!=='admin'&&actor?.role!=='finance')}</div>
    <h3>Supplier invoices / outstanding source</h3><pre>{JSON.stringify(snapshot.erp.supplierInvoices,null,2)}</pre><h3>Matching Purchase Orders / Goods Receipts</h3><pre>{JSON.stringify({purchaseOrders:snapshot.erp.purchaseOrders,goodsReceipts:snapshot.erp.goodsReceipts},null,2)}</pre>
    <h3>Original bank/cash movements</h3><pre>{JSON.stringify(snapshot.erp.cashMovements,null,2)}</pre><h3>Existing Sales Orders</h3><pre>{JSON.stringify(snapshot.erp.salesOrders,null,2)}</pre>
   </section></>:null}
  {lastResponse?<details className="dt-panel"><summary>Last original server operation response — not current workspace authority</summary><pre>{JSON.stringify(lastResponse,null,2)}</pre></details>:null}
 </div>;
}
