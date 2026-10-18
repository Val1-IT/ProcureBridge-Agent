import {it,expect,describe} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JudgeGuide,selectJudgeStep,type JudgeStateDto} from '../../../components/dealtwin/judge-guide';
const empty:JudgeStateDto={deals:[],versions:[],proofs:[],commitments:[],constraints:[],approvals:[],compileRuns:[]};
function state():JudgeStateDto{return {...empty,
 deals:[{id:'judge-deal-a',currentVersionId:'a-v2',committedSalesOrderId:null},{id:'judge-deal-b',currentVersionId:'b-v1',committedSalesOrderId:null}],
 versions:[{id:'judge-version-a-1',dealId:'judge-deal-a'},{id:'a-v2',dealId:'judge-deal-a'},{id:'b-v1',dealId:'judge-deal-b'}],
 constraints:[{deal_version_id:'a-v2',resolution:'confirmed'}],
 proofs:[{id:'a-proof',status:'CONDITIONALLY_VALID',replayed_at:null,proof_json:{dealId:'judge-deal-a',dealVersionId:'a-v2',dealVersion:2}}],
 approvals:[{proof_id:'a-proof',status:'pending'}],
 compileRuns:[{deal_version_id:'judge-version-a-1',kind:'base',outcome:'DOES_NOT_COMPILE',violation_data:{}},{deal_version_id:'a-v2',kind:'recompile',outcome:'CONDITIONALLY_VALID',violation_data:{}},{deal_version_id:'a-v2',kind:'stress',outcome:'CONDITIONALLY_VALID',violation_data:{}}]};}
describe('Judge guide uses only durable server evidence',()=>{
 it('has twelve accessible steps and does not invent a financial success',()=>{
  const html=renderToStaticMarkup(createElement(JudgeGuide,{state:empty}));
  expect(html).toContain('Judge Mode');expect(html.match(/data-judge-step=/g)).toHaveLength(12);
  expect(html).not.toContain('Rp5.000.000');expect(selectJudgeStep(empty).completed).toEqual(Array(12).fill(false));
 });
 it('shows approval gating on reserved capacity and stays the same after a new snapshot',()=>{
  const reserved={...state(),commitments:[{proof_id:'a-proof',status:'reserved'}]};
  expect(selectJudgeStep(reserved)).toMatchObject({number:8,status:'WAITING_FOR_APPROVAL'});
  expect(selectJudgeStep(structuredClone(reserved))).toEqual(selectJudgeStep(reserved));
  expect(selectJudgeStep({...reserved,approvals:[{proof_id:'a-proof',status:'approved'}]})).toMatchObject({number:8,status:'READY_TO_COMMIT'});
 });
 it('does not mark a collision from another unrelated successful compile',()=>{
  const value=state();const committed={...value,deals:value.deals.map(row=>row.id==='judge-deal-a'?{...row,committedSalesOrderId:'so-one'}:row),commitments:[{proof_id:'a-proof',status:'committed'}]};
  expect(selectJudgeStep(committed).number).toBe(9);
  expect(selectJudgeStep({...committed,compileRuns:[...committed.compileRuns,{deal_version_id:'b-v1',kind:'base',outcome:'DOES_NOT_COMPILE',violation_data:{conflictingCommitmentIds:['a-capacity']}}]}).number).toBe(10);
 });
 it('requires persisted historical replay and keeps committed remediation separate',()=>{
  const value=state();const final={...value,deals:value.deals.map(row=>row.id==='judge-deal-a'?{...row,committedSalesOrderId:'so-one'}:row),
   commitments:[{proof_id:'a-proof',status:'committed'}],
   proofs:[{...value.proofs[0]!,status:'STALE'}, {id:'a-proposal',status:'CONDITIONALLY_VALID',proof_json:{dealId:'judge-deal-a',dealVersionId:'a-v3',dealVersion:3}}],
   compileRuns:[...value.compileRuns,{deal_version_id:'b-v1',kind:'base',outcome:'DOES_NOT_COMPILE',violation_data:{conflictingCommitmentIds:['a-capacity']}}]};
  expect(selectJudgeStep(final)).toMatchObject({number:12,status:'REPLAY_HISTORICAL_PROOF'});
  expect(selectJudgeStep({...final,proofs:final.proofs.map(row=>row.id==='a-proof'?{...row,replayed_at:'2026-10-13T00:00:00.000Z'}:row)}).status).toBe('COMPLETE_REMEDIATION_PENDING');
  expect(final.deals[0]?.committedSalesOrderId).toBe('so-one');
 });
});
