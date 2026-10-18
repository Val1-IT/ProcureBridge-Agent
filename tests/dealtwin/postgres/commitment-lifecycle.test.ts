import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createPostgresCommitmentService} from '../../../lib/server/postgres/postgres-commitment-service';
import {createPostgresJudgeRuntime} from '../../../lib/server/dealtwin/runtime';
import {PostgresErpRepository,loadErpWorkspace} from '../../../lib/server/postgres/postgres-erp-repository';
import {withTransaction} from '../../../lib/server/postgres/transaction';
import {lockTenantWorkspace} from '../../../lib/server/postgres/proof-invalidation';
import {recordPayment} from '../../../lib/erp/commands/finance';
import {createJudgeScenario} from '../../../lib/dealtwin/judge/scenario';
import {PostgresDealTwinRepository} from '../../../lib/server/postgres/postgres-dealtwin-repository';
import {canonicalCashEventDto} from '../../../lib/dealtwin/domain/canonical-event';
import {prepareCommitmentProof} from '../../../lib/dealtwin/proof/replay-proof';
import {compileDeal} from '../../../lib/dealtwin/compiler/compile-deal';
import {isoDate} from '../../../lib/dealtwin/domain/date';
import {parseRupiah} from '../../../lib/dealtwin/domain/money';
import type {DatedCashEvent} from '../../../lib/dealtwin/domain/cash-event';
import type {OperationResponse,CommitmentCommandInput} from '../../../lib/dealtwin/application/operation-contracts';
import type {CommitmentStatus} from '../../../lib/dealtwin/domain/commitment';
import {PostgresHarness,JUDGE_TENANT_ID} from './harness';
import {seed,proofFixture,context,evidence} from './commitment-fixture';

let harness:PostgresHarness;
const deadline='2026-09-16T13:00:00.000Z';
const ctx=(revision:number,key:string,now=deadline)=>({...context(revision,key),now});
const errorCode=(r:OperationResponse)=>(r.body as {error?:{code:string}}).error?.code;
const actions={release:'dealtwin.commitment.released',expire:'dealtwin.commitment.expired',cancel:'dealtwin.commitment.cancelled'} as const;
type Operation=keyof typeof actions;
const target={release:'released',expire:'expired',cancel:'cancelled'} as const;
function run(operation:Operation,revision:number,key:string,input:CommitmentCommandInput,now=deadline) {
  const service=createPostgresCommitmentService(harness.appPool);
  return operation==='release'?service.releaseCommitment(ctx(revision,key,now),input):operation==='expire'?service.expireCommitment(ctx(revision,key,now),input):service.cancelCommitment(ctx(revision,key,now),input);
}
async function row(id:string) {
  return withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>(await tx.query('select to_jsonb(t) row from public.dealtwin_liquidity_commitments t where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,id])).rows[0]?.row as Record<string,unknown>);
}
function history(value:Record<string,unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['status','updated_at','released_at','release_evidence','release_idempotency_key'].includes(key)));
}
async function fixture(status:CommitmentStatus='reserved') {
  const a=await proofFixture(harness,'a',true);
  const service=createPostgresCommitmentService(harness.appPool);
  const reserve=await service.reserveLiquidity(context(1,'life-reserve'),a.input);
  expect(reserve.httpStatus).toBe(200);
  const input={...a.input,commitmentId:(reserve.body as {commitmentId:string}).commitmentId};
  let revision=2; let commit:OperationResponse|undefined;
  if (status==='committed') {
    commit=await service.commitDeal(context(2,'life-commit'),a.input); expect(commit.httpStatus).toBe(200); revision=3;
  }
  await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{
    await lockTenantWorkspace(tx,JUDGE_TENANT_ID);
    // Historical terminal fixtures exercise the locked table without calling the missing feature during setup.
    await tx.query('update public.dealtwin_liquidity_commitments set status=$3,expires_at=$4 where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,input.commitmentId,status,deadline]);
  });
  return {...a,input,reserve,commit,revision,service};
}
async function observer() {
  const rows=await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID).listActiveCommitments());
  const commitments=rows.map(r=>({...r,events:(r.canonicalEvents as Array<Record<string,unknown>>).map(e=>({...e,date:isoDate(e.date as string),amountRupiah:parseRupiah(e.amountRupiah as string)}) as DatedCashEvent)}));
  const terms={...createJudgeScenario().candidateTermsA,directCostEvents:[]};
  return proofFixture(harness,'observer',true,terms,undefined,commitments);
}
describe('Task17 PostgreSQL lifecycle and immutable operation replay',()=>{
  beforeAll(async()=>{harness=await PostgresHarness.connect();});
  afterAll(async()=>{await harness?.close();});
  beforeEach(async()=>{await harness.resetAndMigrate();await seed(harness);});
  const cases=(['reserved','committed','released','expired','cancelled'] as const).flatMap(status=>(['release','expire','cancel'] as const).map(operation=>({status,operation,
    allowed:status==='reserved'||(status==='committed'&&operation!=='expire')})));
  it.each(cases)('$status → $operation follows the transition table and preserves immutable history',async({status,operation,allowed})=>{
    const a=await fixture(status); const before=await evidence(harness); const original=await row(a.input.commitmentId);
    const result=await run(operation,a.revision,`life-${operation}`,a.input);
    if (!allowed) {
      expect(errorCode(result)).toBe('INVALID_COMMITMENT_TRANSITION');expect(await evidence(harness)).toEqual(before);return;
    }
    expect(result.httpStatus).toBe(200);expect(result.body).toMatchObject({status:target[operation],revision:a.revision+1,commitmentId:a.input.commitmentId});
    const after=await row(a.input.commitmentId);expect(history(after)).toEqual(history(original));
    expect(after.release_idempotency_key).toBe(operation==='release'?`life-${operation}`:null);
    expect(after.released_at===null).toBe(operation!=='release');expect(after.release_evidence===null).toBe(operation!=='release');
    expect(Object.keys(after).filter(key=>key.endsWith('_idempotency_key')).sort()).toEqual(['commit_idempotency_key','release_idempotency_key','reserve_idempotency_key']);
    const erp=await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    const oldErp=before.erp as typeof erp;
    const businessState=(value:typeof erp)=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='revision'&&key!=='auditLogs'));
    const oldBusiness=businessState(oldErp);const business=businessState(erp);
    expect(business).toEqual(oldBusiness);expect(erp.revision).toBe(a.revision+1);
    expect(erp.auditLogs.filter(event=>event.action===actions[operation])).toHaveLength(1);
    expect(erp.auditLogs).toHaveLength(oldErp.auditLogs.length+1);
    const freshState=await createPostgresJudgeRuntime(harness.appPool,harness.resetPool).loadJudgeState(ctx(a.revision+1,'state'));
    expect(freshState.revision).toBe(a.revision+1);expect(freshState.commitments.find(c=>(c as {id:string}).id===a.input.commitmentId)).toMatchObject({status:target[operation],expires_at:'2026-09-16T13:00:00.000000Z'});
    expect(await createPostgresJudgeRuntime(harness.appPool,harness.resetPool).loadJudgeState(ctx(a.revision+1,'state-again'))).toEqual(freshState);
    const fixed=await evidence(harness);
    expect(await run(operation,a.revision,`life-${operation}`,a.input,'2030-01-01T00:00:00.000Z')).toEqual(result);
    expect(errorCode(await run(operation,a.revision,`life-${operation}`,{...a.input,canonicalEventHash:'a'.repeat(64)}))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await a.service.reserveLiquidity(context(1,'life-reserve'),a.input)).toEqual(a.reserve);
    if (a.commit) {
      expect(await a.service.commitDeal(context(2,'life-commit'),a.input)).toEqual(a.commit);
      expect(errorCode(await a.service.commitDeal(context(a.revision+1,'second-commit'),a.input))).toBe('DEAL_ALREADY_COMMITTED');
    }
    expect(await evidence(harness)).toEqual(fixed);
  });
  it('expiry requires a configured deadline, denies early execution, and admits exact equality',async()=>{
    const a=await fixture();const before=await evidence(harness);
    expect(errorCode(await run('expire',2,'expiry',a.input,'2026-09-16T12:59:59.999Z'))).toBe('COMMITMENT_NOT_EXPIRED');
    expect(await evidence(harness)).toEqual(before);
    await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{await lockTenantWorkspace(tx,JUDGE_TENANT_ID);await tx.query('update public.dealtwin_liquidity_commitments set expires_at=null where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,a.input.commitmentId]);});
    const unconfigured=await evidence(harness);
    expect(errorCode(await run('expire',2,'expiry',a.input))).toBe('COMMITMENT_NOT_EXPIRED');expect(await evidence(harness)).toEqual(unconfigured);
    await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{await lockTenantWorkspace(tx,JUDGE_TENANT_ID);await tx.query('update public.dealtwin_liquidity_commitments set expires_at=$3 where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,a.input.commitmentId,deadline]);});
    expect((await run('expire',2,'expiry',a.input)).httpStatus).toBe(200);
  });
  it('expiry does not truncate a PostgreSQL microsecond deadline to JavaScript milliseconds',async()=>{
    const a=await fixture();await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>{await lockTenantWorkspace(tx,JUDGE_TENANT_ID);await tx.query('update public.dealtwin_liquidity_commitments set expires_at=$3 where tenant_id=$1 and id=$2',[JUDGE_TENANT_ID,a.input.commitmentId,'2026-09-16T13:00:00.000500Z']);});
    const before=await evidence(harness);
    expect(errorCode(await run('expire',2,'submillisecond',a.input))).toBe('COMMITMENT_NOT_EXPIRED');expect(await evidence(harness)).toEqual(before);
    expect((await run('expire',2,'submillisecond',a.input,'2026-09-16T13:00:00.001Z')).httpStatus).toBe(200);
  });
  it.each(['release','expire','cancel'] as const)('%s original receipt survives Judge reset and repository recreation',async operation=>{
    const a=await fixture();const original=await run(operation,2,'reset-history',a.input);expect(original.httpStatus).toBe(200);
    const runtime=createPostgresJudgeRuntime(harness.appPool,harness.resetPool);
    expect((await runtime.resetJudgeTenant(context(3,'life-reset'))).httpStatus).toBe(200);
    const before=await evidence(harness);
    expect(await run(operation,2,'reset-history',a.input)).toEqual(original);
    expect(errorCode(await run(operation,4,'new-after-reset',a.input))).toBe('COMMITMENT_NOT_FOUND');expect(await evidence(harness)).toEqual(before);
  });
  it('permits cleanup when proof is STALE without rewriting proof, cash evidence, or the Deal',async()=>{
    const a=await fixture();const repository=new PostgresErpRepository(harness.appPool);const erp=await repository.loadWorkspace(JUDGE_TENANT_ID);
    const paid=recordPayment(erp,'finance',{invoiceId:'judge-existing-ap',direction:'payable',amount:4000000},'2026-09-13T12:00:00.000Z');
    if (!paid.ok) throw new Error(paid.error.message);await repository.saveAtomic(JUDGE_TENANT_ID,2,paid.state);
    expect(errorCode(await a.service.commitDeal(context(3,'stale-attempt'),a.input))).toBe('PROOF_STALE');
    const before=await evidence(harness);expect((await run('release',3,'stale-cleanup',a.input)).httpStatus).toBe(200);
    const after=await evidence(harness);expect(after.dealtwin_proofs).toEqual(before.dealtwin_proofs);expect(after.dealtwin_deals).toEqual(before.dealtwin_deals);expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);
    const fresh=await repository.loadWorkspace(JUDGE_TENANT_ID);expect(fresh.revision).toBe(4);expect(fresh.payments).toEqual(paid.state.payments);
    expect((await row(a.input.commitmentId)).status).toBe('released');
  });
  it('denies foreign context, wrong identity/revision, missing target, unauthorized replay and non-app credentials',async()=>{
    const a=await fixture();const service=a.service;const before=await evidence(harness);
    expect(errorCode(await service.releaseCommitment({...ctx(2,'x'),tenantId:'foreign'},a.input))).toBe('FORBIDDEN_JUDGE_CONTEXT');
    expect(errorCode(await service.releaseCommitment({...ctx(2,'x'),role:'warehouse'},a.input))).toBe('FORBIDDEN_ROLE');
    expect(errorCode(await run('release',1,'x',a.input))).toBe('REVISION_CONFLICT');
    expect(errorCode(await run('release',2,'x',{...a.input,proofId:'other-proof'}))).toBe('COMMITMENT_IDENTITY_MISMATCH');
    expect(errorCode(await run('release',2,'x',{...a.input,commitmentId:'missing'}))).toBe('COMMITMENT_NOT_FOUND');
    for (const pool of [harness.ownerPool,harness.resetPool]) await expect(createPostgresCommitmentService(pool).releaseCommitment(ctx(2,'x'),a.input)).rejects.toThrow('least-privilege');
    expect(await evidence(harness)).toEqual(before);
    expect((await run('release',2,'protected',a.input)).httpStatus).toBe(200);const released=await evidence(harness);
    expect(errorCode(await service.releaseCommitment({...ctx(2,'protected'),actorId:'another'},a.input))).toBe('FORBIDDEN_ROLE');
    expect(errorCode(await service.releaseCommitment({...ctx(2,'protected'),role:'finance'},a.input))).toBe('FORBIDDEN_ROLE');
    for(const changed of [{...a.input,commitmentId:'another'}, {...a.input,proofId:'another'}, {...a.input,dealVersionId:'another'}]) expect(errorCode(await run('release',2,'protected',changed))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(errorCode(await run('release',3,'protected',a.input))).toBe('IDEMPOTENCY_KEY_REUSED');expect(await evidence(harness)).toEqual(released);
  });
  it.each((['release','expire','cancel'] as const).flatMap(operation=>(['after-update','before-audit','after-receipt'] as const).map(point=>({operation,point}))))('rolls back $operation at $point and leaves its key retryable',async({operation,point})=>{
    const a=await fixture();const before=await evidence(harness);const table=point==='after-update'?'dealtwin_liquidity_commitments':'erp_audit_events';
    const timing=point==='before-audit'?'before':'after';const event=point==='after-update'?'update':'insert';
    const predicate=point==='after-update'?`new.status='${target[operation]}'`:`new.action='${actions[operation]}'`;
    await harness.ownerPool.query(`create function public.t17_fail() returns trigger language plpgsql as $$ begin if ${predicate} then raise exception 'task17 injected failure'; end if; return new; end $$;
      create trigger t17_fail ${timing} ${event} on public.${table} for each row execute function public.t17_fail()`);
    try {await expect(run(operation,2,'rollback',a.input)).rejects.toThrow('task17 injected failure');}
    finally {await harness.ownerPool.query(`drop trigger t17_fail on public.${table};drop function public.t17_fail()`);}
    expect(await evidence(harness)).toEqual(before);expect((await run(operation,2,'rollback',a.input)).httpStatus).toBe(200);
  });
  it('a conditional UPDATE that returns zero rows is not treated as success',async()=>{
    const a=await fixture();const before=await evidence(harness);
    await harness.ownerPool.query("create function public.t17_skip() returns trigger language plpgsql as $$ begin if new.status='released' then return null; end if; return new; end $$;create trigger t17_skip before update on public.dealtwin_liquidity_commitments for each row execute function public.t17_skip()");
    try {await expect(run('release',2,'zero-rows',a.input)).rejects.toThrow('exactly one');}
    finally {await harness.ownerPool.query('drop trigger t17_skip on public.dealtwin_liquidity_commitments;drop function public.t17_skip()');}
    expect(await evidence(harness)).toEqual(before);expect((await run('release',2,'zero-rows',a.input)).httpStatus).toBe(200);
  });
  it.each(['release','expire','cancel'] as const)('%s invalidates dependent external proofs but exempts only its exact owner tuple',async operation=>{
    const a=await fixture();const other=await observer();const before=await evidence(harness);
    const result=await run(operation,2,'invalidate-capacity',a.input);expect(result.httpStatus).toBe(200);
    const proofs=await withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>(await tx.query('select id,status,proof_json,stale_reason from public.dealtwin_proofs where tenant_id=$1 order by id',[JUDGE_TENANT_ID])).rows);
    expect(proofs.find(p=>p.id===a.proof.id)?.status).toBe('VALID');
    expect(proofs.find(p=>p.id===other.proof.id)?.status).toBe('STALE');
    expect(proofs.find(p=>p.id===other.proof.id)?.stale_reason).toContain('query:active-commitments');
    expect(proofs.find(p=>p.id===a.proof.id)?.proof_json).toEqual(a.proof);expect(proofs.find(p=>p.id===other.proof.id)?.proof_json).toEqual(other.proof);
    const erp=await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID);
    expect(erp.revision).toBe(3);expect(erp.auditLogs.filter(e=>e.action===actions[operation])).toHaveLength(1);
    expect(erp.auditLogs.filter(e=>e.action==='dealtwin.proof.stale')).toHaveLength(1);
    const after=await evidence(harness);expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);expect(after.erp_sales_orders).toEqual(before.erp_sales_orders);
    expect(await run(operation,2,'invalidate-capacity',a.input)).toEqual(result);expect(await evidence(harness)).toEqual(after);
  });
  it('rolls back dependent proof invalidation and its audit if the success receipt fails',async()=>{
    const a=await fixture();await observer();const before=await evidence(harness);
    await harness.ownerPool.query("create function public.t17_fail() returns trigger language plpgsql as $$ begin if new.action='dealtwin.commitment.released' then raise exception 'task17 receipt failure'; end if; return new; end $$;create trigger t17_fail after insert on public.erp_audit_events for each row execute function public.t17_fail()");
    try {await expect(run('release',2,'invalidate-rollback',a.input)).rejects.toThrow('task17 receipt failure');}
    finally {await harness.ownerPool.query('drop trigger t17_fail on public.erp_audit_events;drop function public.t17_fail()');}
    expect(await evidence(harness)).toEqual(before);expect((await run('release',2,'invalidate-rollback',a.input)).httpStatus).toBe(200);
  });
  it('cannot address a real foreign-tenant commitment even when every target ID is known',async()=>{
    const tenant='task17-foreign-synthetic';
    await withTransaction(harness.appPool,tenant,async tx=>{
      await tx.query('insert into public.erp_tenants(id,name) values($1,$1)',[tenant]);
      await tx.query("insert into public.erp_workspaces(tenant_id,revision,active_role) values($1,0,'admin')",[tenant]);
    });
    const repository=new PostgresErpRepository(harness.appPool);await repository.saveAtomic(tenant,0,{...createJudgeScenario().erpState,revision:1});
    const foreign=await proofFixture(harness,'foreign',true,undefined,undefined,[],tenant);
    const prepared=prepareCommitmentProof(foreign.proof);if(!prepared.ok) throw new Error(prepared.error.message);
    const compiled=compileDeal(prepared.value.compileInput);const events=compiled.timeline!.events.filter(e=>e.dependencyKey.startsWith('deal:event:'));
    const amount=events.filter(e=>e.direction==='outflow').reduce((total,e)=>total+e.amountRupiah,0n);
    await withTransaction(harness.appPool,tenant,async tx=>{
      await lockTenantWorkspace(tx,tenant);
      await new PostgresDealTwinRepository(tx,tenant).insertCommitment({id:'foreign-commitment',proofId:foreign.input.proofId,dealVersionId:foreign.input.dealVersionId,
        canonicalEventHash:foreign.input.canonicalEventHash,accountId:'judge-cash',canonicalEvents:events.map(canonicalCashEventDto),amountRupiah:amount.toString(),direction:'outflow',status:'reserved',reserveIdempotencyKey:'foreign-reserve',createdAt:deadline,updatedAt:deadline});
    });
    const foreignRows=()=>withTransaction(harness.appPool,tenant,async tx=>({commitments:(await tx.query('select to_jsonb(t) row from public.dealtwin_liquidity_commitments t where tenant_id=$1',[tenant])).rows,erp:await loadErpWorkspace(tx,tenant)}));
    const before=await evidence(harness);const other=await foreignRows();
    for(const operation of ['release','expire','cancel'] as const) expect(errorCode(await run(operation,1,'foreign-address',{...foreign.input,commitmentId:'foreign-commitment'}))).toBe('COMMITMENT_NOT_FOUND');
    expect(await evidence(harness)).toEqual(before);expect(await foreignRows()).toEqual(other);
  });
});
