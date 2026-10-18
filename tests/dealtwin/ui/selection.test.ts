import {describe,it,expect} from 'vitest';
import {selectDeal,workflowLinks,type SelectionState} from '../../../lib/dealtwin/ui/selection';
const state:SelectionState={deals:[{id:'deal-a'},{id:'deal-b'}],proofs:[{id:'proof-b',proof_json:{dealId:'deal-b'}}]};
describe('retained server-owned Deal selection',()=>{
 it('retains B through Ledger, ERP and a fresh snapshot after refresh',()=>{
  expect(selectDeal(state,'/dealtwin/commitments','deal-b')).toBe('deal-b');
  expect(selectDeal(structuredClone(state),'/dealtwin/erp','deal-b')).toBe('deal-b');
  expect(workflowLinks('deal-b')).toEqual({ledger:'/dealtwin/commitments?dealId=deal-b',erp:'/dealtwin/erp?dealId=deal-b'});
 });
 it('uses explicit Deal path before query and binds proof path to its persisted Deal',()=>{
  expect(selectDeal(state,'/dealtwin/deals/deal-b','deal-a')).toBe('deal-b');
  expect(selectDeal(state,'/dealtwin/proofs/proof-b','deal-a')).toBe('deal-b');
 });
 it.each(['/dealtwin/deals/missing','/dealtwin/proofs/missing'])('does not substitute another Deal for unknown explicit path %s',path=>{
  expect(selectDeal(state,path,'deal-a')).toBeNull();
 });
 it('does not substitute the first Deal for an unknown query selection',()=>{
  expect(selectDeal(state,'/dealtwin/commitments','missing')).toBeNull();
 });
 it('handles malformed URL IDs without throwing or substituting a Deal',()=>{
  expect(selectDeal(state,'/dealtwin/deals/%E0%A4%A',null)).toBeNull();
 });
 it('defaults only unspecified navigation and represents empty state honestly',()=>{
  expect(selectDeal(state,'/dealtwin',null)).toBe('deal-a');
  expect(selectDeal({deals:[],proofs:[]},'/dealtwin',null)).toBeNull();
  expect(workflowLinks(null)).toEqual({ledger:'/dealtwin/commitments',erp:'/dealtwin/erp'});
 });
});
