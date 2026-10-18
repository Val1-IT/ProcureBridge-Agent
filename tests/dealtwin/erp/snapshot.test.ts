import { describe, expect, it } from "vitest";
import type { DatedCashEvent } from "../../../lib/dealtwin/domain/cash-event";
import { hashCanonicalCashEvents } from "../../../lib/dealtwin/domain/canonical-event";
import type { LiquidityCommitment } from "../../../lib/dealtwin/domain/commitment";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { buildSnapshot, normalizeExternalCommitments, type SnapshotInput } from "../../../lib/dealtwin/erp/build-snapshot";
import { createErpSeedState } from "../../../lib/erp/seed";

function commitmentEvents(): DatedCashEvent[] {
  return [{
    eventId: "commitment-a:cost", dependencyKey: "dealtwin.commitment:commitment-a", date: isoDate("2026-09-23"), sameDayOrder: 200,
    direction: "outflow", amountRupiah: rupiah(5_000_000n), certainty: "reserved", eventClass: "commitment", orderingSource: "explicit", material: true,
  }];
}

function commitment(status: LiquidityCommitment["status"] = "reserved", hash?: string, events = commitmentEvents()) {
  return { id: "commitment-a", proofId: "proof-a", dealVersionId: "version-a", canonicalEventHash: hash ?? hashCanonicalCashEvents(events), status, events };
}

function input(): SnapshotInput {
  const state = createErpSeedState();
  state.revision = 9;
  state.cashAccounts = [{ id: "cash-main", code: "CASH", name: "Kas", currency: "IDR", openingBalanceRupiah: "30000000", openingBalanceDate: "2026-09-12", openingSourceType: "verified", openingSourceId: "opening", openingSourceRevision: "1", active: true, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" }];
  state.cashMovements = [];
  return { state, tenantId: "tenant-a", asOfDate: isoDate("2026-09-12"), requestedHorizonEnd: isoDate("2026-10-12"), adapterVersion: "erp-adapter-v1", commitments: [commitment()], self: null };
}

describe("external commitment normalization", () => {
  it("validates persisted candidate hashes then wraps events without changing date/order/amount, including exact self", () => {
    const candidate: DatedCashEvent = { eventId: "deal-a:cost", dependencyKey: "deal:event:deal-a:cost", date: isoDate("2026-09-22"), sameDayOrder: 300,
      direction: "outflow", amountRupiah: rupiah(42_000_000n), certainty: "assumption", eventClass: "projected", orderingSource: "conservative", material: true };
    const row = commitment("reserved", hashCanonicalCashEvents([candidate]), [candidate]);
    expect(normalizeExternalCommitments([row], null)).toMatchObject({ ok: true, value: [{ eventId: "commitment-a:deal-a:cost", dependencyKey: "dealtwin.commitment:commitment-a",
      date: "2026-09-22", sameDayOrder: 300, amountRupiah: 42_000_000n, certainty: "reserved", eventClass: "commitment" }] });
    expect(normalizeExternalCommitments([row], { proofId: row.proofId, dealVersionId: row.dealVersionId, canonicalEventHash: row.canonicalEventHash })).toEqual({ ok: true, value: [] });
    const corrupt = { ...row, events: [{ ...candidate, amountRupiah: rupiah(1n) }] };
    expect(normalizeExternalCommitments([corrupt], row)).toMatchObject({ ok: false, error: { code: "COMMITMENT_HASH_MISMATCH" } });
  });
  it("includes active commitments, excludes cancelled rows, and excludes only exact self", () => {
    const active = commitment();
    const cancelled = { ...commitment("cancelled"), id: "commitment-cancelled" };
    const all = normalizeExternalCommitments([cancelled, active], null);
    expect(all).toMatchObject({ ok: true, value: [{ eventId: "commitment-a:cost" }] });
    expect(normalizeExternalCommitments([active], { proofId: "proof-a", dealVersionId: "version-a", canonicalEventHash: active.canonicalEventHash })).toEqual({ ok: true, value: [] });
  });

  it("fails closed when a possible self reservation has a mismatched identity hash", () => {
    expect(normalizeExternalCommitments([commitment()], { proofId: "proof-a", dealVersionId: "version-a", canonicalEventHash: "other-hash" }))
      .toMatchObject({ ok: false, error: { code: "SELF_RESERVATION_MISMATCH" } });
  });

  it("rejects an arbitrary stored canonical event hash", () => {
    expect(normalizeExternalCommitments([commitment("reserved", "hash-a")], null))
      .toMatchObject({ ok: false, error: { code: "COMMITMENT_HASH_MISMATCH" } });
  });

  it("rejects an amount change that leaves the stored hash unchanged", () => {
    const events = commitmentEvents();
    const hash = hashCanonicalCashEvents(events);
    const mutated = [{ ...events[0], amountRupiah: rupiah(9_000_000n) }];
    expect(normalizeExternalCommitments([commitment("reserved", hash, mutated)], null))
      .toMatchObject({ ok: false, error: { code: "COMMITMENT_HASH_MISMATCH" } });
  });

  it("accepts a permutation of the same events when the stored hash is canonical", () => {
    const first = commitmentEvents()[0];
    const second: DatedCashEvent = {
      ...first, eventId: "commitment-a:deposit", direction: "inflow", sameDayOrder: 500, amountRupiah: rupiah(1_000_000n),
    };
    const hash = hashCanonicalCashEvents([first, second]);
    const row = { ...commitment("reserved", hash, [second, first]), events: [second, first] };
    expect(normalizeExternalCommitments([row], null)).toMatchObject({
      ok: true, value: [{ eventId: "commitment-a:cost" }, { eventId: "commitment-a:deposit" }],
    });
  });

  it("rejects an unknown lifecycle status", () => {
    expect(normalizeExternalCommitments([commitment("pending" as LiquidityCommitment["status"])], null))
      .toMatchObject({ ok: false, error: { code: "INVALID_COMMITMENT" } });
  });

  it("validates a corrupted exact-self payload before excluding it", () => {
    const identity = { proofId: "proof-a", dealVersionId: "version-a", canonicalEventHash: "hash-a" };
    const corrupted = commitment("reserved", "hash-a", [{ ...commitmentEvents()[0], amountRupiah: rupiah(1n) }]);
    expect(normalizeExternalCommitments([corrupted], identity))
      .toMatchObject({ ok: false, error: { code: "COMMITMENT_HASH_MISMATCH" } });
  });

  it("fails closed for the same proof with a different version or event hash", () => {
    const events = commitmentEvents();
    const hash = hashCanonicalCashEvents(events);
    const row = commitment("reserved", hash, events);
    expect(normalizeExternalCommitments([row], { proofId: "proof-a", dealVersionId: "version-b", canonicalEventHash: hash }))
      .toMatchObject({ ok: false, error: { code: "SELF_RESERVATION_MISMATCH" } });
    expect(normalizeExternalCommitments([row], { proofId: "proof-a", dealVersionId: "version-a", canonicalEventHash: hashCanonicalCashEvents([{ ...events[0], amountRupiah: rupiah(1n) }]) }))
      .toMatchObject({ ok: false, error: { code: "SELF_RESERVATION_MISMATCH" } });
  });
});

describe("canonical ERP snapshot", () => {
  it("is deterministic under source reordering and ignores presentation-only changes", () => {
    const firstInput = input();
    const secondInput = input();
    secondInput.state.products.reverse();
    secondInput.state.stockMovements.reverse();
    secondInput.state.products[0].name = "Presentation-only product label";
    secondInput.state.customers[0].name = "Presentation-only customer label";
    const first = buildSnapshot(firstInput);
    const second = buildSnapshot(secondInput);
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (!first.ok || !second.ok) return;
    expect(second.value.stateHash).toBe(first.value.stateHash);
    expect(second.value.cashEvents).toEqual(first.value.cashEvents);
  });

  it("changes material hashes and query dependencies when stock or open AP changes", () => {
    const baselineInput = { ...input(), commitments: [] };
    const baseline = buildSnapshot(baselineInput);
    const changedInput = { ...input(), commitments: [] };
    changedInput.state.stockMovements[0].quantity += 1;
    changedInput.state.purchaseOrders[0].status = "confirmed";
    changedInput.state.purchaseOrders[0].promisedDeliveryDate = "2026-09-15";
    const changed = buildSnapshot(changedInput);
    expect(baseline).toMatchObject({ ok: true });
    expect(changed).toMatchObject({ ok: true });
    if (!baseline.ok || !changed.ok) return;
    expect(changed.value.stateHash).not.toBe(baseline.value.stateHash);
    const keys = changed.value.dependencyManifest.keys;
    expect(keys).toEqual(expect.arrayContaining([
      "query:open-ap", "query:open-ar", "query:cash", "query:stock", "query:active-commitments",
    ]));
    expect(changed.value.obligations).toHaveLength(1);
    expect(changed.value.dependencyManifest.keys).toEqual(expect.arrayContaining([
      "erp.purchase_order:po-router-replenishment",
      "erp.stock:product-router:warehouse-jakarta",
      "erp.supplier:supplier-utama",
      "erp.customer:erp-customer-sinar",
    ]));
  });

  it("contains cash, AP/AR, inventory, and commitments without turning stock cost into cash", () => {
    const result = buildSnapshot(input());
    expect(result).toMatchObject({ ok: true, value: { tenantId: "tenant-a", erpRevision: 9, openingBalanceRupiah: 30_000_000n } });
    if (!result.ok) return;
    expect(result.value.cashEvents.map((event) => event.eventClass)).toEqual(["opening_balance", "commitment"]);
    expect(result.value.cashEvents.some((event) => event.amountRupiah === BigInt(input().state.products[0].purchasePrice))).toBe(false);
    expect(result.value.cashEvents.find((event) => event.eventClass === "commitment")?.dependencyKey).toBe("dealtwin.commitment:commitment-a");
    expect(result.value.supplierTerms.map((item) => item.dependency.key)).toEqual(
      result.value.supplierTerms.map((item) => `erp.supplier:${item.supplierId}`),
    );
    expect(result.value.customerTerms.map((item) => item.dependency.key)).toEqual(
      result.value.customerTerms.map((item) => `erp.customer:${item.customerId}`),
    );
    expect(result.value.cash.openingSource.key).toBe("erp.cash_account:cash-main");
  });

  it("uses one stable full-row dependency hash for a multi-line Sales Order", () => {
    const multiLine = input();
    multiLine.state.salesOrders[0] = {
      ...multiLine.state.salesOrders[0],
      status: "confirmed",
      lines: [
        { productId: "product-router", quantity: 2, deliveredQuantity: 0, unitPrice: 1_500_000 },
        { productId: "product-scanner", quantity: 3, deliveredQuantity: 1, unitPrice: 850_000 },
      ],
    };
    expect(buildSnapshot(multiLine)).toMatchObject({ ok: true });
  });

  it("returns a fail-closed Result for unsafe customer terms", () => {
    const invalid = input();
    invalid.state.customers[0].creditLimit = Number.MAX_SAFE_INTEGER + 1;
    expect(() => buildSnapshot(invalid)).not.toThrow();
    expect(buildSnapshot(invalid)).toMatchObject({ ok: false, error: { code: "INVALID_CUSTOMER_TERMS" } });
  });

  it("does not emit a usable zero opening when pre-as-of cash is already overdrawn", () => {
    const overdrawn = { ...input(), asOfDate: isoDate("2026-09-13") };
    overdrawn.state.cashMovements = [{
      id: "cash-overdraft", accountId: "cash-main", effectiveDate: "2026-09-12", sameDayOrder: 100, direction: "outflow",
      amountRupiah: "40000000", entryKind: "original", reversesMovementId: null, sourceType: "manual", sourceId: "manual-overdraft",
      sourceRevision: "2", actorRole: "finance", actorId: "finance-a", reason: "Overdraft", createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    }];
    expect(buildSnapshot(overdrawn)).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
  });
});
