import type { Deal } from '../domain/deal';
import type { SelfReservationIdentity } from '../domain/commitment';
export interface CommandState {
 readonly revision:number;readonly deals:readonly Deal[];
 readonly proofs:readonly {id:string;status:string;proof_json:Omit<SelfReservationIdentity,'proofId'>&{id:string;dealId:string;dealVersion:number;generatedAt?:string}}[];
 readonly commitments:readonly {id:string;proof_id:string;deal_version_id:string;canonical_event_hash:string;status:string}[];
 readonly approvals:readonly {id:string;proof_id:string;deal_version_id:string}[];
 readonly constraints:readonly {id:string;deal_version_id:string}[];
}
export type UiAction={kind:'compile'|'proof'|'recompile'|'reserve'|'commit'|'replay'|'delay3'|'delay7'|'delay14'|'cost500'|'confirm'|'replace'|'release'|'cancel'|'expire'|'reset'|'ap19'}|{kind:'approve';approvalId:string};
export interface UiCommand {readonly path:string;readonly method:'POST'|'PATCH';readonly body:Record<string,unknown>}
export function buildCommand(state:CommandState,dealId:string,action:UiAction,key:string,requestedProofId?:string):UiCommand {
 const base={expectedRevision:state.revision,idempotencyKey:key};
 const command=(path:string,body:Record<string,unknown>,method:'POST'|'PATCH'='POST'):UiCommand=>({path:'/api/dealtwin/'+path,method,body:{...base,...body}});
 if(action.kind==='reset')return command('judge/reset',{});
 if(action.kind==='ap19')return command('judge/obligations/judge-existing-ap',{amountRupiah:'19000000'},'PATCH');
 const deal=state.deals.find(row=>row.id===dealId);if(!deal)throw new Error('DEAL_NOT_FOUND');
 const path='deals/'+encodeURIComponent(deal.id);
 if(action.kind==='compile'||action.kind==='recompile'||action.kind==='proof')return command(path+'/'+action.kind,{dealVersionId:deal.currentVersionId});
 if(action.kind==='confirm')return command(path+'/constraints/confirm',{dealVersionId:deal.currentVersionId,constraintIds:state.constraints.filter(row=>row.deal_version_id===deal.currentVersionId).map(row=>row.id)});
 if(action.kind==='approve'){
  const row=state.approvals.find(row=>row.id===action.approvalId);if(!row||!state.proofs.some(proof=>proof.id===row.proof_id&&proof.proof_json.dealId===deal.id))throw new Error('APPROVAL_IDENTITY_MISMATCH');
  return command('approvals/'+encodeURIComponent(row.id)+'/decision',{proofId:row.proof_id,dealVersionId:row.deal_version_id,decision:'approved',comment:'Reviewed fixed synthetic proof/version terms'});
 }
 if(action.kind==='commit'&&deal.committedSalesOrderId)throw new Error('DEAL_ALREADY_COMMITTED');
 const rows=state.proofs.filter(row=>row.proof_json.dealId===deal.id).sort((a,b)=>b.proof_json.dealVersion-a.proof_json.dealVersion||(b.proof_json.generatedAt??'').localeCompare(a.proof_json.generatedAt??'')||a.id.localeCompare(b.id));
 const proof=(requestedProofId?rows.find(row=>row.id===requestedProofId):rows[0])?.proof_json;
 if(!proof)throw new Error(requestedProofId?'PROOF_IDENTITY_MISMATCH':'PROOF_NOT_FOUND');
 const identity={proofId:proof.id,dealVersionId:proof.dealVersionId,canonicalEventHash:proof.canonicalEventHash};
 if(action.kind==='reserve'||action.kind==='commit')return command(path+'/'+action.kind,identity);
 if(action.kind==='replay')return command('proofs/'+encodeURIComponent(proof.id)+'/replay',{});
 if(action.kind==='delay3'||action.kind==='delay7'||action.kind==='delay14'||action.kind==='cost500'){
  const scenario=action.kind==='cost500'?{schemaVersion:'dealtwin.stress-scenario.v1',id:'ui-cost-plus-500',type:'direct_outflow_increase',basisPoints:500}:
   {schemaVersion:'dealtwin.stress-scenario.v1',id:'ui-receipts-plus-'+action.kind.slice(5),type:'customer_receipt_delay',days:action.kind==='delay3'?3:action.kind==='delay7'?7:14};
  return command('proofs/'+encodeURIComponent(proof.id)+'/stress',{scenarios:[scenario]});
 }
 const owners=state.commitments.filter(row=>(row.status==='reserved'||row.status==='committed')&&state.proofs.some(item=>item.id===row.proof_id&&item.proof_json.dealId===deal.id));
 if(owners.length!==1)throw new Error('RESERVATION_REQUIRED');const owner=owners[0]!;
 const previous={proofId:owner.proof_id,dealVersionId:owner.deal_version_id,canonicalEventHash:owner.canonical_event_hash};
 if(action.kind==='replace')return command('commitments/'+encodeURIComponent(owner.id)+'/replace',{previous,replacement:identity});
 return command('commitments/'+encodeURIComponent(owner.id),{...previous,action:action.kind});
}
