import { describe,it,expect } from 'vitest';
import { GET } from '../../../app/api/dealtwin/judge/state/route';
import { workspace,request } from './workflow-harness';
describe('Judge caller profile is server presentation metadata, never body authority',()=>{
 workspace();
 it('echoes only the authenticated actor/role for UI without changing its tenant/business seed',async()=>{
  const response=await GET(request('judge/state'));expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({synthetic:true,tenantId:'dealtwin-judge-v1',actor:{actorId:'task22-admin',role:'admin'}});
 });
});
