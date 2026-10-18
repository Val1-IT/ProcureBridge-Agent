import { describe, expect, it } from "vitest";

import { isoDate } from "../../../lib/dealtwin/domain/date";
import { createDealVersion, createNextDealVersion, type Deal, type DealStatus } from "../../../lib/dealtwin/domain/deal";
import type { DealTermsV1 } from "../../../lib/dealtwin/domain/deal-terms";
import { isSelfReservation, type CommitmentStatus, type LiquidityCommitment } from "../../../lib/dealtwin/domain/commitment";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { basisPoints } from "../../../lib/dealtwin/domain/rate";
import { canCommitProof, canReserveProof, type Approval, type DealProof, type ProofStatus } from "../../../lib/dealtwin/domain/proof";
import { commitDealLifecycle, transitionCommitment, transitionDeal, transitionProof } from "../../../lib/dealtwin/domain/state-machine";

function terms(): DealTermsV1 {
  return {
    schemaVersion: "dealtwin.deal-terms.v1",
    currency: "IDR",
    customerId: "customer-a",
    warehouseId: "warehouse-a",
    acceptedDate: isoDate("2026-09-16"),
    productLines: [{ lineId: "line-a", productId: "product-a", quantity: 1, unitPriceRupiah: rupiah(1_000n) }],
    customerPaymentEvents: [
      { eventId: "deposit", role: "customer_deposit", basisPoints: basisPoints(2_000), daysFromAcceptance: 0, effectiveDate: isoDate("2026-09-16"), sameDayOrder: 500 },
      { eventId: "balance", role: "customer_balance", basisPoints: basisPoints(8_000), daysFromAcceptance: 14, effectiveDate: isoDate("2026-09-30"), sameDayOrder: 500 },
    ],
    directCostEvents: [],
  };
}

function deal(status: DealStatus): Deal {
  return { id: "deal-a", title: "Deal A", customerId: "customer-a", status, currentVersionId: "version-a", committedSalesOrderId: null };
}

function proof(status: ProofStatus, approvals: readonly Approval[] = []): DealProof {
  return { id: "proof-a", dealId: "deal-a", dealVersionId: "version-a", status, canonicalEventHash: "hash-a", approvals };
}

describe("immutable DealVersion", () => {
  it("canonicalizes and freezes version content without retaining caller arrays", () => {
    const inputTerms = terms();
    const version = createDealVersion({ id: "version-1", dealId: "deal-a", version: 1, terms: inputTerms, createdBy: "actor-a", createdAt: "2026-09-16T00:00:00Z" });

    (inputTerms.productLines as DealTermsV1["productLines"] & { push(value: DealTermsV1["productLines"][number]): void }).push(
      { lineId: "line-b", productId: "product-b", quantity: 1, unitPriceRupiah: rupiah(2n) },
    );

    expect(version.version).toBe(1);
    expect(version.terms.productLines).toHaveLength(1);
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.terms.productLines)).toBe(true);
  });

  it("creates the next immutable version without changing history", () => {
    const first = createDealVersion({ id: "version-1", dealId: "deal-a", version: 1, terms: terms(), createdBy: "actor-a", createdAt: "2026-09-16T00:00:00Z" });
    const next = createNextDealVersion(first, { id: "version-2", terms: terms(), createdBy: "actor-b", createdAt: "2026-09-17T00:00:00Z" });

    expect(next.ok && next.value.version).toBe(2);
    expect(next.ok && next.value.dealId).toBe("deal-a");
    expect(first.version).toBe(1);
  });
});

describe("Deal lifecycle", () => {
  const ordinaryLegal: readonly [DealStatus, DealStatus][] = [
    ["DRAFT", "COMPILED"],
    ["COMPILED", "PROOF_GENERATED"],
    ["PROOF_GENERATED", "RESERVED"],
    ["PROOF_GENERATED", "STALE"],
    ["RESERVED", "STALE"],
    ["COMMITTED", "STALE"],
    ["STALE", "COMPILED"],
  ];

  it.each(ordinaryLegal)("allows %s -> %s without mutating the original", (from, to) => {
    const original = deal(from);
    const result = transitionDeal(original, to);

    expect(result.ok && result.value.status).toBe(to);
    expect(original.status).toBe(from);
  });

  it("commits only from RESERVED and links exactly one Sales Order", () => {
    const committed = commitDealLifecycle(deal("RESERVED"), "sales-order-a");
    expect(committed).toEqual({ ok: true, value: { ...deal("RESERVED"), status: "COMMITTED", committedSalesOrderId: "sales-order-a" } });

    expect(commitDealLifecycle(deal("DRAFT"), "sales-order-a")).toMatchObject({ ok: false, error: { code: "INVALID_DEAL_TRANSITION" } });
    expect(committed.ok && commitDealLifecycle(committed.value, "sales-order-b")).toMatchObject({ ok: false, error: { code: "DEAL_ALREADY_COMMITTED" } });
  });

  it("rejects every other status pair, including raw and duplicate COMMIT transitions", () => {
    const statuses: readonly DealStatus[] = ["DRAFT", "COMPILED", "PROOF_GENERATED", "RESERVED", "COMMITTED", "STALE"];
    const legal = new Set(ordinaryLegal.map(([from, to]) => `${from}:${to}`));

    for (const from of statuses) {
      for (const to of statuses) {
        if (legal.has(`${from}:${to}`)) continue;
        expect(transitionDeal(deal(from), to), `${from} -> ${to}`).toMatchObject({ ok: false });
      }
    }
  });
});

describe("proof gates and state", () => {
  const pendingNonArithmetic: Approval = { id: "approval-a", proofId: "proof-a", dealVersionId: "version-a", kind: "non_arithmetic_authorization", status: "pending" };

  it("allows conditional reserve only for fixed non-arithmetic pending approval and blocks commit", () => {
    const conditional = proof("CONDITIONALLY_VALID", [pendingNonArithmetic]);

    expect(canReserveProof(conditional)).toEqual({ ok: true, value: true });
    expect(canCommitProof(conditional)).toMatchObject({ ok: false, error: { code: "APPROVAL_REQUIRED" } });
  });

  it("blocks arithmetic uncertainty, rejected approval, stale proof, and invalid proof", () => {
    const arithmetic = proof("CONDITIONALLY_VALID", [{ ...pendingNonArithmetic, kind: "arithmetic_uncertainty" }]);
    const rejected = proof("CONDITIONALLY_VALID", [{ ...pendingNonArithmetic, status: "rejected" }]);

    expect(canReserveProof(arithmetic)).toMatchObject({ ok: false, error: { code: "ARITHMETIC_UNCERTAINTY" } });
    expect(canReserveProof(rejected)).toMatchObject({ ok: false, error: { code: "APPROVAL_REJECTED" } });
    expect(canReserveProof(proof("STALE"))).toMatchObject({ ok: false });
    expect(canCommitProof(proof("INVALID"))).toMatchObject({ ok: false });
  });

  it("allows commit only when a current proof has no pending blocking approvals", () => {
    const approved = proof("CONDITIONALLY_VALID", [{ ...pendingNonArithmetic, status: "approved" }]);

    expect(canCommitProof(proof("VALID"))).toEqual({ ok: true, value: true });
    expect(canCommitProof(approved)).toEqual({ ok: true, value: true });
  });

  it("rejects CONDITIONALLY_VALID when no non-arithmetic approval remains pending", () => {
    expect(canReserveProof(proof("CONDITIONALLY_VALID"))).toMatchObject({ ok: false, error: { code: "APPROVAL_STATE_INVALID" } });
    expect(canCommitProof(proof("CONDITIONALLY_VALID"))).toMatchObject({ ok: false, error: { code: "APPROVAL_STATE_INVALID" } });
  });

  it.each([
    ["VALID", "STALE"],
    ["VALID", "INVALID"],
    ["CONDITIONALLY_VALID", "STALE"],
    ["CONDITIONALLY_VALID", "INVALID"],
  ] as const)("allows proof transition %s -> %s", (from, to) => {
    expect(transitionProof(proof(from), to)).toMatchObject({ ok: true, value: { status: to } });
  });

  it("rejects every unsupported proof-state transition", () => {
    const statuses: readonly ProofStatus[] = ["VALID", "CONDITIONALLY_VALID", "STALE", "INVALID"];
    const legal = new Set(["VALID:STALE", "VALID:INVALID", "CONDITIONALLY_VALID:STALE", "CONDITIONALLY_VALID:INVALID"]);
    for (const from of statuses) {
      for (const to of statuses) {
        if (legal.has(`${from}:${to}`)) continue;
        expect(transitionProof(proof(from), to), `${from} -> ${to}`).toMatchObject({ ok: false });
      }
    }
  });
});

describe("commitment identity and lifecycle", () => {
  const commitment: LiquidityCommitment = { id: "commitment-a", proofId: "proof-a", dealVersionId: "version-a", canonicalEventHash: "hash-a", status: "reserved" };

  it("matches self-reservation only by the complete proof/version/event-hash tuple", () => {
    expect(isSelfReservation(commitment, commitment)).toBe(true);
    expect(isSelfReservation(commitment, { ...commitment, proofId: "proof-b" })).toBe(false);
    expect(isSelfReservation(commitment, { ...commitment, dealVersionId: "version-b" })).toBe(false);
    expect(isSelfReservation(commitment, { ...commitment, canonicalEventHash: "hash-b" })).toBe(false);
  });

  it.each([
    ["reserved", "committed"],
    ["reserved", "released"],
    ["reserved", "expired"],
    ["reserved", "cancelled"],
    ["committed", "released"],
    ["committed", "cancelled"],
  ] as const)("allows commitment transition %s -> %s", (from, to) => {
    expect(transitionCommitment({ ...commitment, status: from }, to)).toMatchObject({ ok: true, value: { status: to } });
  });

  it("rejects every unsupported commitment-state transition", () => {
    const statuses: readonly CommitmentStatus[] = ["reserved", "committed", "released", "expired", "cancelled"];
    const legal = new Set([
      "reserved:committed", "reserved:released", "reserved:expired", "reserved:cancelled",
      "committed:released", "committed:cancelled",
    ]);
    for (const from of statuses) {
      for (const to of statuses) {
        if (legal.has(`${from}:${to}`)) continue;
        expect(transitionCommitment({ ...commitment, status: from }, to), `${from} -> ${to}`).toMatchObject({ ok: false });
      }
    }
  });
});
