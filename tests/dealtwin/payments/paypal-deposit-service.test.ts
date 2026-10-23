import { describe, expect, it } from 'vitest';
import type { CommitmentStatus } from '../../../lib/dealtwin/domain/commitment';
import type { Approval, ProofStatus } from '../../../lib/dealtwin/domain/proof';
import { FakePayPalProvider } from '../../../lib/dealtwin/payments/fake-paypal-provider';
import { InMemoryDepositStore, PayPalDepositService, toSettlementMinor, type DepositBinding } from '../../../lib/dealtwin/payments/paypal-deposit-service';

// Offline only: every PayPal call goes to the in-memory fake provider.
const hash = 'a'.repeat(64);
const binding: DepositBinding = { tenantId: 'judge-tenant', dealId: 'deal-a', commitmentId: 'commitment-a', proofId: 'proof-a', dealVersionId: 'version-a', canonicalEventHash: hash };
// Judge deal A after the 25% amendment: Rp15,000,000 deposit.
const settlement = { currency: 'USD', rupiahPerMinorUnit: 163n } as const;
const approved: Approval[] = [{ id: 'approval-1', proofId: 'proof-a', dealVersionId: 'version-a', kind: 'non_arithmetic_authorization' as const, status: 'approved' as const }];
const proof = (status: ProofStatus = 'VALID', approvals = approved) => ({ id: 'proof-a', dealId: 'deal-a', dealVersionId: 'version-a', status, canonicalEventHash: hash, approvals });
const commitment = (status: CommitmentStatus = 'reserved', overrides: Partial<DepositBinding> = {}) => ({ id: 'commitment-a', proofId: 'proof-a', dealVersionId: 'version-a', canonicalEventHash: hash, status, ...overrides });

function setup() {
  const provider = new FakePayPalProvider();
  const store = new InMemoryDepositStore();
  const service = new PayPalDepositService(provider, store, settlement);
  return { provider, store, service };
}

async function authorized(service: PayPalDepositService, provider: FakePayPalProvider) {
  const requested = await service.requestDeposit({ binding, depositRupiah: 15_000_000n, idempotencyKey: 'deposit-1', proof: proof(), commitment: commitment() });
  if (!requested.ok) throw new Error(requested.error.code);
  provider.approveOrder(requested.value.orderId);
  const result = await service.authorize(requested.value.depositId, 'authorize-1');
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('PayPal deposit service (offline, fake provider)', () => {
  it('converts rupiah to settlement minor units by rounding up so the deposit is never underpaid', () => {
    expect(toSettlementMinor(15_000_000n, settlement)).toBe(92_025n);
    expect(toSettlementMinor(163n, settlement)).toBe(1n);
    expect(toSettlementMinor(164n, settlement)).toBe(2n);
    expect(() => toSettlementMinor(0n, settlement)).toThrow('INVALID_DEPOSIT_AMOUNT');
  });

  it('creates an AUTHORIZE order bound to the reservation and replays the same idempotency key', async () => {
    const { provider, service } = setup();
    const input = { binding, depositRupiah: 15_000_000n, idempotencyKey: 'deposit-1', proof: proof(), commitment: commitment() };
    const first = await service.requestDeposit(input);
    expect(first).toMatchObject({ ok: true, value: { status: 'created', settlementMinor: 92_025n, currency: 'USD' } });
    expect(provider.calls.map(call => call.operation)).toEqual(['createOrder']);
    expect(provider.calls[0]).toMatchObject({ requestId: 'deposit-1', referenceId: 'commitment-a', customId: hash, amountMinor: 92_025n, currency: 'USD' });
    expect(await service.requestDeposit(input)).toEqual(first);
    expect(provider.calls).toHaveLength(1);
    expect(await service.requestDeposit({ ...input, depositRupiah: 16_200_000n })).toEqual({ ok: false, error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it.each([
    ['stale proof', { proof: proof('STALE') }, 'PROOF_NOT_CURRENT'],
    ['invalid proof', { proof: proof('INVALID') }, 'PROOF_NOT_CURRENT'],
    ['released reservation', { commitment: commitment('released') }, 'RESERVATION_REQUIRED'],
    ['foreign reservation', { commitment: commitment('reserved', { canonicalEventHash: 'b'.repeat(64) }) }, 'RESERVATION_IDENTITY_MISMATCH'],
  ])('refuses to request a deposit with a %s before calling PayPal', async (_label, override, code) => {
    const { provider, service } = setup();
    const result = await service.requestDeposit({ binding, depositRupiah: 15_000_000n, idempotencyKey: 'deposit-1', proof: proof(), commitment: commitment(), ...override });
    expect(result).toEqual({ ok: false, error: { code } });
    expect(provider.calls).toEqual([]);
  });

  it('cannot authorize before the buyer approves the order', async () => {
    const { service } = setup();
    const requested = await service.requestDeposit({ binding, depositRupiah: 15_000_000n, idempotencyKey: 'deposit-1', proof: proof(), commitment: commitment() });
    if (!requested.ok) throw new Error(requested.error.code);
    expect(await service.authorize(requested.value.depositId, 'authorize-1')).toEqual({ ok: false, error: { code: 'PAYPAL_ORDER_NOT_APPROVED' } });
  });

  it.each([
    ['the proof went stale after an ERP change', { proof: proof('STALE') }, 'PROOF_NOT_CURRENT'],
    ['an approval is still pending', { proof: proof('CONDITIONALLY_VALID', [{ ...approved[0]!, status: 'pending' as const }]) }, 'APPROVAL_REQUIRED'],
    ['the reservation was cancelled', { commitment: commitment('cancelled') }, 'RESERVATION_REQUIRED'],
    ['the proof belongs to another version', { proof: { ...proof(), dealVersionId: 'version-b', approvals: [] } }, 'PROOF_BINDING_MISMATCH'],
  ])('blocks capture when %s, without a provider call', async (_label, override, code) => {
    const { provider, service } = setup();
    const deposit = await authorized(service, provider);
    const before = provider.calls.length;
    const result = await service.capture(deposit.depositId, { proof: proof(), commitment: commitment('committed'), ...override }, 'capture-1');
    expect(result).toEqual({ ok: false, error: { code } });
    expect(provider.calls).toHaveLength(before);
    expect((await service.get(deposit.depositId))?.status).toBe('authorized');
  });

  it('captures only with a current proof and live reservation, then reconciles a verified webhook once', async () => {
    const { provider, store, service } = setup();
    const deposit = await authorized(service, provider);
    const captured = await service.capture(deposit.depositId, { proof: proof(), commitment: commitment('committed') }, 'capture-1');
    expect(captured).toMatchObject({ ok: true, value: { status: 'captured', captureId: expect.any(String) } });
    if (!captured.ok) throw new Error(captured.error.code);
    expect(store.ledger).toEqual([]);

    const webhook = provider.captureCompletedWebhook(captured.value.captureId!, '2026-09-16T08:00:00.000Z');
    const settled = await service.handleWebhook(webhook);
    expect(settled).toMatchObject({ ok: true, value: { status: 'settled' } });
    expect(store.ledger).toEqual([{
      sourceType: 'paypal_capture', sourceId: captured.value.captureId, webhookEventId: expect.any(String), tenantId: 'judge-tenant',
      dealId: 'deal-a', commitmentId: 'commitment-a', proofId: 'proof-a', dealVersionId: 'version-a', canonicalEventHash: hash,
      amountRupiah: 15_000_000n, settlementMinor: 92_025n, currency: 'USD', direction: 'inflow', effectiveDate: '2026-09-16',
    }]);
    // PayPal redelivers webhooks; a replay must not post cash twice.
    expect(await service.handleWebhook(webhook)).toEqual(settled);
    expect(store.ledger).toHaveLength(1);
  });

  it('rejects unverified or mismatched webhooks without touching the ledger', async () => {
    const { provider, store, service } = setup();
    const deposit = await authorized(service, provider);
    const captured = await service.capture(deposit.depositId, { proof: proof(), commitment: commitment('committed') }, 'capture-1');
    if (!captured.ok) throw new Error(captured.error.code);
    const webhook = provider.captureCompletedWebhook(captured.value.captureId!, '2026-09-16T08:00:00.000Z');
    expect(await service.handleWebhook({ ...webhook, headers: { ...webhook.headers, 'paypal-transmission-sig': 'forged' } }))
      .toEqual({ ok: false, error: { code: 'WEBHOOK_UNVERIFIED' } });
    const tampered = provider.captureCompletedWebhook(captured.value.captureId!, '2026-09-16T08:00:00.000Z', { value: '1.00' });
    expect(await service.handleWebhook(tampered)).toEqual({ ok: false, error: { code: 'RECONCILIATION_AMOUNT_MISMATCH' } });
    const unknown = provider.captureCompletedWebhook('capture-unknown', '2026-09-16T08:00:00.000Z');
    expect(await service.handleWebhook(unknown)).toEqual({ ok: false, error: { code: 'DEPOSIT_NOT_FOUND' } });
    expect(store.ledger).toEqual([]);
    expect((await service.get(deposit.depositId))?.status).toBe('captured');
  });

  it('voids an uncaptured authorization when the reservation ends, and refuses to void after capture', async () => {
    const { provider, service } = setup();
    const deposit = await authorized(service, provider);
    expect(await service.voidForReservationEnd(deposit.depositId, 'cancelled', 'void-1')).toMatchObject({ ok: true, value: { status: 'voided' } });
    expect(provider.calls.at(-1)).toMatchObject({ operation: 'voidAuthorization', authorizationId: deposit.authorizationId });
    expect(await service.voidForReservationEnd(deposit.depositId, 'cancelled', 'void-1')).toMatchObject({ ok: true, value: { status: 'voided' } });
    expect(provider.calls.filter(call => call.operation === 'voidAuthorization')).toHaveLength(1);
    expect(await service.capture(deposit.depositId, { proof: proof(), commitment: commitment('committed') }, 'capture-1'))
      .toEqual({ ok: false, error: { code: 'DEPOSIT_STATE_INVALID' } });

    const second = setup();
    const kept = await authorized(second.service, second.provider);
    await second.service.capture(kept.depositId, { proof: proof(), commitment: commitment('committed') }, 'capture-1');
    expect(await second.service.voidForReservationEnd(kept.depositId, 'released', 'void-1')).toEqual({ ok: false, error: { code: 'DEPOSIT_ALREADY_CAPTURED' } });
  });

  it('keeps the deposit authorized when the provider fails, so capture can be retried with the same request id', async () => {
    const { provider, service } = setup();
    const deposit = await authorized(service, provider);
    provider.failNext('captureAuthorization');
    expect(await service.capture(deposit.depositId, { proof: proof(), commitment: commitment('committed') }, 'capture-1'))
      .toEqual({ ok: false, error: { code: 'PAYPAL_UNAVAILABLE' } });
    expect((await service.get(deposit.depositId))?.status).toBe('authorized');
    expect(await service.capture(deposit.depositId, { proof: proof(), commitment: commitment('committed') }, 'capture-1')).toMatchObject({ ok: true });
    expect(provider.calls.filter(call => call.operation === 'captureAuthorization').map(call => call.requestId)).toEqual(['capture-1', 'capture-1']);
  });
});
