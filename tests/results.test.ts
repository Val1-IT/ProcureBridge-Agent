import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { applyApprovedResult, markResultForReview, rejectResult, validateStructuredResult } from "../lib/domain/results";

describe("structured result review", () => {
  it("creates a promise only after approval", () => {
    const seed = createSeedState();
    expect(seed.paymentCommitments).toHaveLength(0);
    const next = applyApprovedResult(seed, seed.pendingResults[0], "Nadia Pratama");
    expect(next.paymentCommitments[0]).toMatchObject({
      invoiceId: "inv-sinar",
      promisedAmount: 7_500_000,
      status: "Upcoming",
    });
    expect(next.invoices[0].contactStatus).toBe("Promise to Pay");
    expect(next.auditLogs.at(-1)?.action).toBe("structured_result.approved");
  });

  it("creates and holds an invoice dispute after approval", () => {
    const seed = createSeedState();
    const next = applyApprovedResult(seed, seed.pendingResults[1], "Nadia Pratama");
    expect(next.disputes[0]).toMatchObject({ invoiceId: "inv-maju", status: "Open" });
    expect(next.invoices[1]).toMatchObject({ contactStatus: "Disputed", disputeStatus: "Open" });
  });

  it("schedules follow-up for failed contact", () => {
    const seed = createSeedState();
    const next = applyApprovedResult(seed, seed.pendingResults[2], "Nadia Pratama");
    expect(next.invoices[2]).toMatchObject({ contactStatus: "Scheduled", nextActionAt: "2026-08-05T09:30:00+07:00" });
  });

  it("does not mutate financial records for reject or human review", () => {
    const seed = createSeedState();
    expect(rejectResult(seed, "result-promise", "Nadia Pratama").paymentCommitments).toHaveLength(0);
    expect(markResultForReview(seed, "result-promise", "Nadia Pratama").paymentCommitments).toHaveLength(0);
  });

  it("requires human review for low confidence or incomplete promise details", () => {
    const result = createSeedState().pendingResults[0];
    expect(validateStructuredResult({ ...result, confidenceScore: 0.62 })).toContain("Confidence di bawah 0,80.");
    expect(validateStructuredResult({ ...result, promisedAmount: null })).toContain("Promise-to-pay harus menyebutkan nominal dan tanggal secara eksplisit.");
  });

  it("applies a promise exactly once without duplicating its audit entry", () => {
    const seed = createSeedState();
    const first = applyApprovedResult(seed, seed.pendingResults[0], "Nadia Pratama");
    const second = applyApprovedResult(first, first.pendingResults[0], "Nadia Pratama");
    expect(second).toBe(first);
    expect(second.paymentCommitments).toHaveLength(1);
    expect(second.auditLogs.filter((log) => log.action === "structured_result.approved")).toHaveLength(1);
  });

  it("applies a dispute exactly once by result id and call id", () => {
    const seed = createSeedState();
    const first = applyApprovedResult(seed, seed.pendingResults[1], "Nadia Pratama");
    const second = applyApprovedResult(first, first.pendingResults[1], "Nadia Pratama");
    expect(second).toBe(first);
    expect(second.disputes).toHaveLength(1);
  });

  it("refuses incomplete, low-confidence, or human-review results at the domain boundary", () => {
    const seed = createSeedState();
    const result = seed.pendingResults[0];
    expect(applyApprovedResult(seed, { ...result, promisedAmount: null }, "Nadia Pratama")).toBe(seed);
    expect(applyApprovedResult(seed, { ...result, confidenceScore: 0.5 }, "Nadia Pratama")).toBe(seed);
    expect(applyApprovedResult(seed, { ...result, humanReviewRequired: true }, "Nadia Pratama")).toBe(seed);
    expect(seed.paymentCommitments).toHaveLength(0);
  });
});
