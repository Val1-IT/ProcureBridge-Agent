import type { MutationContext,OperationResponse } from './operation-contracts';
import type { WorkflowPort } from './workflow-port';
import { assertJudgeActor } from './judge-seed-service';
import { fail,json,mutateWorkflow } from './workflow-mutation';
export interface JudgeObligationInput {readonly invoiceId:'judge-existing-ap';readonly amountRupiah:'19000000'}
export class JudgeObligationService {
 constructor(private readonly port:WorkflowPort){}
 async mutateJudgeObligation(context:MutationContext,input:JudgeObligationInput):Promise<OperationResponse> {
  assertJudgeActor(context); if(context.role!=='admin'&&context.role!=='finance') fail('FORBIDDEN_ROLE',403);
  if(input.invoiceId!=='judge-existing-ap'||input.amountRupiah!=='19000000') fail('INVALID_JUDGE_MUTATION',422);
  return mutateWorkflow(this.port,context,'dealtwin.judge.obligation.changed',json(input),async tx=>{
   const state=await tx.loadErp(); const next=structuredClone(state);
   const invoice=next.supplierInvoices.find(row=>row.id===input.invoiceId);
   const order=next.purchaseOrders.find(row=>row.id==='judge-existing-po');
   const receipt=next.goodsReceipts.find(row=>row.id==='judge-existing-receipt');
   if(!invoice||!order||!receipt||invoice.purchaseOrderId!==order.id||invoice.sourceDocumentIds.length!==1||invoice.sourceDocumentIds[0]!==receipt.id||receipt.purchaseOrderId!==order.id
    ||invoice.supplierId!==order.supplierId||invoice.lines.length!==1||order.lines.length!==1||receipt.lines.length!==1
    ||[invoice.lines[0]!,order.lines[0]!,receipt.lines[0]!].some(row=>row.quantity!==1||row.productId!=='judge-product-a')
    ||invoice.dueDate!=='2026-09-15') fail('UNSUPPORTED_JUDGE_OBLIGATION',422);
   invoice.totalAmount=19000000; invoice.lines[0]!.unitPrice=19000000; order.lines[0]!.unitPrice=19000000; receipt.lines[0]!.unitPrice=19000000;
   invoice.updatedAt=context.now; order.updatedAt=context.now; receipt.updatedAt=context.now;
   next.revision=tx.revision+1; await tx.saveErp(next);
   return {invoiceId:invoice.id,amountRupiah:input.amountRupiah};
  });
 }
}
