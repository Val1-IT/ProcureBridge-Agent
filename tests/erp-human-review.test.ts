import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultReview } from "../components/supplier-call/result-review";
import { canAdvanceErpJudgeSession, startErpJudgeSession } from "../lib/demo/erp-judge-mode";
import { createSeedState } from "../lib/demo/seed";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import {
  approveSupplierResult,
  completeSupplierCallSimulation,
  editSupplierResult,
  recordSupplierCallStarted,
  rejectSupplierResult,
  retrySupplierResultReview,
} from "../lib/erp/commands/supplier-results";
import type { ErpState, SupplierCallResult } from "../lib/erp/types";
import { getSupplierScenarioTranscript } from "../lib/supplier-call/scripts";

const approvedAt = "2026-08-09T01:00:00.000Z";
const startedAt = "2026-08-09T03:00:00.000Z";
const endedAt = "2026-08-09T03:00:07.000Z";
const reviewedAt = "2026-08-09T04:00:00.000Z";

function stateWithEarlyEnd(): { state: ErpState; result: SupplierCallResult } {
  const seed = createSeedState().erp;
  const approval = saveSupplierCallApproval(seed, "approver", {
    supplierCallId: "supplier-call-po-1",
    supplierId: "supplier-utama",
    purchaseOrderId: "po-router-replenishment",
    scenario: "delivery_commitment",
    objective: "Confirm the supplier commitment without changing ordered quantity or price.",
    permittedProductIds: ["product-router"],
    maximumDeliveryDate: "2026-08-20",
    partialDeliveryAllowed: true,
    maximumUnitPriceIncreasePercent: 0,
    language: "Bahasa Indonesia",
    approvedBy: "Nadia Pratama",
  }, approvedAt);
  if (!approval.ok) throw new Error(approval.error.message);
  const started = recordSupplierCallStarted(approval.state, "approver", "supplier-call-po-1", {
    callId: "supplier-call-po-1",
    providerCallId: "supplier_mock_supplier-call-po-1",
    provider: "mock",
    status: "connecting",
  }, startedAt);
  if (!started.ok) throw new Error(started.error.message);
  const visible = getSupplierScenarioTranscript("delivery_commitment").slice(0, 2);
  const ended = completeSupplierCallSimulation(started.state, "approver", "supplier-call-po-1", {
    visibleTranscript: visible,
    elapsedSeconds: visible.at(-1)!.offsetSeconds,
  }, endedAt);
  if (!ended.ok) throw new Error(ended.error.message);
  return { state: ended.state, result: ended.value };
}

describe("Human Review recovery", () => {
  it("creates Human Review from an early call end without applying downstream work", () => {
    const { state, result } = stateWithEarlyEnd();

    expect(result).toMatchObject({ status: "human_review", scenario: "failed_contact", followUpDate: null });
    expect(state.supplierCalls[0].status).toBe("ended_early");
    expect(state.followUps).toEqual([]);
    expect(state.disputes).toEqual([]);
  });

  it.each(["approver", "admin"] as const)("allows %s to retry Human Review as editable pending work with one audit", (role) => {
    const { state, result } = stateWithEarlyEnd();
    const beforeAuditCount = state.auditLogs.length;

    const retried = retrySupplierResultReview(state, role, result.id, reviewedAt);

    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.value.status).toBe("pending");
    expect(retried.state.revision).toBe(state.revision + 1);
    expect(retried.state.auditLogs).toHaveLength(beforeAuditCount + 1);
    expect(retried.state.auditLogs.at(-1)).toMatchObject({
      action: "supplier_result.review_retried",
      actorRole: role,
      entityId: result.id,
    });
    expect(retried.state.followUps).toEqual([]);
    expect(retried.state.disputes).toEqual([]);

    const edited = editSupplierResult(retried.state, role, result.id, { followUpDate: "2026-08-11" }, "2026-08-09T04:01:00.000Z");
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const approved = approveSupplierResult(edited.state, role, result.id, "2026-08-09T04:02:00.000Z");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.status).toBe("approved");
    expect(approved.state.followUps).toEqual([expect.objectContaining({ approvalStatus: "approved", purchaseOrderId: result.purchaseOrderId })]);
  });

  it("rejects unauthorized retry and leaves Human Review unchanged without audit", () => {
    const { state, result } = stateWithEarlyEnd();
    const beforeAuditCount = state.auditLogs.length;

    const retried = retrySupplierResultReview(state, "procurement", result.id, reviewedAt);

    expect(retried).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
    expect(retried.state.auditLogs).toHaveLength(beforeAuditCount);
  });

  it.each(["approver", "admin"] as const)("allows %s to terminally reject Human Review with audit", (role) => {
    const { state, result } = stateWithEarlyEnd();

    const rejected = rejectSupplierResult(state, role, result.id, reviewedAt);

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.status).toBe("rejected");
    expect(rejected.state.auditLogs.at(-1)).toMatchObject({ action: "supplier_result.rejected", actorRole: role });
    expect(rejected.state.followUps).toEqual([]);
    expect(rejected.state.disputes).toEqual([]);
  });

  it("keeps normal approval closed until Human Review is explicitly retried", () => {
    const { state, result } = stateWithEarlyEnd();

    expect(approveSupplierResult(state, "approver", result.id, reviewedAt)).toMatchObject({
      ok: false,
      state,
      error: { code: "INVALID_STATE" },
    });
  });

  it("renders authorized recovery actions for Human Review without an ordinary Approve action", () => {
    const { result } = stateWithEarlyEnd();
    const html = renderToStaticMarkup(createElement(ResultReview, {
      result,
      canReview: true,
      error: null,
      onEdit: async () => false,
      onApprove: async () => undefined,
      onReject: async () => undefined,
      onHumanReview: async () => undefined,
      onRetry: async () => undefined,
    }));

    expect(html).toContain(">Retry Review</button>");
    expect(html).toContain(">Reject</button>");
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain(">Human Review</button>");
  });

  it("allows the judge result step to advance after a retried Human Review is approved", () => {
    const started = startErpJudgeSession(createSeedState());
    const { state, result } = stateWithEarlyEnd();
    const retried = retrySupplierResultReview(state, "approver", result.id, reviewedAt);
    if (!retried.ok) throw new Error(retried.error.message);
    const edited = editSupplierResult(retried.state, "approver", result.id, { followUpDate: "2026-08-11" }, "2026-08-09T04:01:00.000Z");
    if (!edited.ok) throw new Error(edited.error.message);
    const approved = approveSupplierResult(edited.state, "approver", result.id, "2026-08-09T04:02:00.000Z");
    if (!approved.ok) throw new Error(approved.error.message);
    const session = { ...started.session, step: "supplier_result_review" as const };
    const demoState = { ...started.state, erp: approved.state };

    expect(canAdvanceErpJudgeSession(session, demoState)).toBe(true);
  });
});
