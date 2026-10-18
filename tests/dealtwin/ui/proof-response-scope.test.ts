import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {WorkflowView} from '../../../components/dealtwin/workflow-view';
import {createJudgeScenario} from '../../../lib/dealtwin/judge/scenario';
import {createDealVersion} from '../../../lib/dealtwin/domain/deal';
import {buildDealProof} from '../../../lib/dealtwin/proof/build-proof';
import type {ServerWorkspace} from '../../../lib/dealtwin/ui/workspace';

const view=vi.hoisted(()=>({proofId:'proof-b',context:{} as Record<string,unknown>}));
vi.mock('next/navigation',()=>({useParams:()=>({proofId:view.proofId})}));
vi.mock('../../../components/dealtwin/workspace-provider',()=>({useWorkspace:()=>view.context}));

function setup(response:unknown){
 const scenario=createJudgeScenario();
 const version=createDealVersion({id:'display-version',dealId:'display-deal',version:1,terms:scenario.candidateTermsA,createdBy:'synthetic',createdAt:'2026-09-12T00:00:00.000Z'});
 const proofs=['proof-a','proof-b'].map(id=>{
  const built=buildDealProof({proofId:id,dealId:version.dealId,version,snapshot:scenario.snapshot,constraints:scenario.constraints,policy:scenario.policy,baseResult:scenario.candidateResult,stressRuns:[],assumptions:[],approvals:[{id:'approval-'+id,proofId:id,dealVersionId:version.id,kind:'non_arithmetic_authorization',status:'pending'}],approvedApprovalCodes:[],generatedAt:version.createdAt});
  if(!built.ok)throw new Error(built.error.message);
  return {id,status:built.value.dto.status,stale_reason:null,proof_json:built.value.dto};
 });
 // Rendering fixture only: no browser, network, database or financial mutation.
 const snapshot:Pick<ServerWorkspace,'actor'|'deals'|'versions'|'proofs'|'commitments'|'approvals'|'constraints'|'revision'>={
  actor:{actorId:'synthetic-sales',role:'sales'},revision:7,
  deals:[{id:version.dealId,title:'Display fixture',customerId:'customer',currentVersionId:version.id,status:'PROOF_GENERATED',committedSalesOrderId:null}],
  versions:[version],proofs,commitments:[],approvals:[],constraints:[],
 };
 view.proofId='proof-b';
 view.context={snapshot,loading:false,busy:false,error:null,commandError:null,lastResponse:response,detail:null,selectedDealId:version.dealId,refresh:vi.fn(),run:vi.fn(),canRetry:false,retryLast:vi.fn()};
 return proofs;
}
const render=()=>renderToStaticMarkup(createElement(WorkflowView,{mode:'proof'}));
const replay=(proofId?:string)=>({...(proofId?{proofId}:{}),replayed:true,historical:{resultHash:'original-result',recomputedResultHash:'original-result'}});

describe('proof diagnostics remain bound to the server response owner during navigation',()=>{
 it('does not show proof A replay success on proof B, while preserving the labeled original response',()=>{
  setup(replay('proof-a'));const html=render();
  expect(html).not.toContain('Replay · genuinely recomputed');
  expect(html).toContain('Last original server operation response');
  expect(html).toContain('original-result');
 });
 it('does not infer a proof owner when the response omits its identity',()=>{
  setup(replay());expect(render()).not.toContain('Replay · genuinely recomputed');
 });
 it('shows an actual replay response only on its matching proof, including navigation back',()=>{
  setup(replay('proof-a'));view.proofId='proof-a';expect(render()).toContain('Replay · genuinely recomputed');
  view.proofId='proof-b';expect(render()).not.toContain('Replay · genuinely recomputed');
  view.proofId='proof-a';expect(render()).toContain('Replay · genuinely recomputed');
 });
 it('does not label proof A stress results as diagnostics for proof B',()=>{
  const proofs=setup(null);
  view.context.lastResponse={proofId:'proof-a',scope:'historical_proof',runs:[{id:'stress-a-only',result:proofs[0]!.proof_json.baseResult}]};
  expect(render()).not.toContain('<h3>stress-a-only</h3>');
 });
 it('renders matching proof stress diagnostics without turning them into current financial authority',()=>{
  const proofs=setup(null);
  view.context.lastResponse={proofId:'proof-b',scope:'historical_proof',runs:[{id:'stress-b-only',result:proofs[1]!.proof_json.baseResult}]};
  const html=render();expect(html).toContain('<h3>stress-b-only</h3>');
  expect(html).toContain('Diagnostics are not current allocation authority');
 });
});
