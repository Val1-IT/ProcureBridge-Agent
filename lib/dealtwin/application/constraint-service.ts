import { createDealVersion } from '../domain/deal';
import { decodeTerms } from '../proof/replay-proof';
import { validateConstraints } from '../domain/constraint';
import type { MutationContext,OperationResponse } from './operation-contracts';
import {WorkflowError,type WorkflowPort} from './workflow-port';
import type {DealVersion} from '../domain/deal';
import type {ConstraintSet} from '../domain/constraint';
import type {CanonicalJsonValue} from '../domain/canonical-json';
import {sha256Canonical} from '../domain/canonical-json';
import {ExtractionError,type ConstraintExtractionPort} from '../ai/constraint-extractor';
import { fail,json,mutateWorkflow,operationId,requireSales } from './workflow-mutation';
export interface ConstraintConfirmationInput {readonly dealId:string;readonly dealVersionId:string;readonly constraintIds:readonly string[]}
export class ConstraintService {
 constructor(private readonly port:WorkflowPort,private readonly extractor?:ConstraintExtractionPort){}
 async extractConstraints(context:MutationContext,input:{dealId:string;dealVersionId:string;text:string}):Promise<OperationResponse>{
  const action='dealtwin.constraints.extracted';
  try{
   requireSales(context);
   if(!input.text?.trim()||input.text.length>3000||!Number.isSafeInteger(context.expectedRevision)||context.expectedRevision<0||!context.idempotencyKey?.match(/^[a-zA-Z0-9:_-]{1,128}$/))fail('INVALID_REQUEST',422);
   const payload=json(input);const requestHash=sha256Canonical({action,expectedRevision:context.expectedRevision,input:payload});
   type Prepared={response:OperationResponse}|{version:DealVersion;constraints:ConstraintSet;redacted:CanonicalJsonValue};
   const prepared=await this.port.transact<Prepared>(context,async tx=>{
    const receipt=await tx.receipts.findSuccess(context.tenantId,action,context.idempotencyKey);
    if(receipt){if(receipt.actorId!==context.actorId)fail('FORBIDDEN_ROLE',403);if(receipt.requestHash!==requestHash)fail('IDEMPOTENCY_KEY_REUSED');return {response:JSON.parse(receipt.responseJson) as OperationResponse};}
    if(tx.revision!==context.expectedRevision)fail('REVISION_CONFLICT');
    const deal=await tx.getDeal(input.dealId);const version=await tx.getVersion(input.dealVersionId);
    if(!deal||!version||version.dealId!==deal.id)fail('VERSION_IDENTITY_MISMATCH',422);
    if(deal.currentVersionId!==version.id)fail('VERSION_CONFLICT');
    if(deal.committedSalesOrderId)fail('DEAL_ALREADY_COMMITTED');
    const constraints=await tx.constraints(version.id);
    if(constraints.constraints.some(row=>row.resolution!=='confirmed'))fail('MATERIAL_CONFIRMATION_REQUIRED',422);
    const erp=await tx.loadErp();
    return {version,constraints,redacted:json({currency:'IDR',customerId:version.terms.customerId,warehouseIds:erp.warehouses.slice(0,16).map(row=>row.id),productIds:erp.products.slice(0,16).map(row=>row.id)})};
   });
   if('response' in prepared)return prepared.response;
   if(!this.extractor)fail('CONSTRAINT_EXTRACTION_UNAVAILABLE',503);
   // The read transaction/client has returned before any provider/network call.
   const result=await this.extractor.extract({text:input.text,confirmedConstraints:prepared.constraints.constraints,context:prepared.redacted});
   if(result.missingFields.length)return {httpStatus:422,body:{ok:false,error:{code:'MISSING_COMMERCIAL_INFORMATION'},missingFields:[...result.missingFields]}};
   return mutateWorkflow(this.port,context,action,payload,async tx=>{
    const deal=await tx.getDeal(input.dealId);const old=await tx.getVersion(input.dealVersionId);
    if(!deal||!old||old.dealId!==deal.id||deal.currentVersionId!==old.id)fail('VERSION_CONFLICT');
    if(deal.committedSalesOrderId)fail('DEAL_ALREADY_COMMITTED');
    const prior=await tx.constraints(old.id);
    const candidates=result.candidates.map(row=>({...row,id:operationId(context,action,row.id),provenance:'ai_extracted' as const,resolution:'pending_confirmation' as const}));
    if(candidates.some(row=>!row.sourceText||!input.text.includes(row.sourceText)))fail('AI_OUTPUT_INVALID',422);
    if(candidates.some(row=>row.kind==='required_inventory_available')){
     const erp=await tx.loadErp();
     if(candidates.some(row=>row.kind==='required_inventory_available'&&(!erp.products.some(product=>product.id===row.value.productId)||!erp.warehouses.some(warehouse=>warehouse.id===row.value.warehouseId))))fail('AI_REFERENCE_INVALID',422);
    }
    const rows=[...prior.constraints.map(row=>({...row,id:operationId(context,action,'prior:'+row.id)})),...candidates];
    const validated=validateConstraints(rows);if(!validated.ok)fail('CONFLICTING_CONFIRMED_CONSTRAINT',422);
    const terms=decodeTerms(json(old.terms));if(!terms.ok)fail(terms.error.code,422);
    const version=createDealVersion({id:operationId(context,action,'version'),dealId:deal.id,version:old.version+1,terms:terms.value,createdBy:context.actorId,createdAt:context.now});
    await tx.insertVersion(version);for(const [index,row] of validated.value.constraints.entries())await tx.insertConstraint(row,version.id,index+1);
    await tx.adoptVersion(deal,version,'DRAFT');
    return {dealId:deal.id,dealVersionId:version.id,version:version.version,previousVersionId:old.id,candidates:json(candidates),requiresConfirmation:true,metadata:json(result.metadata)};
   });
  }catch(error){if(error instanceof WorkflowError||error instanceof ExtractionError)return {httpStatus:error.httpStatus,body:{ok:false,error:{code:error.code}}};throw error;}
 }
 async confirmConstraints(context:MutationContext,input:ConstraintConfirmationInput):Promise<OperationResponse> {
  requireSales(context);
  return mutateWorkflow(this.port,context,'dealtwin.constraints.confirmed',json(input),async tx=>{
   const deal=await tx.getDeal(input.dealId); const old=await tx.getVersion(input.dealVersionId);
   if(!deal||!old||old.dealId!==deal.id) fail('VERSION_IDENTITY_MISMATCH',422);
   if(deal.currentVersionId!==old.id) fail('VERSION_CONFLICT');
   if(deal.committedSalesOrderId) fail('DEAL_ALREADY_COMMITTED');
   const set=await tx.constraints(old.id); const ids=set.constraints.map(row=>row.id);
   if(input.constraintIds.length!==ids.length||new Set(input.constraintIds).size!==ids.length||ids.some(id=>!input.constraintIds.includes(id))) fail('MATERIAL_CONFIRMATION_REQUIRED',422);
   if(set.constraints.some(row=>row.resolution==='unresolved')) fail('UNRESOLVED_CONSTRAINT',422);
   const terms=decodeTerms(json(old.terms)); if(!terms.ok) fail(terms.error.code,422);
   const version=createDealVersion({id:operationId(context,'confirm','version'),dealId:deal.id,version:old.version+1,terms:terms.value,createdBy:context.actorId,createdAt:context.now});
   // Explicit human confirmation creates a new version; the old AI candidate
   // remains immutable and is never relabelled as model-confirmed authority.
   const rows=set.constraints.map(row=>({...row,id:operationId(context,'confirm',row.id),provenance:row.provenance==='ai_extracted'?'user_confirmed' as const:row.provenance,resolution:'confirmed' as const}));
   const validated=validateConstraints(rows); if(!validated.ok) fail('UNRESOLVED_CONSTRAINT',422);
   await tx.insertVersion(version);
   for(const [index,row] of validated.value.constraints.entries()) await tx.insertConstraint(row,version.id,index+1);
   await tx.adoptVersion(deal,version,'DRAFT');
   return {dealId:deal.id,dealVersionId:version.id,previousVersionId:old.id,version:version.version,constraints:json(rows)};
  });
 }
}
