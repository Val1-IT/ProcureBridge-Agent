import type {ReactElement} from 'react';
export interface JudgeStateDto {
 deals:readonly {id:string;currentVersionId:string;committedSalesOrderId:string|null}[];
 versions:readonly {id:string;dealId:string}[];
 proofs:readonly {id:string;status:string;replayed_at?:string|null;proof_json:{dealId:string;dealVersionId:string;dealVersion:number}}[];
 commitments:readonly {proof_id:string;status:string}[];
 constraints:readonly {deal_version_id:string;resolution:string}[];
 approvals:readonly {proof_id:string;status:string}[];
 compileRuns:readonly {deal_version_id:string;kind:string;outcome:string;violation_data:{conflictingCommitmentIds?:readonly string[]}}[];
}
export interface JudgeStep {number:number;status:string;completed:readonly boolean[]}
const labels=['Load/reset synthetic ERP','Compile initial timing','Confirm material constraints','Find smallest deterministic amendment','Run named stress','Inspect immutable Proof','Inspect fixed-term approval','Reserve, approve and COMMIT','Reject competing liquidity','Observe dependency STALE','Propose committed remediation','Replay historical conclusion'];
export function selectJudgeStep(state:JudgeStateDto):JudgeStep{
 const deal=state.deals.find(row=>row.id==='judge-deal-a');
 const proofs=state.proofs.filter(row=>row.proof_json.dealId===deal?.id);
 const versions=new Set(state.versions.filter(row=>row.dealId===deal?.id).map(row=>row.id));
 const otherVersions=new Set(state.versions.filter(row=>row.dealId==='judge-deal-b').map(row=>row.id));
 const runs=state.compileRuns.filter(row=>versions.has(row.deal_version_id));
 const currentConstraints=state.constraints.filter(row=>row.deal_version_id===deal?.currentVersionId);
 const approvals=state.approvals.filter(row=>proofs.some(proof=>proof.id===row.proof_id));
 const owners=state.commitments.filter(row=>proofs.some(proof=>proof.id===row.proof_id));
 const committed=owners.find(row=>row.status==='committed');
 const original=proofs.find(row=>row.id===committed?.proof_id);
 const completed=[
  !!deal&&state.deals.some(row=>row.id==='judge-deal-b'),
  runs.some(row=>row.deal_version_id==='judge-version-a-1'&&row.kind==='base'&&row.outcome==='DOES_NOT_COMPILE'),
  currentConstraints.length>0&&currentConstraints.every(row=>row.resolution==='confirmed'),
  runs.some(row=>row.kind==='recompile')&&proofs.some(row=>row.proof_json.dealVersion>1),
  runs.some(row=>row.kind==='stress'),
  proofs.length>0,
  approvals.length>0,
  !!committed&&!!deal?.committedSalesOrderId,
  state.compileRuns.some(row=>otherVersions.has(row.deal_version_id)&&row.outcome==='DOES_NOT_COMPILE'&&(row.violation_data.conflictingCommitmentIds?.length??0)>0),
  original?.status==='STALE',
  !!deal?.committedSalesOrderId&&proofs.some(row=>row.proof_json.dealVersion>(original?.proof_json.dealVersion??Number.MAX_SAFE_INTEGER)),
  original?.status==='STALE'&&!!original.replayed_at,
 ];
 const incomplete=completed.indexOf(false);const number=incomplete===-1?12:incomplete+1;
 const pending=owners.some(row=>row.status==='reserved')&&approvals.some(row=>owners.some(owner=>owner.proof_id===row.proof_id&&owner.status==='reserved')&&row.status!=='approved');
 const status=incomplete===-1?'COMPLETE_REMEDIATION_PENDING':number===8&&owners.some(row=>row.status==='reserved')?(pending?'WAITING_FOR_APPROVAL':'READY_TO_COMMIT'):number===12?'REPLAY_HISTORICAL_PROOF':'STEP_'+number;
 return {number,status,completed};
}
export function JudgeGuide({state}:{state:JudgeStateDto}):ReactElement{
 const step=selectJudgeStep(state);
 return <section className="dt-panel" aria-labelledby="judge-heading"><div className="dt-panel-heading"><h2 id="judge-heading">Judge Mode</h2><strong data-testid="judge-status">{step.status}</strong></div>
  <p className="dt-boundary">Synthetic sandbox only. Progress is derived from PostgreSQL records and genuine compiler evidence, not a browser checklist. Reset requires confirmation; approval uses a separately signed session.</p>
  <ol aria-label="Twelve-step Judge journey" className="dt-judge-steps">{labels.map((label,index)=><li key={label} data-judge-step={index+1} aria-current={step.number===index+1?'step':undefined}><strong>{index+1}. {label}</strong><span>{step.completed[index]?'Server evidence present':'Not yet evidenced'}</span></li>)}</ol>
  <p>Existing committed Sales Order and planning capacity remain unchanged during remediation. Completion means a proposed amendment plus historical replay, not a second COMMIT or a bank transfer.</p>
 </section>;
}
