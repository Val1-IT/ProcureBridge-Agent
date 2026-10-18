import {describe,it,expect} from 'vitest';
import {workspace,evidence} from './workflow-harness';
import {bootstrapLocalJudge} from '../../../scripts/dealtwin/bootstrap';
import {createPostgresJudgeRuntime} from '../../../lib/server/dealtwin/runtime';
const actor={tenantId:'dealtwin-judge-v1',actorId:'bootstrap-reader',role:'admin' as const};
describe('explicit disposable browser fixture preparation',()=>{
 const db=workspace();
 it('initializes only an explicitly requested empty synthetic fixture and normal bootstrap preserves it',async()=>{
  await db().resetAndMigrate();
  await expect(bootstrapLocalJudge(false)).rejects.toThrow('erp_workspaces was not found');
  await expect(bootstrapLocalJudge(true)).resolves.toHaveProperty('admin.cookies');
  const before=await evidence(db());const runtime=createPostgresJudgeRuntime(db().appPool,db().resetPool);
  const state=await runtime.loadJudgeState(actor);expect(state.revision).toBe(1);expect(state.deals).toHaveLength(2);
  await bootstrapLocalJudge(false);expect(await evidence(db())).toEqual(before);expect(await runtime.loadJudgeState(actor)).toEqual(state);
 });
});
