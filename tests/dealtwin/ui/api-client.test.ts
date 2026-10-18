import { describe,it,expect } from 'vitest';
import { readWorkspace,sendCommand } from '../../../lib/dealtwin/ui/api-client';
describe('UI network boundary, never a local financial state engine',()=>{
 it('returns the actual server response as a readonly source rather than a local Judge template',async()=>{
  const value={schemaVersion:'dealtwin.judge-state.v1',synthetic:true,tenantId:'dealtwin-judge-v1',revision:72,deals:[],cash:{openingBalanceRupiah:'9876543'}};
  const transport:typeof fetch=async(input,init)=>new URL(String(input),'http://localhost').pathname==='/api/dealtwin/judge/state'&&init?.cache==='no-store'&&init.credentials==='same-origin'?Response.json(value):Response.json({ok:false,error:{code:'WRONG_BOUNDARY'}},{status:422});
  expect(await readWorkspace(transport)).toEqual(value);
 });
 it('surfaces server reason/status without guessing a business success on failed command',async()=>{
  const transport:typeof fetch=async()=>Response.json({ok:false,error:{code:'LIQUIDITY_COLLISION'},conflictingCommitmentIds:['occupied-17']},{status:409});
  await expect(sendCommand('/api/dealtwin/deals/d/reserve',{expectedRevision:7,idempotencyKey:'ui-request'},transport)).rejects.toMatchObject({code:'LIQUIDITY_COLLISION',status:409,body:{conflictingCommitmentIds:['occupied-17']}});
 });
 it('does not read fabricated storage/cache when the server is unavailable',async()=>{
  const transport:typeof fetch=async()=>{throw new Error('offline');};
  await expect(readWorkspace(transport)).rejects.toMatchObject({code:'NETWORK_UNAVAILABLE'});
 });
});
