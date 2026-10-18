import type { Deal,DealVersion } from '../domain/deal';
import type { CompileInput } from '../compiler/compile-deal';
import type { MutationContext } from './operation-contracts';
import type { WorkflowTransaction } from './workflow-port';
import { decodeTerms,prepareCommitmentProof } from '../proof/replay-proof';
import { isSelfReservation } from '../domain/commitment';
import { buildSnapshot } from '../erp/build-snapshot';
import { isoDate } from '../domain/date';
import { rupiah } from '../domain/money';
import { fail,json } from './workflow-mutation';
export async function workflowFrame(tx:WorkflowTransaction,context:MutationContext,versionId:string,targetDealId?:string):Promise<{deal:Deal;version:DealVersion;input:CompileInput;parentProofId?:string}> {
 const version=await tx.getVersion(versionId);if(!version)fail('VERSION_NOT_FOUND',404);
 const deal=await tx.getDeal(version.dealId);if(!deal||(targetDealId&&deal.id!==targetDealId))fail('VERSION_IDENTITY_MISMATCH',422);
 if(deal.currentVersionId!==version.id)fail('VERSION_CONFLICT');
 const terms=decodeTerms(json(version.terms));if(!terms.ok)fail(terms.error.code,422);
 const constraints=await tx.constraints(version.id);
 const rows=await tx.listCommitments();const owners=[];
 for(const row of rows){const ownerVersion=await tx.getVersion(row.dealVersionId);if(!ownerVersion)fail('INVALID_COMMITMENT',422);if(ownerVersion.dealId===deal.id)owners.push(row);}
 if(owners.length>1)fail('SELF_RESERVATION_MISMATCH');
 const owner=owners[0];
 if(owner){
  const stored=await tx.getProof(owner.proofId);if(!stored||stored.proof.dealId!==deal.id||!isSelfReservation(owner,{proofId:stored.proof.id,dealVersionId:stored.proof.dealVersionId,canonicalEventHash:stored.proof.canonicalEventHash}))fail('SELF_RESERVATION_MISMATCH');
  const history=prepareCommitmentProof(stored.proof);if(!history.ok)fail(history.error.code,422);if(history.value.compileInput.snapshot.tenantId!==context.tenantId)fail('PROOF_IDENTITY_MISMATCH',422);
 }
 const snapshot=buildSnapshot({state:await tx.loadErp(),tenantId:context.tenantId,asOfDate:isoDate('2026-09-12'),requestedHorizonEnd:isoDate('2026-10-12'),adapterVersion:'dealtwin-erp-adapter-v1',commitments:rows,self:owner??null});
 if(!snapshot.ok)fail(snapshot.error.code,422);if(owner&&owner.accountId!==snapshot.value.cash.accountId)fail('SELF_RESERVATION_MISMATCH');
 return {deal,version,input:{snapshot:snapshot.value,terms:terms.value,constraints,policy:{minimumCashRupiah:rupiah(5000000n),newBorrowingAllowed:false,defaultHorizonDays:30},approvedApprovalCodes:[]},
  ...(owner?{parentProofId:owner.proofId}:{})};
}
