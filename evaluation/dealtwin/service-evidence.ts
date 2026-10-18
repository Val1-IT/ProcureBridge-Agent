import {z} from 'zod';
import {sha256Canonical,type CanonicalJsonValue} from '../../lib/dealtwin/domain/canonical-json';

export interface ServiceObservation {readonly id:string;readonly metric:'duplicateCommitment'|'missedStaleness'|'idempotency'|'raceBehavior'|'extractionCorrectness';readonly expected:CanonicalJsonValue;readonly actual:CanonicalJsonValue}
export interface ServiceEvidence {readonly sourceSha:string;readonly observerVersion:'disposable-command-observer-v2';readonly environment:'local-disposable-postgres';readonly plannedIterations:number;readonly observations:readonly ServiceObservation[]}
const canonical=z.custom<CanonicalJsonValue>(value=>{try{sha256Canonical(value as CanonicalJsonValue);return true;}catch{return false;}});
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const base={id:z.string().min(1).max(128),expected:canonical};
const observation=z.discriminatedUnion('metric',[
 z.strictObject({...base,metric:z.literal('duplicateCommitment'),actual:z.strictObject({commitments:count,salesOrdersCreated:count,secondCommitStatus:z.number().int().min(100).max(599),secondCommitChangedState:z.boolean()})}),
 z.strictObject({...base,metric:z.literal('missedStaleness'),actual:z.strictObject({status:z.enum(['FRESH','STALE']),historicalProofSame:z.boolean()})}),
 z.strictObject({...base,metric:z.literal('idempotency'),actual:z.strictObject({reserveSame:z.boolean(),reserveStateSame:z.boolean(),commitSame:z.boolean(),commitStateSame:z.boolean(),reserveRevisionOnce:z.boolean(),commitRevisionOnce:z.boolean()})}),
 z.strictObject({...base,metric:z.literal('raceBehavior'),actual:z.strictObject({successes:count,conflicts:count,revisionAdvances:count,commitments:count})}),
 z.strictObject({...base,metric:z.literal('extractionCorrectness'),actual:z.union([z.strictObject({error:z.string().min(1).max(128)}),z.strictObject({candidates:z.array(z.strictObject({kind:z.string().min(1).max(128),value:canonical,resolution:z.enum(['confirmed','pending_confirmation','unresolved'])})).max(100),missingFields:z.array(z.string().min(1).max(128)).max(100)})])}),
]);
const schema=z.strictObject({sourceSha:z.string().regex(/^[0-9a-f]{40}$/),observerVersion:z.literal('disposable-command-observer-v2'),environment:z.literal('local-disposable-postgres'),plannedIterations:z.number().int().min(1).max(10),observations:z.array(observation).min(8).max(44)});
// Versioned invariants are code-owned, never supplied by the capture producer.
export function serviceInventory(iterations:number):readonly Omit<ServiceObservation,'actual'>[]{
 const rows:Omit<ServiceObservation,'actual'>[]=[];
 for(let i=0;i<iterations;i++)rows.push(
  {id:`flow:${i}:duplicate`,metric:'duplicateCommitment',expected:{commitments:1,salesOrdersCreated:1,secondCommitStatus:409,secondCommitChangedState:false}},
  {id:`flow:${i}:idempotency`,metric:'idempotency',expected:{reserveSame:true,reserveStateSame:true,commitSame:true,commitStateSame:true,reserveRevisionOnce:true,commitRevisionOnce:true}},
  {id:`flow:${i}:stale`,metric:'missedStaleness',expected:{status:'STALE',historicalProofSame:true}},
  {id:`race:${i}`,metric:'raceBehavior',expected:{successes:1,conflicts:1,revisionAdvances:1,commitments:1}},
 );
 rows.push(
  {id:'offline-extraction:0',metric:'extractionCorrectness',expected:{candidates:[{kind:'customer_deposit_min_bps',value:2500,resolution:'pending_confirmation'}],missingFields:[]}},
  {id:'offline-extraction:1',metric:'extractionCorrectness',expected:{error:'AI_OUTPUT_INVALID'}},
  {id:'offline-extraction:2',metric:'extractionCorrectness',expected:{error:'AI_OUTPUT_INVALID'}},
  {id:'offline-extraction:3',metric:'extractionCorrectness',expected:{candidates:[],missingFields:['customer payment date']}},
 );return rows;
}
export function validateServiceEvidence(value:ServiceEvidence,sourceSha:string|undefined):ServiceEvidence{
 const evidence=schema.parse(value),inventory=serviceInventory(evidence.plannedIterations);
 if(evidence.sourceSha!==sourceSha||evidence.observations.length!==inventory.length||new Set(evidence.observations.map(row=>row.id)).size!==inventory.length)throw new Error('INVALID_SERVICE_EVIDENCE');
 for(const row of evidence.observations){const invariant=inventory.find(item=>item.id===row.id);if(!invariant||invariant.metric!==row.metric||sha256Canonical(row.expected)!==sha256Canonical(invariant.expected))throw new Error('INVALID_SERVICE_EVIDENCE');}
 return evidence;
}
export function serviceObservationMatches(row:ServiceObservation):boolean{
 const iteration=Number(row.id.split(':')[1]);
 const expected=serviceInventory(Number.isSafeInteger(iteration)?iteration+1:1).find(item=>item.id===row.id)?.expected;
 if(expected===undefined)throw new Error('INVALID_SERVICE_EVIDENCE');
 return sha256Canonical(row.actual)===sha256Canonical(expected);
}
