import {it,expect,describe} from 'vitest';
import {GET} from '../../../app/api/dealtwin/judge/state/route';
import {POST as compile} from '../../../app/api/dealtwin/deals/[dealId]/compile/route';
import {POST as reset} from '../../../app/api/dealtwin/judge/reset/route';
import {workspace,request,params,mutation} from './workflow-harness';
import {decodeWorkspace} from '../../../lib/dealtwin/ui/workspace';
describe('Judge guide exposes actual durable run evidence',()=>{
 workspace();
 it('retains exact compile evidence across reads, and reset clears current runs but not receipt history',async()=>{
  const command={...mutation(1,'guide-compile'),dealVersionId:'judge-version-a-1'};
  const response=await compile(request('deals/judge-deal-a/compile',command),params());expect(response.status).toBe(200);const original=await response.json();
  const readState=async()=>decodeWorkspace(await (await GET(request('judge/state'))).json());
  const state=await readState();
  expect(state.compileRuns).toEqual(expect.arrayContaining([expect.objectContaining({outcome:'DOES_NOT_COMPILE',violation_data:expect.objectContaining({shortfallRupiah:'3000000'})})]));
  expect((await readState()).compileRuns).toEqual(state.compileRuns);
  expect((await reset(request('judge/reset',mutation(2,'guide-reset')))).status).toBe(200);
  expect((await readState()).compileRuns).toEqual([]);
  expect(await (await compile(request('deals/judge-deal-a/compile',command),params())).json()).toEqual(original);
 });
});
