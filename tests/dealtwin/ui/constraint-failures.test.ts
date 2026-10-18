import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {DealCompiler} from '../../../components/dealtwin/deal-compiler';
import type {CompileResultDto} from '../../../lib/dealtwin/ui/contracts';

type Evaluation=CompileResultDto['evaluations'][number];
function render(evaluations:readonly Evaluation[]){
 const result:CompileResultDto={outcome:'DOES_NOT_COMPILE',reasonCode:'MINIMUM_CASH_VIOLATION',firstViolationDate:'2027-01-02',cashFloorRupiah:'5000000',shortfallRupiah:'1234',
  effectiveHorizonEnd:'2027-01-31',horizonExpanded:false,horizonExpansionEventIds:[],conflictingCommitmentIds:[],unresolvedConstraintIds:[],worstLiquidityPoint:null,timeline:null,evaluations};
 return renderToStaticMarkup(createElement(DealCompiler,{result}));
}
const failed:Evaluation={constraintId:'cash-floor-policy',kind:'minimum_cash_rupiah',status:'fail',reasonCode:'MINIMUM_CASH_VIOLATION',violationDate:'2027-01-02',shortfallRupiah:'1234'};

describe('visible constraint failures retain individual server evidence',()=>{
 it('shows every failed constraint before collapsed evidence, with its own date and exact money rather than the primary failure values',()=>{
  const html=render([failed,{...failed,constraintId:'borrowing-policy',kind:'new_borrowing_allowed',reasonCode:'NEW_BORROWING_PROHIBITED',violationDate:'2027-01-09',shortfallRupiah:'9007199254740993'}]);
  const visible=html.slice(html.indexOf('data-testid="constraint-failures"'),html.indexOf('<details>'));
  expect(visible).toContain('<h3>Failed constraints</h3>');
  const rows=[...visible.matchAll(/<li>(.*?)<\/li>/g)].map(match=>match[1]);
  expect(rows).toHaveLength(2);
  for(const text of ['cash-floor-policy','minimum_cash_rupiah','2027-01-02','Rp1.234'])expect(rows[0]).toContain(text);
  for(const text of ['borrowing-policy','NEW_BORROWING_PROHIBITED','2027-01-09','Rp9.007.199.254.740.993'])expect(rows[1]).toContain(text);
  expect(rows[1]).not.toContain('Rp1.234');
 });
 it('does not invent cash shortfall or failure date for a non-cash constraint with missing fields',()=>{
  const html=render([{...failed,constraintId:'warehouse-stock',kind:'required_inventory_available',reasonCode:'INSUFFICIENT_INVENTORY',violationDate:null,shortfallRupiah:null}]);
  const visible=html.slice(html.indexOf('data-testid="constraint-failures"'),html.indexOf('<details>'));
  expect(visible).toContain('warehouse-stock');expect(visible).toContain('INSUFFICIENT_INVENTORY');
  expect(visible).toContain('<dt>Failure date</dt><dd>Not reported</dd>');
  expect(visible).toContain('<dt>Cash shortfall</dt><dd>Not reported</dd>');
  expect(visible).not.toContain('Rp');expect(visible).not.toContain('2027-01-02');
 });
 it('does not mislabel passing, pending or unresolved evaluations as failed constraints',()=>{
  const html=render(['pass','pending','unresolved'].map(status=>({...failed,constraintId:status,status})));
  expect(html).not.toContain('data-testid="constraint-failures"');
  expect(html).not.toContain('<h3>Failed constraints</h3>');
  expect(html).toContain('Constraint evidence');
 });
});
