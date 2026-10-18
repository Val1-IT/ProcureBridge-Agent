import type { Pool, PoolClient } from "pg";
import type { ApplicationPorts, ApprovalRecord, TransactionScopedRepositories } from "../../dealtwin/application/ports";
import type { Deal, DealVersion } from "../../dealtwin/domain/deal";
import type { CommercialConstraint } from "../../dealtwin/domain/constraint";
import type { DealProofDto } from "../../dealtwin/proof/proof-dto";
import type { MutationContext } from "../../dealtwin/application/operation-contracts";
import {
  constraintColumns,
  decodeApproval,
  decodeCommitment,
  decodeDeal,
  decodeDealVersion,
  decodeProofJson,
  dependencyKeysFromProof,
  type DealTwinCommitmentInput,
  type DealTwinCompileRunInput,
  type DealTwinSnapshotInput,
} from "./dealtwin-mappers";
import { ExpectedRevisionConflict, PersistenceIntegrityError } from "./errors";
import { appendOperationReceipt, findSuccessReceipt } from "./idempotency-audit-store";
import {
  asIsoInstant,
  requireCanonicalText,
  requireOneRow,
  uniqueOrNone,
} from "./pg-codec";
import { bumpWorkspaceRevision, invalidateAffectedProofs, lockTenantWorkspace } from "./proof-invalidation";
import { withTransaction } from "./transaction";
import { assertDatabaseRole } from './database-role';

export type { DealTwinCommitmentInput, DealTwinCompileRunInput, DealTwinSnapshotInput };

interface ConcurrencyGate {
  expectedRevision: number;
  lockedRevision: number;
  revisionWritten: boolean;
}

function gateWritable(gate: ConcurrencyGate | undefined): void {
  if (!gate) return;
  if (gate.lockedRevision !== gate.expectedRevision) {
    throw new ExpectedRevisionConflict(gate.lockedRevision);
  }
}

export class PostgresDealTwinRepository {
  constructor(private readonly tx: PoolClient, private readonly tenantId: string) {
    requireCanonicalText(tenantId, "tenantId");
  }

  async insertDeal(deal: Deal, createdAt: string): Promise<void> {
    const currentVersionId = deal.currentVersionId.trim() === "" ? null : deal.currentVersionId;
    await this.tx.query(
      `insert into public.dealtwin_deals (
         tenant_id, id, title, customer_id, status, current_version_id, committed_sales_order_id, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [this.tenantId, deal.id, deal.title, deal.customerId, deal.status, currentVersionId, deal.committedSalesOrderId, createdAt],
    );
  }

  async insertDealVersion(version: DealVersion): Promise<void> {
    await this.tx.query(
      `insert into public.dealtwin_deal_versions (
         tenant_id, id, deal_id, version, terms, terms_hash, created_by, created_at
       ) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [this.tenantId, version.id, version.dealId, version.version, JSON.stringify(version.terms), version.termsHash, version.createdBy, version.createdAt],
    );
    await this.tx.query(
      `update public.dealtwin_deals
       set current_version_id = $3, updated_at = $4
       where tenant_id = $1 and id = $2 and current_version_id is null`,
      [this.tenantId, version.dealId, version.id, version.createdAt],
    );
  }

  async insertConstraint(constraint: CommercialConstraint, dealVersionId: string, position: number, createdAt: string): Promise<void> {
    const columns = constraintColumns(constraint);
    await this.tx.query(
      `insert into public.dealtwin_constraints (
         tenant_id, id, deal_version_id, position, kind, operator, value, provenance, resolution, approval_requirement, created_at, source_text
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
      [
        this.tenantId, constraint.id, dealVersionId, position, columns.kind, columns.operator,
        JSON.stringify(columns.value), constraint.provenance, constraint.resolution, columns.approvalRequirement, createdAt, constraint.sourceText,
      ],
    );
  }

  async insertSnapshot(snapshot: DealTwinSnapshotInput): Promise<void> {
    await this.tx.query(
      `insert into public.dealtwin_erp_snapshots (
         tenant_id, id, erp_revision, as_of_date, requested_horizon_end, adapter_version,
         dependency_keys, dependency_manifest, canonical_events, state_hash, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        this.tenantId, snapshot.id, snapshot.erpRevision, snapshot.asOfDate, snapshot.requestedHorizonEnd, snapshot.adapterVersion,
        [...snapshot.dependencyKeys], JSON.stringify(snapshot.dependencyManifest), JSON.stringify(snapshot.canonicalEvents),
        snapshot.stateHash, snapshot.createdAt,
      ],
    );
  }

  async insertCompileRun(run: DealTwinCompileRunInput): Promise<void> {
    const version = await this.tx.query<{ deal_id: string }>(
      "select deal_id from public.dealtwin_deal_versions where tenant_id = $1 and id = $2",
      [this.tenantId, run.dealVersionId],
    );
    requireOneRow(version.rows, "compile run deal version");
    const snapshot = await this.tx.query(
      "select id from public.dealtwin_erp_snapshots where tenant_id = $1 and id = $2",
      [this.tenantId, run.snapshotId],
    );
    requireOneRow(snapshot.rows, "compile run snapshot");
    if (run.parentRunId) {
      const parent = await this.tx.query(
        "select id from public.dealtwin_compile_runs where tenant_id = $1 and id = $2",
        [this.tenantId, run.parentRunId],
      );
      requireOneRow(parent.rows, "compile run parent");
    }
    await this.tx.query(
      `insert into public.dealtwin_compile_runs (
         tenant_id, id, deal_version_id, snapshot_id, kind, engine_version, input_hash, result_hash, outcome,
         cash_floor_rupiah, shortfall_rupiah, worst_minimum_rupiah, first_violation_date, violation_data, parent_run_id, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::bigint, $11::bigint, $12::bigint, $13, $14::jsonb, $15, $16)`,
      [
        this.tenantId, run.id, run.dealVersionId, run.snapshotId, run.kind, run.engineVersion, run.inputHash, run.resultHash, run.outcome,
        run.cashFloorRupiah, run.shortfallRupiah, run.worstMinimumRupiah, run.firstViolationDate,
        JSON.stringify(run.violationData ?? {}), run.parentRunId, run.createdAt,
      ],
    );
  }

  async insertProof(proof: DealProofDto, compileRunId: string): Promise<void> {
    const dto = decodeProofJson(proof);
    const run = await this.tx.query<{ deal_version_id: string; input_hash: string; result_hash: string }>(
      `select deal_version_id, input_hash, result_hash
       from public.dealtwin_compile_runs
       where tenant_id = $1 and id = $2`,
      [this.tenantId, compileRunId],
    );
    const compile = requireOneRow(run.rows, "proof compile run");
    if (compile.deal_version_id !== dto.dealVersionId || compile.input_hash !== dto.inputHash || compile.result_hash !== dto.resultHash) {
      throw new PersistenceIntegrityError("Proof compile run does not match the proof identity and hashes.");
    }
    const version = await this.tx.query<{ deal_id: string }>(
      "select deal_id from public.dealtwin_deal_versions where tenant_id = $1 and id = $2",
      [this.tenantId, dto.dealVersionId],
    );
    const bound = requireOneRow(version.rows, "proof deal version");
    if (bound.deal_id !== dto.dealId) {
      throw new PersistenceIntegrityError("Proof deal version does not belong to the proof deal.");
    }
    const keys = dependencyKeysFromProof(dto);
    await this.tx.query(
      `insert into public.dealtwin_proofs (
         tenant_id, id, compile_run_id, deal_id, deal_version_id, proof_hash, result_hash, input_hash,
         status, stale_reason, dependency_keys, proof_json, generated_at, replayed_at, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10, $11::jsonb, $12, null, $12, $12)`,
      [
        this.tenantId, dto.id, compileRunId, dto.dealId, dto.dealVersionId, dto.proofHash, dto.resultHash, dto.inputHash,
        dto.status, [...keys], JSON.stringify(dto), dto.generatedAt,
      ],
    );
  }

  async insertApproval(record: ApprovalRecord, createdAt: string): Promise<void> {
    const proof = await this.tx.query<{ deal_version_id: string; proof_json:DealProofDto }>(
      "select deal_version_id,proof_json from public.dealtwin_proofs where tenant_id = $1 and id = $2",
      [this.tenantId, record.proofId],
    );
    const bound = requireOneRow(proof.rows, "approval proof");
    if (bound.deal_version_id !== record.dealVersionId) {
      throw new PersistenceIntegrityError("Approval proof/version identity does not match.");
    }
    if(record.requirementCode!==undefined){
      const snapshot=bound.proof_json.approvals;
      if(!Array.isArray(snapshot)||!snapshot.some(item=>item&&typeof item==='object'&&!Array.isArray(item)&&item.id===record.id&&item.proofId===record.proofId&&item.dealVersionId===record.dealVersionId&&item.kind===record.kind&&item.requirementCode===record.requirementCode))throw new PersistenceIntegrityError('Approval code must match its immutable proof snapshot');
    }
    await this.tx.query(
      `insert into public.dealtwin_approvals (
         tenant_id, id, deal_version_id, proof_id, requirement_code, status, decided_by, decided_at, comment, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [
        this.tenantId, record.id, record.dealVersionId, record.proofId, record.requirementCode??record.kind, record.status,
        record.decidedBy, record.decidedAt, record.comment, createdAt,
      ],
    );
  }

  async insertCommitment(commitment: DealTwinCommitmentInput): Promise<void> {
    const proof = await this.tx.query<{ deal_version_id: string }>(
      "select deal_version_id from public.dealtwin_proofs where tenant_id = $1 and id = $2",
      [this.tenantId, commitment.proofId],
    );
    const bound = requireOneRow(proof.rows, "commitment proof");
    if (bound.deal_version_id !== commitment.dealVersionId) {
      throw new PersistenceIntegrityError("Commitment proof/version identity does not match.");
    }
    await this.tx.query(
      `insert into public.dealtwin_liquidity_commitments (
         tenant_id, id, proof_id, deal_version_id, account_id, canonical_event_hash, canonical_events,
         amount_rupiah, direction, status, reserve_idempotency_key, commit_idempotency_key, release_idempotency_key,
         created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::bigint, $9, $10, $11, $12, $13, $14, $15)`,
      [
        this.tenantId, commitment.id, commitment.proofId, commitment.dealVersionId, commitment.accountId,
        commitment.canonicalEventHash, JSON.stringify(commitment.canonicalEvents), commitment.amountRupiah,
        commitment.direction, commitment.status, commitment.reserveIdempotencyKey,
        commitment.commitIdempotencyKey ?? null, commitment.releaseIdempotencyKey ?? null,
        commitment.createdAt, commitment.updatedAt,
      ],
    );
  }

  async getProof(proofId: string): Promise<DealProofDto | null> {
    const result = await this.tx.query<{ proof_json: unknown }>(
      "select proof_json from public.dealtwin_proofs where tenant_id = $1 and id = $2",
      [this.tenantId, proofId],
    );
    const row = uniqueOrNone(result.rows, "proof");
    return row ? decodeProofJson(row.proof_json) : null;
  }

  async getDeal(dealId: string): Promise<Deal | null> {
    const result = await this.tx.query<Record<string, unknown>>(
      "select id, title, customer_id, status, current_version_id, committed_sales_order_id from public.dealtwin_deals where tenant_id = $1 and id = $2",
      [this.tenantId, dealId],
    );
    const row = uniqueOrNone(result.rows, "deal");
    return row ? decodeDeal(row) : null;
  }

  async getDealVersion(versionId: string): Promise<DealVersion | null> {
    const result = await this.tx.query<Record<string, unknown>>(
      "select id, deal_id, version, terms, terms_hash, created_by, created_at from public.dealtwin_deal_versions where tenant_id = $1 and id = $2",
      [this.tenantId, versionId],
    );
    const row = uniqueOrNone(result.rows, "deal version");
    return row ? decodeDealVersion(row) : null;
  }

  async listActiveCommitments(): Promise<readonly DealTwinCommitmentInput[]> {
    const result = await this.tx.query<Record<string, unknown>>(
      `select id, proof_id, deal_version_id, account_id, canonical_event_hash, canonical_events,
              amount_rupiah::text as amount_rupiah, direction, status, reserve_idempotency_key,
              commit_idempotency_key, release_idempotency_key, created_at, updated_at
       from public.dealtwin_liquidity_commitments
       where tenant_id = $1 and status in ('reserved', 'committed')
       order by id`,
      [this.tenantId],
    );
    return result.rows.map((row) => decodeCommitment(row));
  }

  async getApproval(approvalId: string): Promise<ApprovalRecord | null> {
    const result = await this.tx.query<Record<string, unknown>>(
      `select a.id,a.proof_id,a.deal_version_id,a.requirement_code,a.status,a.comment,a.decided_by,a.decided_at,p.proof_json->'approvals' as proof_approvals
       from public.dealtwin_approvals a join public.dealtwin_proofs p on p.tenant_id=a.tenant_id and p.id=a.proof_id
       where a.tenant_id = $1 and a.id = $2`,
      [this.tenantId, approvalId],
    );
    const row = uniqueOrNone(result.rows, "approval");
    return row ? decodeApproval(row) : null;
  }

  async listApprovalsByProofVersion(proofId: string, dealVersionId: string): Promise<readonly ApprovalRecord[]> {
    const result = await this.tx.query<Record<string, unknown>>(
      `select a.id,a.proof_id,a.deal_version_id,a.requirement_code,a.status,a.comment,a.decided_by,a.decided_at,p.proof_json->'approvals' as proof_approvals
       from public.dealtwin_approvals a join public.dealtwin_proofs p on p.tenant_id=a.tenant_id and p.id=a.proof_id
       where a.tenant_id = $1 and a.proof_id = $2 and a.deal_version_id = $3
       order by a.id`,
      [this.tenantId, proofId, dealVersionId],
    );
    return result.rows.map((row) => decodeApproval(row));
  }

  async saveApproval(record: ApprovalRecord, updatedAt: string): Promise<void> {
    const result = await this.tx.query(
      `update public.dealtwin_approvals
       set status = $5, comment = $6, decided_by = $7, decided_at = $8, updated_at = $9
       where tenant_id = $1 and id = $2 and proof_id = $3 and deal_version_id = $4`,
      [
        this.tenantId, record.id, record.proofId, record.dealVersionId, record.status,
        record.comment, record.decidedBy, record.decidedAt, updatedAt,
      ],
    );
    if (result.rowCount !== 1) {
      throw new PersistenceIntegrityError("Approval identity did not match a single current row.");
    }
  }
}

export function bindTransactionRepositories(
  tx: PoolClient,
  tenantId: string,
  gate?: ConcurrencyGate,
): TransactionScopedRepositories {
  const repo = new PostgresDealTwinRepository(tx, tenantId);
  return {
    proofs: {
      async getById(proofId) {
        return repo.getProof(proofId);
      },
    },
    approvals: {
      async getById(approvalId) {
        return repo.getApproval(approvalId);
      },
      async listByProofVersion(proofId, dealVersionId) {
        return repo.listApprovalsByProofVersion(proofId, dealVersionId);
      },
      async save(record) {
        gateWritable(gate);
        await repo.saveApproval(record, record.decidedAt ?? asIsoInstant(new Date(), "approval.updatedAt"));
      },
    },
    receipts: {
      async findSuccess(findTenantId, action, idempotencyKey) {
        if (findTenantId !== tenantId) {
          throw new PersistenceIntegrityError("Receipt lookup tenant must match the transaction tenant.");
        }
        return findSuccessReceipt(tx, tenantId, action, idempotencyKey);
      },
      async appendSuccess(receipt) {
        gateWritable(gate);
        if (receipt.tenantId !== tenantId) {
          throw new PersistenceIntegrityError("Receipt tenant must match the transaction tenant.");
        }
        await appendOperationReceipt(tx, receipt);
        if (gate && !gate.revisionWritten) {
          const createdAt = asIsoInstant(receipt.createdAt, "receipt.createdAt");
          const bumped = await bumpWorkspaceRevision(tx, tenantId, gate.expectedRevision, createdAt);
          gate.lockedRevision = bumped;
          gate.revisionWritten = true;
        }
      },
    },
    async invalidate(change, self) {
      gateWritable(gate);
      if (change.tenantId !== tenantId) {
        throw new PersistenceIntegrityError("Invalidation tenant must match the transaction tenant.");
      }
      return invalidateAffectedProofs(tx, change, self);
    },
  };
}

export function createPostgresApplicationPorts(pool: Pool): ApplicationPorts {
  return {
    async transact<T>(
      context: MutationContext,
      _action: string,
      _input: unknown,
      work: (repos: TransactionScopedRepositories) => Promise<T>,
    ): Promise<T> {
      return withTransaction(pool, context.tenantId, async (tx) => {
        const lockedRevision = await lockTenantWorkspace(tx, context.tenantId);
        await assertDatabaseRole(tx,'dealtwin_app');
        const gate: ConcurrencyGate = {
          expectedRevision: context.expectedRevision,
          lockedRevision,
          revisionWritten: false,
        };
        return work(bindTransactionRepositories(tx, context.tenantId, gate));
      });
    },
  };
}
