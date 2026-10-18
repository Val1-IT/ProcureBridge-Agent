import {z} from 'zod';
export interface ReleaseCheck {readonly id:string;readonly status:'pass'|'fail'|'skipped';readonly testedSha:string;readonly artifactRef:string}
export interface ReleaseEvidence {readonly candidateSha:string;readonly checks:readonly ReleaseCheck[]}
export interface ReleaseGateResult {readonly ready:boolean;readonly blockingReasons:readonly string[]}
export interface TraceabilityRequirement {readonly id:string;readonly requiredCheckIds:readonly string[]}
export const REQUIRED_RELEASE_CHECKS=['dependency_audit','migration_restore','rls','cross_tenant_api','secret_scan','typecheck','lint','tests','coverage','build','authenticated_judge_smoke','tls','least_privilege','backup_restore'] as const;
const sha=z.string().regex(/^[0-9a-f]{40}$/).refine(value=>value!=='0'.repeat(40));
const artifact=z.string().min(1).max(256).regex(/^artifacts\/[A-Za-z0-9._/-]+$/).refine(value=>value.split('/').every(segment=>segment!==''&&segment!=='.'&&segment!=='..'));
const schema=z.strictObject({candidateSha:sha,checks:z.array(z.strictObject({id:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),status:z.enum(['pass','fail','skipped']),testedSha:sha,artifactRef:artifact})).max(256)});
/** Pure structural gate; trusted artifact ingestion/contents are separate evidence. Never deploys. */
export function evaluateReleaseGate(evidence:ReleaseEvidence):ReleaseGateResult{
 const parsed=schema.safeParse(evidence);
 if(!parsed.success)return {ready:false,blockingReasons:['INVALID_RELEASE_EVIDENCE']};
 const value=parsed.data,reasons:string[]=[],seen=new Set<string>();
 for(const check of value.checks){
  if(seen.has(check.id))reasons.push(`DUPLICATE_CHECK:${check.id}`);
  seen.add(check.id);
  if(check.testedSha!==value.candidateSha)reasons.push(`SHA_MISMATCH:${check.id}`);
  if(check.status!=='pass')reasons.push(`CHECK_${check.status.toUpperCase()}:${check.id}`);
 }
 for(const id of REQUIRED_RELEASE_CHECKS)if(!seen.has(id))reasons.push(`MISSING_CHECK:${id}`);
 return {ready:reasons.length===0,blockingReasons:reasons};
}

const requiredDtIds=Array.from({length:42},(_,index)=>`DT-${String(index+1).padStart(3,'0')}`);
const requirementsSchema=z.array(z.strictObject({
 id:z.string().length(6).regex(/^DT-[0-9]{3}$/),
 requiredCheckIds:z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).min(1).max(256),
})).length(42);
/** Trusted policy aggregation only: does not authenticate artifact contents or deploy. */
export function verifyEvidencePacket(evidence:ReleaseEvidence,requirements:readonly TraceabilityRequirement[]):ReleaseGateResult{
 const base=evaluateReleaseGate(evidence);
 if(!base.ready)return base;
 const parsed=requirementsSchema.safeParse(requirements);
 if(!parsed.success)return {ready:false,blockingReasons:['INVALID_TRACEABILITY_REQUIREMENTS']};
 const checks=new Set(evidence.checks.map(check=>check.id)),seen=new Set<string>(),reasons:string[]=[];
 for(const requirement of parsed.data){
  if(seen.has(requirement.id))reasons.push(`DUPLICATE_REQUIREMENT:${requirement.id}`);
  seen.add(requirement.id);
  if(!requiredDtIds.includes(requirement.id))reasons.push(`UNKNOWN_REQUIREMENT:${requirement.id}`);
  const requiredChecks=new Set<string>();
  for(const id of requirement.requiredCheckIds){
   if(requiredChecks.has(id))reasons.push(`DUPLICATE_REQUIREMENT_CHECK:${requirement.id}:${id}`);
   requiredChecks.add(id);
   if(!checks.has(id))reasons.push(`MISSING_REQUIREMENT_EVIDENCE:${requirement.id}:${id}`);
  }
 }
 for(const id of requiredDtIds)if(!seen.has(id))reasons.push(`MISSING_REQUIREMENT:${id}`);
 return {ready:reasons.length===0,blockingReasons:reasons};
}
