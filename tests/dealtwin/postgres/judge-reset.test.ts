import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresJudgeRuntime } from "../../../lib/server/dealtwin/runtime";
import type { MutationContext } from "../../../lib/dealtwin/application/operation-contracts";
import { JUDGE_TENANT_ID, PostgresHarness } from "./harness";
import { PostgresErpRepository } from "../../../lib/server/postgres/postgres-erp-repository";
import { createJudgeScenario } from "../../../lib/dealtwin/judge/scenario";
import { createDealVersion } from "../../../lib/dealtwin/domain/deal";
import { buildDealProof } from "../../../lib/dealtwin/proof/build-proof";
import { encodeProof } from "../../../lib/dealtwin/proof/proof-dto";
import { canonicalStringify, sha256Canonical } from "../../../lib/dealtwin/domain/canonical-json";
import { PostgresDealTwinRepository } from "../../../lib/server/postgres/postgres-dealtwin-repository";
import { appendOperationReceipt, readOperationReceipt } from "../../../lib/server/postgres/idempotency-audit-store";
import { withTransaction } from "../../../lib/server/postgres/transaction";

let harness: PostgresHarness;
const actor = { tenantId: JUDGE_TENANT_ID, actorId: "judge-user", role: "admin" as const };
const context = (revision: number, key: string): MutationContext => ({ ...actor, expectedRevision: revision, idempotencyKey: key, now: "2026-10-05T12:00:00.000Z" });

describe("durable synthetic Judge reset", () => {
  beforeAll(async () => { harness = await PostgresHarness.connect(); }, 60000);
  beforeEach(async () => { await harness.resetAndMigrate(); }, 60000);
  afterAll(async () => { await harness?.close(); });

  it("repeats canonical business state while increasing revision and survives a new runtime/repository", async () => {
    const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
    const response = await runtime.resetJudgeTenant(context(0, "reset-one"));
    expect(response.httpStatus).toBe(200);
    const first = await runtime.loadJudgeState(actor);
    expect(first.revision).toBe(1);
    expect(response.body).toMatchObject({ businessSeedHash:first.businessSeedHash });
    expect(first.deals).toHaveLength(2);
    expect(first.erp).toMatchObject({ cashAccounts: [{ openingBalanceRupiah: "30000000", openingBalanceDate: "2026-09-12" }],
      supplierInvoices: [{ id: "judge-existing-ap", totalAmount: 18000000, dueDate: "2026-09-15" }],
      customerInvoices: [{ totalAmount: 20000000, dueDate: "2026-09-20" }] });
    expect(await createPostgresJudgeRuntime(harness.appPool, harness.resetPool).loadJudgeState(actor)).toEqual(first);
    expect((await new PostgresErpRepository(harness.appPool).loadWorkspace(JUDGE_TENANT_ID)).revision).toBe(1);
    expect((await runtime.resetJudgeTenant(context(1, "reset-two"))).httpStatus).toBe(200);
    const second = await runtime.loadJudgeState(actor);
    expect(second.revision).toBe(2);
    expect(second.businessSeedHash).toBe(first.businessSeedHash);
    expect(second.deals).toEqual(first.deals);
  });

  it("replays old immutable reset receipts before revision checks and rejects changed payload or actor", async () => {
    const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
    const first = await runtime.resetJudgeTenant(context(0, "old-reset"));
    expect(first.httpStatus).toBe(200);
    await runtime.resetJudgeTenant(context(1, "next-reset"));
    expect(await runtime.resetJudgeTenant({ ...context(0, "old-reset"), now: "2026-10-05T13:00:00.000Z" })).toEqual(first);
    expect((await runtime.resetJudgeTenant(context(2, "old-reset"))).httpStatus).toBe(409);
    expect((await runtime.resetJudgeTenant({ ...context(0, "old-reset"), actorId: "someone-else" })).httpStatus).toBe(403);
    expect((await runtime.resetJudgeTenant(context(0, "stale-new"))).httpStatus).toBe(409);
    expect((await runtime.loadJudgeState(actor)).revision).toBe(2);
    const rows = await harness.ownerPool.query("select count(*)::int n from erp_audit_events where tenant_id=$1 and action='dealtwin.judge.reset'", [JUDGE_TENANT_ID]);
    expect(rows.rows[0].n).toBe(2);
  });

  it("rolls back deletion, seed, revision and receipt when the final audit insert fails", async () => {
    const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
    expect((await runtime.resetJudgeTenant(context(0, "initial"))).httpStatus).toBe(200);
    await harness.ownerPool.query(`insert into erp_products(tenant_id,id,sku,name,unit,sale_price,purchase_price,reorder_point,active,created_at,updated_at)
      values($1,'rollback-marker','ROLLBACK-MARKER','Synthetic rollback marker','unit',1,1,0,true,'2026-09-12T00:00:00Z','2026-09-12T00:00:00Z')`,[JUDGE_TENANT_ID]);
    const before = await runtime.loadJudgeState(actor);
    await harness.ownerPool.query(`create function fail_reset_receipt() returns trigger language plpgsql as $$ begin
      if new.action='dealtwin.judge.reset' and new.detail->>'idempotencyKey'='fail-reset' then raise exception 'injected final receipt failure'; end if; return new; end $$;
      create trigger fail_reset_receipt before insert on erp_audit_events for each row execute function fail_reset_receipt()`);
    await expect(runtime.resetJudgeTenant(context(1, "fail-reset"))).rejects.toThrow("injected final receipt failure");
    expect(await runtime.loadJudgeState(actor)).toEqual(before);
    await harness.ownerPool.query("drop trigger fail_reset_receipt on erp_audit_events; drop function fail_reset_receipt()");
    expect((await runtime.resetJudgeTenant(context(1, "fail-reset"))).httpStatus).toBe(200);
    expect((await runtime.loadJudgeState(actor)).businessSeedHash).not.toBe(before.businessSeedHash);
  });

  it("rejects foreign tenants/roles and app or owner credentials used for reset", async () => {
    const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
    await harness.ownerPool.query("insert into erp_tenants(id,name) values('foreign','untouched'); insert into erp_workspaces(tenant_id,revision,active_role) values('foreign',42,'admin')");
    expect((await runtime.resetJudgeTenant({ ...context(0, "foreign"), tenantId: "foreign" })).httpStatus).toBe(403);
    expect((await runtime.resetJudgeTenant({ ...context(0, "sales"), role: "sales" })).httpStatus).toBe(403);
    await expect(runtime.loadJudgeState({ ...actor, tenantId: "foreign" })).rejects.toThrow();
    await expect(createPostgresJudgeRuntime(harness.appPool, harness.appPool).resetJudgeTenant(context(0, "bad-role"))).rejects.toThrow();
    await expect(createPostgresJudgeRuntime(harness.appPool, harness.ownerPool).resetJudgeTenant(context(0, "owner"))).rejects.toThrow();
    expect((await runtime.resetJudgeTenant(context(0, "good"))).httpStatus).toBe(200);
    expect((await harness.ownerPool.query("select revision::text revision from erp_workspaces where tenant_id='foreign'")).rows[0].revision).toBe("42");
  });

  it("serializes simultaneous same-key reset and does not erase retained audit evidence", async () => {
    const runtime = createPostgresJudgeRuntime(harness.appPool, harness.resetPool);
    const [a,b] = await Promise.all([runtime.resetJudgeTenant(context(0,"race-key")), runtime.resetJudgeTenant(context(0,"race-key"))]);
    expect(a.httpStatus).toBe(200);
    expect(a).toEqual(b);
    expect((await runtime.loadJudgeState(actor)).revision).toBe(1);
    const app = await harness.appPool.connect();
    try { await app.query("begin"); await app.query("select set_config('app.tenant_id',$1,true)",[JUDGE_TENANT_ID]);
      await expect(app.query("delete from erp_audit_events where tenant_id=$1",[JUDGE_TENANT_ID])).rejects.toThrow();
    } finally { await app.query("rollback"); app.release(); }
  });

  it("removes old proof/version authorization and retains receipts from other operation namespaces", async () => {
    const runtime = createPostgresJudgeRuntime(harness.appPool,harness.resetPool);
    await runtime.resetJudgeTenant(context(0,"first"));
    const scenario = createJudgeScenario();
    const version = createDealVersion({ id:"old-version",dealId:"old-deal",version:1,terms:scenario.candidateTermsA,createdBy:"judge-user",createdAt:context(0,"").now });
    const built = buildDealProof({ proofId:"old-proof",dealId:"old-deal",version,snapshot:scenario.snapshot,constraints:scenario.constraints,
      policy:scenario.policy,baseResult:scenario.candidateResult,stressRuns:[],assumptions:[],
      approvals:[{ id:"old-approval",proofId:"old-proof",dealVersionId:version.id,kind:"non_arithmetic_authorization",status:"pending" }],
      approvedApprovalCodes:[],generatedAt:context(0,"").now });
    if (!built.ok) throw new Error(built.error.message);
    const proof = encodeProof(built.value);
    const result = { httpStatus:200,body:{ ok:true,proofId:"old-proof" } };
    const requestHash = "a".repeat(64);
    await withTransaction(harness.appPool,JUDGE_TENANT_ID, async (tx) => {
      const repo = new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID);
      await repo.insertDeal({ id:"old-deal",title:"Synthetic historical proposal",customerId:"judge-customer-a",status:"PROOF_GENERATED",currentVersionId:"",committedSalesOrderId:null },version.createdAt);
      await repo.insertDealVersion(version);
      await repo.insertSnapshot({ id:"old-snapshot",erpRevision:1,asOfDate:"2026-09-12",requestedHorizonEnd:"2026-10-12",adapterVersion:proof.adapterVersion,
        dependencyKeys:[],dependencyManifest:{},canonicalEvents:[],stateHash:proof.snapshotHash,createdAt:version.createdAt });
      await repo.insertCompileRun({ id:"old-run",dealVersionId:version.id,snapshotId:"old-snapshot",kind:"base",engineVersion:proof.engineVersion,
        inputHash:proof.inputHash,resultHash:proof.resultHash,outcome:"CONDITIONALLY_VALID",cashFloorRupiah:"5000000",shortfallRupiah:null,worstMinimumRupiah:"5000000",
        firstViolationDate:null,violationData:{},parentRunId:null,createdAt:version.createdAt });
      await repo.insertProof(proof,"old-run");
      await repo.insertApproval({ id:"old-approval",proofId:proof.id,dealVersionId:version.id,kind:"non_arithmetic_authorization",status:"pending",decidedBy:null,decidedAt:null,comment:null },version.createdAt);
      await appendOperationReceipt(tx,{ tenantId:JUDGE_TENANT_ID,actorId:"judge-user",action:"dealtwin.proof.generated",idempotencyKey:"historical-proof-key",requestHash,
        responseJson:canonicalStringify(result),responseHash:sha256Canonical(result),priorRevision:0,currentRevision:1,createdAt:version.createdAt });
    });
    expect((await runtime.loadJudgeState(actor)).proofs).toHaveLength(1);
    expect((await runtime.resetJudgeTenant(context(1,"second"))).httpStatus).toBe(200);
    const state = await runtime.loadJudgeState(actor);
    expect(state.proofs).toEqual([]); expect(state.approvals).toEqual([]);
    await withTransaction(harness.appPool,JUDGE_TENANT_ID,async (tx) => {
      const repo = new PostgresDealTwinRepository(tx,JUDGE_TENANT_ID);
      expect(await repo.getProof("old-proof")).toBeNull(); expect(await repo.getDealVersion("old-version")).toBeNull();
      expect(await readOperationReceipt(tx,JUDGE_TENANT_ID,"dealtwin.proof.generated","historical-proof-key",requestHash)).toEqual(result);
    });
  });
});
