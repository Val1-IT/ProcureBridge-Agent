export interface SelectionState {
 readonly deals: readonly {id:string}[];
 readonly proofs: readonly {id:string;proof_json:{dealId:string}}[];
}
export function selectDeal(state:SelectionState,pathname:string,queryDeal:string|null):string|null {
 const selected=pathname.match(/^\/dealtwin\/deals\/([^/]+)$/)?.[1];
 const selectedProof=pathname.match(/^\/dealtwin\/proofs\/([^/]+)$/)?.[1];
 try {
  const id=selected!==undefined?decodeURIComponent(selected):selectedProof!==undefined
   ?state.proofs.find(row=>row.id===decodeURIComponent(selectedProof))?.proof_json.dealId
   :queryDeal!==null?queryDeal:state.deals[0]?.id;
  return state.deals.some(row=>row.id===id)?id!:null;
 } catch { return null; }
}
export function workflowLinks(selectedDealId:string|null){
 const suffix=selectedDealId?'?dealId='+encodeURIComponent(selectedDealId):'';
 return {ledger:'/dealtwin/commitments'+suffix,erp:'/dealtwin/erp'+suffix};
}
