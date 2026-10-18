import type { Pool, PoolClient } from "pg";
import { JudgeSeedService, assertJudgeActor, hashJudgeBusinessState, type JudgeSeed, type JudgeSeedPort } from "../../dealtwin/application/judge-seed-service";
import type { ActorContext, MutationContext, OperationResponse, CommitmentCommandInput } from "../../dealtwin/application/operation-contracts";
import { canonicalStringify, type CanonicalJsonValue } from "../../dealtwin/domain/canonical-json";
import { isoDate } from "../../dealtwin/domain/date";
import { canonicalCashEventDto } from "../../dealtwin/domain/canonical-event";
import { buildSnapshot } from "../../dealtwin/erp/build-snapshot";
import { JUDGE_TENANT_ID } from "../../dealtwin/judge/scenario";
import { loadErpWorkspace, saveErpWorkspace } from "../postgres/postgres-erp-repository";
import { PostgresDealTwinRepository } from "../postgres/postgres-dealtwin-repository";
import { appendOperationReceipt, findSuccessReceipt } from "../postgres/idempotency-audit-store";
import { lockTenantWorkspace } from "../postgres/proof-invalidation";
import { withTransaction } from "../postgres/transaction";
import { createPostgresPool } from "../postgres/pool";
import { assertDisposableJudgeDatabaseUrl, parsePostgresConfig } from "../postgres/config";
import { JudgeHttpError } from "./request-contract";
import { createPostgresCommitmentService } from '../postgres/postgres-commitment-service';
import type { CommitmentTarget } from '../../dealtwin/application/audit-events';
import { assertDatabaseRole } from '../postgres/database-role';

export interface JudgeStateDto {
  readonly actor?: Pick<ActorContext,'actorId'|'role'>;
  readonly schemaVersion: "dealtwin.judge-state.v1";
  readonly synthetic: true;
  readonly tenantId: typeof JUDGE_TENANT_ID;
  readonly revision: number;
  readonly businessSeedHash: string;
  readonly erpSnapshotHash: string;
  readonly erp: CanonicalJsonValue;
  readonly deals: readonly CanonicalJsonValue[];
  readonly versions: readonly CanonicalJsonValue[];
  readonly constraints: readonly CanonicalJsonValue[];
  readonly proofs: readonly CanonicalJsonValue[];
  readonly compileRuns?: readonly CanonicalJsonValue[];
  readonly approvals: readonly CanonicalJsonValue[];
  readonly commitments: readonly CanonicalJsonValue[];
  readonly cash: CanonicalJsonValue;
  readonly timeline: CanonicalJsonValue;
}
export interface JudgeRuntime {
  releaseCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse>;
  expireCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse>;
  cancelCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse>;
  reserveLiquidity(context: MutationContext, input: CommitmentTarget): Promise<OperationResponse>;
  commitDeal(context: MutationContext, input: CommitmentTarget): Promise<OperationResponse>;
  resetJudgeTenant(context: MutationContext): Promise<OperationResponse>;
  loadJudgeState(context: ActorContext): Promise<JudgeStateDto>;
}
function dto(value: unknown): CanonicalJsonValue {
  const parsed = JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item)) as CanonicalJsonValue;
  canonicalStringify(parsed); // Reject noncanonical numbers, undefined or exotic JSON at the transport boundary.
  return parsed;
}

// Static allowlist in FK-safe order. Never includes tenants, workspace lock/revision or immutable audits.
const RESET_BUSINESS_TABLES = [
  "dealtwin_liquidity_commitments", "dealtwin_approvals", "dealtwin_proofs", "dealtwin_compile_runs",
  "dealtwin_constraints", "dealtwin_deal_versions", "dealtwin_deals", "dealtwin_erp_snapshots",
  "erp_cash_movements", "erp_cash_accounts", "erp_payments", "erp_trade_invoice_sources", "erp_trade_invoice_lines", "erp_trade_invoices",
  "erp_stock_movements", "erp_stock_adjustments", "erp_follow_ups", "erp_disputes",
  "erp_supplier_call_approval_products", "erp_supplier_call_approvals", "erp_supplier_call_results", "erp_supplier_call_transcript_segments", "erp_supplier_calls",
  "erp_goods_receipt_lines", "erp_goods_receipts", "erp_delivery_order_lines", "erp_delivery_orders",
  "erp_purchase_order_lines", "erp_purchase_orders", "erp_supplier_quotation_lines", "erp_supplier_quotations",
  "erp_rfq_suppliers", "erp_rfq_lines", "erp_request_for_quotations", "erp_purchase_request_lines", "erp_purchase_requests",
  "erp_sales_order_lines", "erp_sales_orders", "erp_products", "erp_suppliers", "erp_customers", "erp_warehouses",
] as const;
async function replaceJudgeSeed(tx: PoolClient, revision: number, seed: JudgeSeed): Promise<void> {
  await tx.query("update public.dealtwin_deals set current_version_id=null where tenant_id=$1", [JUDGE_TENANT_ID]);
  await tx.query("update public.erp_request_for_quotations set selected_quotation_id=null where tenant_id=$1", [JUDGE_TENANT_ID]);
  await tx.query("delete from public.erp_cash_movements where tenant_id=$1 and entry_kind='reversal'", [JUDGE_TENANT_ID]);
  for (const table of RESET_BUSINESS_TABLES) await tx.query(`delete from public.${table} where tenant_id=$1`, [JUDGE_TENANT_ID]);
  // The ordinary ERP mapper adopts the proposed next revision exactly once.
  await saveErpWorkspace(tx, JUDGE_TENANT_ID, revision, { ...seed.erp, revision: revision + 1 });
  const repository = new PostgresDealTwinRepository(tx, JUDGE_TENANT_ID);
  for (const deal of seed.deals) await repository.insertDeal({ ...deal, currentVersionId: "" }, "2026-09-12T00:00:00.000Z");
  for (const version of seed.versions) {
    await repository.insertDealVersion(version);
    for (const [position, constraint] of seed.constraints.entries()) {
      await repository.insertConstraint({ ...constraint, id: `${version.id}:${constraint.id}` }, version.id, position + 1, version.createdAt);
    }
  }
}

export function createPostgresJudgeRuntime(appPool: Pool, resetPool: Pool): JudgeRuntime {
  const port: JudgeSeedPort = {
    async transact(context, work) {
      if (appPool === resetPool) throw new Error("Judge reset requires a distinct pool and credentials.");
      return withTransaction(resetPool, JUDGE_TENANT_ID, async (tx) => {
        await assertDatabaseRole(tx, "dealtwin_judge_reset");
        await tx.query("insert into public.erp_tenants(id,name) values($1,'Synthetic DealTwin Judge') on conflict do nothing", [JUDGE_TENANT_ID]);
        await tx.query("insert into public.erp_workspaces(tenant_id,revision,active_role) values($1,0,'admin') on conflict do nothing", [JUDGE_TENANT_ID]);
        const revision = await lockTenantWorkspace(tx, JUDGE_TENANT_ID);
        let seedReplaced = false;
        return work({ currentRevision: revision,
          receipts: {
            findSuccess: async (tenant, action, key) => {
              if (tenant !== JUDGE_TENANT_ID) throw new Error("Foreign receipt tenant");
              return findSuccessReceipt(tx, tenant, action, key);
            },
            appendSuccess: async (receipt) => {
              if (receipt.tenantId !== JUDGE_TENANT_ID) throw new Error("Foreign receipt tenant");
              await appendOperationReceipt(tx, receipt);
            },
          },
          replaceSeed: async (seed) => { await replaceJudgeSeed(tx, revision, seed); seedReplaced = true; },
          advanceRevision: async () => {
            // saveErpWorkspace already advanced it; never add a second increment.
            if (!seedReplaced) throw new Error("Seed must be replaced before adopting revision");
            return revision + 1;
          },
        });
      });
    },
  };
  const service = new JudgeSeedService(port);
  const commitments = createPostgresCommitmentService(appPool);
  return {
    reserveLiquidity: (context,input) => commitments.reserveLiquidity(context,input),
    commitDeal: (context,input) => commitments.commitDeal(context,input),
    releaseCommitment: (context,input) => commitments.releaseCommitment(context,input),
    expireCommitment: (context,input) => commitments.expireCommitment(context,input),
    cancelCommitment: (context,input) => commitments.cancelCommitment(context,input),
    resetJudgeTenant: (context) => service.resetJudgeTenant(context),
    async loadJudgeState(context): Promise<JudgeStateDto> {
      try { assertJudgeActor(context); } catch { throw new JudgeHttpError(403, "FORBIDDEN_JUDGE_CONTEXT"); }
      return withTransaction(appPool, JUDGE_TENANT_ID, async (tx) => {
        await assertDatabaseRole(tx, "dealtwin_app");
        // Same serialization point makes this multi-table view coherent during reset or future mutations.
        await lockTenantWorkspace(tx, JUDGE_TENANT_ID);
        const erp = await loadErpWorkspace(tx, JUDGE_TENANT_ID);
        const repository = new PostgresDealTwinRepository(tx, JUDGE_TENANT_ID);
        const dealIds = await tx.query<{ id: string }>("select id from public.dealtwin_deals where tenant_id=$1 order by id", [JUDGE_TENANT_ID]);
        const deals = []; const versions = [];
        for (const row of dealIds.rows) { const deal = await repository.getDeal(row.id); if (!deal) throw new Error("Missing deal"); deals.push(dto(deal)); }
        const versionIds = await tx.query<{ id: string }>("select id from public.dealtwin_deal_versions where tenant_id=$1 order by id", [JUDGE_TENANT_ID]);
        for (const row of versionIds.rows) versions.push(dto(await repository.getDealVersion(row.id)));
        const constraints = await tx.query("select id,deal_version_id,position,kind,operator,value,provenance,resolution,approval_requirement from public.dealtwin_constraints where tenant_id=$1 order by deal_version_id,position", [JUDGE_TENANT_ID]);
        const proofs = await tx.query("select id,status,stale_reason,proof_json,replayed_at from public.dealtwin_proofs where tenant_id=$1 order by id", [JUDGE_TENANT_ID]);
        const compileRuns = await tx.query("select id,deal_version_id,kind,outcome,violation_data,created_at from public.dealtwin_compile_runs where tenant_id=$1 order by created_at,id", [JUDGE_TENANT_ID]);
        const approvals = await tx.query("select id,proof_id,deal_version_id,requirement_code,status,decided_by,decided_at,comment from public.dealtwin_approvals where tenant_id=$1 order by id", [JUDGE_TENANT_ID]);
        const commitments = await tx.query(`select id,proof_id,deal_version_id,account_id,canonical_event_hash,canonical_events,
          amount_rupiah::text amount_rupiah,direction,status,
          to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as expires_at,released_at,release_evidence
          from public.dealtwin_liquidity_commitments where tenant_id=$1 order by id`, [JUDGE_TENANT_ID]);
        const snapshot = buildSnapshot({ state: erp, tenantId: JUDGE_TENANT_ID, asOfDate: isoDate("2026-09-12"),
          requestedHorizonEnd: isoDate("2026-10-12"), adapterVersion: "dealtwin-erp-adapter-v1", commitments: [], self: null });
        if (!snapshot.ok) throw new Error("Invalid authoritative Judge snapshot");
        return { schemaVersion: "dealtwin.judge-state.v1", synthetic: true, tenantId: JUDGE_TENANT_ID, revision: erp.revision,actor:{actorId:context.actorId,role:context.role},
          businessSeedHash: hashJudgeBusinessState(erp, deals, versions, constraints.rows), erpSnapshotHash: snapshot.value.stateHash,
          erp: dto(erp), deals, versions, constraints: constraints.rows.map(dto), proofs: proofs.rows.map(dto), compileRuns:compileRuns.rows.map(dto), approvals: approvals.rows.map(dto), commitments: commitments.rows.map(dto),
          cash: dto(snapshot.value.cash), timeline: { scope: "erp_events_with_separate_commitment_evidence", erpEvents: snapshot.value.cashEvents.map(canonicalCashEventDto),
            commitmentEvents: commitments.rows.map((row) => ({ commitmentId: row.id as string, status: row.status as string, events: dto(row.canonical_events) })) },
        };
      });
    },
  };
}

let runtime: JudgeRuntime | undefined;
export function getJudgeRuntime(): JudgeRuntime {
  if (runtime) return runtime;
  const app = parsePostgresConfig();
  const reset = parsePostgresConfig({ ...process.env, DATABASE_URL: process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL });
  // This checkpoint only authorizes local disposable Judge data; remote deployment needs its separate release gate.
  for (const config of [app, reset]) {
    assertDisposableJudgeDatabaseUrl(config.connectionString);
  }
  if (app.user === reset.user || app.host !== reset.host || app.port !== reset.port || app.database !== reset.database) throw new Error("Judge requires distinct credentials against the same disposable database.");
  runtime = createPostgresJudgeRuntime(createPostgresPool(app), createPostgresPool(reset));
  return runtime;
}
