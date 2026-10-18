import { canonicalStringify, sha256Canonical, type CanonicalJsonValue } from "../domain/canonical-json";
import { createDealVersion, type Deal, type DealVersion } from "../domain/deal";
import { createJudgeScenario, JUDGE_TENANT_ID } from "../judge/scenario";
import type { ErpState } from "../../erp/types";
import type { CommercialConstraint } from "../domain/constraint";
import type { ActorContext, MutationContext, OperationReceipt, OperationResponse } from "./operation-contracts";
import type { OperationReceiptRepository } from "./ports";

export const JUDGE_RESET_ACTION = "dealtwin.judge.reset";
const SEED_DATE = "2026-09-12T00:00:00.000Z";
const ROLES = ["admin", "procurement", "warehouse", "sales", "finance", "approver"];
export interface JudgeSeed {
  readonly erp: ErpState;
  readonly deals: readonly Deal[];
  readonly versions: readonly DealVersion[];
  readonly constraints: readonly CommercialConstraint[];
  readonly businessSeedHash: string;
}
export interface JudgeResetRepositories {
  readonly currentRevision: number;
  readonly receipts: OperationReceiptRepository;
  replaceSeed(seed: JudgeSeed): Promise<void>;
  advanceRevision(now: string): Promise<number>;
}
export interface JudgeSeedPort {
  transact<T>(context: MutationContext, work: (repositories: JudgeResetRepositories) => Promise<T>): Promise<T>;
}
export function assertJudgeActor(context: ActorContext): void {
  if (context.tenantId !== JUDGE_TENANT_ID || !ROLES.includes(context.role)
    || !/^[a-zA-Z0-9:_-]{1,128}$/.test(context.actorId)) throw new Error("FORBIDDEN_JUDGE_CONTEXT");
}
export function createCanonicalJudgeSeed(): JudgeSeed {
  const scenario = createJudgeScenario();
  const terms = [scenario.initialTermsA, scenario.collisionTermsB];
  const deals: Deal[] = terms.map((term, index) => ({ id: `judge-deal-${index === 0 ? "a" : "b"}`, title: `Synthetic Judge Deal ${index === 0 ? "A" : "B"}`,
    customerId: term.customerId, status: "DRAFT", currentVersionId: `judge-version-${index === 0 ? "a" : "b"}-1`, committedSalesOrderId: null }));
  const versions = terms.map((term, index) => createDealVersion({ id: deals[index]!.currentVersionId, dealId: deals[index]!.id,
    version: 1, terms: term, createdBy: "judge-seed", createdAt: SEED_DATE }));
  const constraints = scenario.constraints.constraints;
  const constraintRows = versions.flatMap((version) => constraints.map((row, index) => ({
    id: `${version.id}:${row.id}`, deal_version_id: version.id, position: index + 1, kind: row.kind, operator: row.operator,
    value: typeof row.value === "bigint" ? row.value.toString() : row.value, provenance: row.provenance, resolution: row.resolution,
    approval_requirement: row.kind === "required_approval" ? row.value.approvalCode : null,
  })));
  const businessSeedHash = hashJudgeBusinessState(scenario.erpState, deals, versions, constraintRows);
  return { erp: scenario.erpState, deals, versions, constraints, businessSeedHash };
}
export function hashJudgeBusinessState(erp: ErpState, deals: unknown, versions: unknown, constraints: unknown): string {
  const businessErp = { ...erp, revision: 0, auditLogs: [] };
  return sha256Canonical(JSON.parse(JSON.stringify({ schemaVersion: "dealtwin.judge-seed.v1", erp: businessErp, deals, versions, constraints })) as CanonicalJsonValue);
}
function error(httpStatus: number, code: string): OperationResponse { return { httpStatus, body: { ok: false, error: { code } } }; }

export class JudgeSeedService {
  constructor(private readonly port: JudgeSeedPort) {}
  async resetJudgeTenant(context: MutationContext): Promise<OperationResponse> {
    try { assertJudgeActor(context); } catch { return error(403, "FORBIDDEN_JUDGE_CONTEXT"); }
    if (context.role !== "admin") return error(403, "FORBIDDEN_ROLE");
    if (!Number.isSafeInteger(context.expectedRevision) || context.expectedRevision < 0 || context.expectedRevision >= Number.MAX_SAFE_INTEGER
      || !/^[a-zA-Z0-9:_-]{1,128}$/.test(context.idempotencyKey)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(context.now) || !Number.isFinite(Date.parse(context.now))) return error(422, "INVALID_REQUEST");
    const seed = createCanonicalJudgeSeed(); // No provider or network while the tenant lock is held.
    const requestHash = sha256Canonical({ action: JUDGE_RESET_ACTION, expectedRevision: context.expectedRevision, seedSchemaVersion: "dealtwin.judge-seed.v1" });
    return this.port.transact(context, async (repos) => {
      const prior = await repos.receipts.findSuccess(context.tenantId, JUDGE_RESET_ACTION, context.idempotencyKey);
      if (prior) {
        if (prior.actorId !== context.actorId) return error(403, "FORBIDDEN_ROLE");
        if (prior.requestHash !== requestHash) return error(409, "IDEMPOTENCY_KEY_REUSED");
        return JSON.parse(prior.responseJson) as OperationResponse;
      }
      if (repos.currentRevision !== context.expectedRevision) return error(409, "REVISION_CONFLICT");
      await repos.replaceSeed(seed);
      const revision = await repos.advanceRevision(context.now);
      const result: OperationResponse = { httpStatus: 200, body: { ok: true, action: JUDGE_RESET_ACTION, synthetic: true,
        tenantId: JUDGE_TENANT_ID, revision, businessSeedHash: seed.businessSeedHash } };
      const encoded = { httpStatus: result.httpStatus, body: result.body };
      const receipt: OperationReceipt = { tenantId: context.tenantId, actorId: context.actorId, action: JUDGE_RESET_ACTION,
        idempotencyKey: context.idempotencyKey, requestHash, responseJson: canonicalStringify(encoded), responseHash: sha256Canonical(encoded),
        priorRevision: repos.currentRevision, currentRevision: revision, createdAt: context.now };
      await repos.receipts.appendSuccess(receipt);
      return result;
    });
  }
}
