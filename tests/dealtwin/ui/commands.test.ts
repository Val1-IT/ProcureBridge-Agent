import { describe,it,expect } from 'vitest';
import { buildCommand,type CommandState } from '../../../lib/dealtwin/ui/commands';
function state():CommandState{return {revision:17,deals:[{id:'data-deal',title:'Server Deal',customerId:'cust',currentVersionId:'version-new',status:'PROOF_GENERATED',committedSalesOrderId:null}],
 proofs:[{id:'proof-new',status:'CONDITIONALLY_VALID',proof_json:{id:'proof-new',dealId:'data-deal',dealVersion:2,dealVersionId:'version-new',canonicalEventHash:'b'.repeat(64)}},
 {id:'proof-old',status:'STALE',proof_json:{id:'proof-old',dealId:'data-deal',dealVersion:1,dealVersionId:'version-old',canonicalEventHash:'a'.repeat(64)}}],
 commitments:[{id:'old-capacity',proof_id:'proof-old',deal_version_id:'version-old',canonical_event_hash:'a'.repeat(64),status:'reserved'}],
 approvals:[{id:'approval-new',proof_id:'proof-new',deal_version_id:'version-new'}],constraints:[{id:'material-1',deal_version_id:'version-new'},{id:'material-2',deal_version_id:'version-new'}]};}
describe('UI commands navigate server identities, never calculate financial decisions',()=>{
 it('replays the explicitly viewed historical proof rather than substituting the newest one',()=>{
  expect(buildCommand(state(),'data-deal',{kind:'replay'},'replay-old','proof-old').path).toBe('/api/dealtwin/proofs/proof-old/replay');
 });
 it('rejects an explicit unknown or foreign proof rather than allocating from a different proof',()=>{
  expect(()=>buildCommand(state(),'data-deal',{kind:'reserve'},'bad-proof','foreign-proof')).toThrow('PROOF_IDENTITY_MISMATCH');
 });
 it('compile uses current server version/revision and sends no tenant/actor/role/cash truth',()=>{
  expect(buildCommand(state(),'data-deal',{kind:'compile'},'request-1')).toEqual({path:'/api/dealtwin/deals/data-deal/compile',method:'POST',body:{expectedRevision:17,idempotencyKey:'request-1',dealVersionId:'version-new'}});
 });
 it('reserve uses the server proof/version/hash, not a reconstructed candidate or balance',()=>{
  expect(buildCommand(state(),'data-deal',{kind:'reserve'},'request-2')).toEqual({path:'/api/dealtwin/deals/data-deal/reserve',method:'POST',body:{expectedRevision:17,idempotencyKey:'request-2',proofId:'proof-new',dealVersionId:'version-new',canonicalEventHash:'b'.repeat(64)}});
 });
 it('replacement carries both exact persisted tuples and retains old capacity until the server transaction succeeds',()=>{
  const value=state();const before=structuredClone(value);
  expect(buildCommand(value,'data-deal',{kind:'replace'},'swap')).toEqual({path:'/api/dealtwin/commitments/old-capacity/replace',method:'POST',body:{expectedRevision:17,idempotencyKey:'swap',previous:{proofId:'proof-old',dealVersionId:'version-old',canonicalEventHash:'a'.repeat(64)},replacement:{proofId:'proof-new',dealVersionId:'version-new',canonicalEventHash:'b'.repeat(64)}}});
  expect(value).toEqual(before);
 });
 it('confirmation includes all selected version material IDs without inventing field values',()=>{
  expect(buildCommand(state(),'data-deal',{kind:'confirm'},'confirm').body).toEqual({expectedRevision:17,idempotencyKey:'confirm',dealVersionId:'version-new',constraintIds:['material-1','material-2']});
 });
 it('approval is a fixed proof/version request, not an authority granted by a browser role selector',()=>{
  const command=buildCommand(state(),'data-deal',{kind:'approve',approvalId:'approval-new'},'approval');
  expect(command.path).toBe('/api/dealtwin/approvals/approval-new/decision');expect(command.body).toMatchObject({expectedRevision:17,proofId:'proof-new',dealVersionId:'version-new',decision:'approved'});expect(command.body).not.toHaveProperty('role');
 });
 it('stress is an explicit server projection request, not a local modification of events',()=>{
  const value=state();const before=structuredClone(value);const command=buildCommand(value,'data-deal',{kind:'delay3'},'stress');
  expect(command.path).toBe('/api/dealtwin/proofs/proof-new/stress');expect(command.body).toMatchObject({expectedRevision:17,scenarios:[{schemaVersion:'dealtwin.stress-scenario.v1',type:'customer_receipt_delay',days:3}]});expect(value).toEqual(before);
 });
 it('a committed operational link cannot become a second COMMIT through the UI helper',()=>{
  const original=state();const value:CommandState={...original,deals:[{...original.deals[0]!,status:'COMMITTED',committedSalesOrderId:'existing-so'}]};
  expect(()=>buildCommand(value,'data-deal',{kind:'commit'},'second')).toThrow('DEAL_ALREADY_COMMITTED');
 });
 it('selects the latest generated proof within one immutable version instead of arbitrary DB id ordering',()=>{
  const value=state();const older={...value.proofs[0]!,proof_json:{...value.proofs[0]!.proof_json,id:'a-older',generatedAt:'2026-10-07T00:00:00.000Z'}};
  const newer={...value.proofs[0]!,id:'z-newer',proof_json:{...value.proofs[0]!.proof_json,id:'z-newer',generatedAt:'2026-10-07T00:01:00.000Z'}};
  const latest:CommandState={...value,proofs:[older,newer]};
  expect(buildCommand(latest,'data-deal',{kind:'reserve'},'latest').body).toMatchObject({proofId:'z-newer'});
 });
});
