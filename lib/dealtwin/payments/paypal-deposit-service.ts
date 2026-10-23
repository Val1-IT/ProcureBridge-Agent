import { sha256Canonical } from '../domain/canonical-json';
import { isSelfReservation, type CommitmentStatus, type LiquidityCommitment } from '../domain/commitment';
import { canCommitProof, canReserveProof, type DealProof } from '../domain/proof';
import { parseMinor, PayPalProviderError, type PayPalDepositProvider, type WebhookDelivery } from './paypal-provider';

// A customer deposit collected through PayPal, tied to one DealTwin
// reservation. PayPal never decides whether the deal is safe: the proof and
// the reservation do. Money moves only when both still hold at capture time,
// and cash is recorded only from a webhook PayPal itself has verified.
export type DepositStatus = 'created' | 'authorized' | 'captured' | 'settled' | 'voided';
export type ReservationEnd = Extract<CommitmentStatus, 'released' | 'expired' | 'cancelled'>;
export type DepositResult<T> = { ok: true; value: T } | { ok: false; error: { code: string } };

export interface DepositBinding {
  readonly tenantId: string;
  readonly dealId: string;
  readonly commitmentId: string;
  readonly proofId: string;
  readonly dealVersionId: string;
  readonly canonicalEventHash: string;
}

export interface DepositRecord extends DepositBinding {
  readonly depositId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly amountRupiah: bigint;
  readonly settlementMinor: bigint;
  readonly currency: string;
  readonly orderId: string;
  readonly approveUrl: string;
  readonly status: DepositStatus;
  readonly authorizationId: string | null;
  readonly captureId: string | null;
  readonly voidReason: ReservationEnd | null;
  readonly settledWebhookEventId: string | null;
}

/** One posted cash inflow, unique by its PayPal capture id. */
export interface DepositLedgerEntry {
  readonly sourceType: 'paypal_capture';
  readonly sourceId: string;
  readonly webhookEventId: string;
  readonly tenantId: string;
  readonly dealId: string;
  readonly commitmentId: string;
  readonly proofId: string;
  readonly dealVersionId: string;
  readonly canonicalEventHash: string;
  readonly amountRupiah: bigint;
  readonly settlementMinor: bigint;
  readonly currency: string;
  readonly direction: 'inflow';
  readonly effectiveDate: string;
}

export interface DepositStore {
  get(depositId: string): Promise<DepositRecord | null>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<DepositRecord | null>;
  findByCaptureId(captureId: string): Promise<DepositRecord | null>;
  save(record: DepositRecord): Promise<void>;
  /** Returns false, and posts nothing, when this capture was already posted. */
  appendLedger(entry: DepositLedgerEntry): Promise<boolean>;
}

/**
 * Offline store for tests and the fake demo. A server store would need its own
 * tables and the same tenant lock as commitments; that is not built yet.
 */
export class InMemoryDepositStore implements DepositStore {
  readonly ledger: DepositLedgerEntry[] = [];
  private readonly records = new Map<string, DepositRecord>();

  async get(depositId: string) { return this.records.get(depositId) ?? null; }
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    return [...this.records.values()].find(record => record.tenantId === tenantId && record.idempotencyKey === idempotencyKey) ?? null;
  }
  async findByCaptureId(captureId: string) {
    return [...this.records.values()].find(record => record.captureId === captureId) ?? null;
  }
  async save(record: DepositRecord) { this.records.set(record.depositId, record); }
  async appendLedger(entry: DepositLedgerEntry) {
    if (this.ledger.some(row => row.sourceType === entry.sourceType && row.sourceId === entry.sourceId)) return false;
    this.ledger.push(entry);
    return true;
  }
}

/**
 * PayPal does not settle in rupiah, so a deposit is charged in a configured
 * settlement currency at a fixed, explicitly configured rate. This is a demo
 * conversion, not a market FX quote.
 */
export interface SettlementConfig {
  readonly currency: string;
  readonly rupiahPerMinorUnit: bigint;
}

/** Rounds up, so the charged amount never covers less than the rupiah deposit. */
export function toSettlementMinor(amountRupiah: bigint, settlement: SettlementConfig): bigint {
  if (amountRupiah <= 0n) throw new Error('INVALID_DEPOSIT_AMOUNT');
  if (settlement.rupiahPerMinorUnit <= 0n || !/^[A-Z]{3}$/.test(settlement.currency)) throw new Error('INVALID_SETTLEMENT_CONFIG');
  return (amountRupiah + settlement.rupiahPerMinorUnit - 1n) / settlement.rupiahPerMinorUnit;
}

export interface DepositGateInput {
  readonly proof: DealProof;
  readonly commitment: LiquidityCommitment;
}

const fail = <T>(code: string): DepositResult<T> => ({ ok: false, error: { code } });
const ok = <T>(value: T): DepositResult<T> => ({ ok: true, value });
const text = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
const live: readonly CommitmentStatus[] = ['reserved', 'committed'];

function providerFailure<T>(error: unknown): DepositResult<T> {
  if (error instanceof PayPalProviderError) return fail(error.code);
  return fail('PAYPAL_UNAVAILABLE');
}

// The proof and the reservation must both still describe the exact
// proof/version/event set the deposit was requested against.
function checkBinding(binding: DepositBinding, { proof, commitment }: DepositGateInput, proofRule: (proof: DealProof) => { ok: boolean; error?: { code: string } }): string | null {
  if (proof.id !== binding.proofId || proof.dealId !== binding.dealId || proof.dealVersionId !== binding.dealVersionId
    || proof.canonicalEventHash !== binding.canonicalEventHash) return 'PROOF_BINDING_MISMATCH';
  const rule = proofRule(proof);
  if (!rule.ok) return rule.error?.code ?? 'PROOF_NOT_CURRENT';
  if (!live.includes(commitment.status)) return 'RESERVATION_REQUIRED';
  if (commitment.id !== binding.commitmentId || !isSelfReservation(commitment, binding)) return 'RESERVATION_IDENTITY_MISMATCH';
  return null;
}

export class PayPalDepositService {
  constructor(
    private readonly provider: PayPalDepositProvider,
    private readonly store: DepositStore,
    private readonly settlement: SettlementConfig,
  ) {}

  get(depositId: string): Promise<DepositRecord | null> {
    return this.store.get(depositId);
  }

  /** Opens an AUTHORIZE order for the deposit of a live, proved reservation. */
  async requestDeposit(input: DepositGateInput & { binding: DepositBinding; depositRupiah: bigint; idempotencyKey: string }): Promise<DepositResult<DepositRecord>> {
    const { binding } = input;
    if (!text(input.idempotencyKey) || !text(binding.tenantId) || !text(binding.dealId) || !text(binding.commitmentId) || !text(binding.proofId)
      || !text(binding.dealVersionId) || !/^[0-9a-f]{64}$/.test(binding.canonicalEventHash) || input.depositRupiah <= 0n) return fail('INVALID_REQUEST');
    const requestHash = sha256Canonical({ ...binding, depositRupiah: input.depositRupiah.toString() });
    const replay = await this.store.findByIdempotencyKey(binding.tenantId, input.idempotencyKey);
    if (replay) return replay.requestHash === requestHash ? ok(replay) : fail('IDEMPOTENCY_KEY_REUSED');
    const blocked = checkBinding(binding, input, canReserveProof);
    if (blocked) return fail(blocked);
    const depositId = `${binding.commitmentId}:paypal-deposit`;
    if (await this.store.get(depositId)) return fail('DEPOSIT_ALREADY_REQUESTED');
    const settlementMinor = toSettlementMinor(input.depositRupiah, this.settlement);
    try {
      const order = await this.provider.createOrder({ requestId: input.idempotencyKey, referenceId: binding.commitmentId,
        customId: binding.canonicalEventHash, amountMinor: settlementMinor, currency: this.settlement.currency });
      const record: DepositRecord = { ...binding, depositId, idempotencyKey: input.idempotencyKey, requestHash,
        amountRupiah: input.depositRupiah, settlementMinor, currency: this.settlement.currency, orderId: order.orderId,
        approveUrl: order.approveUrl, status: 'created', authorizationId: null, captureId: null, voidReason: null, settledWebhookEventId: null };
      await this.store.save(record);
      return ok(record);
    } catch (error) {
      return providerFailure(error);
    }
  }

  /** Places the hold after the buyer approved the order on PayPal. */
  async authorize(depositId: string, requestId: string): Promise<DepositResult<DepositRecord>> {
    const record = await this.store.get(depositId);
    if (!record) return fail('DEPOSIT_NOT_FOUND');
    if (record.status === 'authorized') return ok(record);
    if (record.status !== 'created' || !text(requestId)) return fail('DEPOSIT_STATE_INVALID');
    try {
      const { authorizationId } = await this.provider.authorizeOrder(record.orderId, requestId);
      const next: DepositRecord = { ...record, status: 'authorized', authorizationId };
      await this.store.save(next);
      return ok(next);
    } catch (error) {
      return providerFailure(error);
    }
  }

  /**
   * Captures the held deposit only while the proof is still current with every
   * approval granted, and the reservation it pays for still exists. A STALE
   * proof (for example after an ERP change) blocks capture before PayPal is called.
   */
  async capture(depositId: string, current: DepositGateInput, requestId: string): Promise<DepositResult<DepositRecord>> {
    const record = await this.store.get(depositId);
    if (!record) return fail('DEPOSIT_NOT_FOUND');
    if (record.status === 'captured' || record.status === 'settled') return ok(record);
    if (record.status !== 'authorized' || !record.authorizationId || !text(requestId)) return fail('DEPOSIT_STATE_INVALID');
    const blocked = checkBinding(record, current, canCommitProof);
    if (blocked) return fail(blocked);
    try {
      const { captureId } = await this.provider.captureAuthorization(record.authorizationId, requestId);
      const next: DepositRecord = { ...record, status: 'captured', captureId };
      await this.store.save(next);
      return ok(next);
    } catch (error) {
      return providerFailure(error);
    }
  }

  /** Releases the hold when the reservation is released, expires, or is cancelled. */
  async voidForReservationEnd(depositId: string, reason: ReservationEnd, requestId: string): Promise<DepositResult<DepositRecord>> {
    const record = await this.store.get(depositId);
    if (!record) return fail('DEPOSIT_NOT_FOUND');
    if (record.status === 'voided') return ok(record);
    if (record.status === 'captured' || record.status === 'settled') return fail('DEPOSIT_ALREADY_CAPTURED');
    if (!text(requestId)) return fail('INVALID_REQUEST');
    try {
      // An order the buyer never authorized holds no funds; nothing to void at PayPal.
      if (record.status === 'authorized' && record.authorizationId) await this.provider.voidAuthorization(record.authorizationId, requestId);
      const next: DepositRecord = { ...record, status: 'voided', voidReason: reason };
      await this.store.save(next);
      return ok(next);
    } catch (error) {
      return providerFailure(error);
    }
  }

  /**
   * Reconciles PAYMENT.CAPTURE.COMPLETED. The delivery is checked by PayPal
   * first; then capture id, amount, currency and proof hash must match the
   * deposit exactly. A redelivered event posts nothing new.
   */
  async handleWebhook(delivery: WebhookDelivery): Promise<DepositResult<DepositRecord>> {
    let verified: boolean;
    try { verified = await this.provider.verifyWebhook(delivery); } catch (error) { return providerFailure(error); }
    if (!verified) return fail('WEBHOOK_UNVERIFIED');
    let event: { id?: unknown; event_type?: unknown; create_time?: unknown; resource?: { id?: unknown; custom_id?: unknown; amount?: { currency_code?: unknown; value?: unknown } } };
    try { event = JSON.parse(delivery.rawBody) as typeof event; } catch { return fail('WEBHOOK_INVALID'); }
    if (!event || typeof event.id !== 'string' || typeof event.create_time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(event.create_time)
      || typeof event.resource?.id !== 'string') return fail('WEBHOOK_INVALID');
    if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return fail('WEBHOOK_EVENT_UNSUPPORTED');
    const record = await this.store.findByCaptureId(event.resource.id);
    if (!record) return fail('DEPOSIT_NOT_FOUND');
    if (record.status === 'settled') return ok(record);
    if (record.status !== 'captured') return fail('DEPOSIT_STATE_INVALID');
    if (parseMinor(event.resource.amount?.value) !== record.settlementMinor || event.resource.amount?.currency_code !== record.currency) {
      return fail('RECONCILIATION_AMOUNT_MISMATCH');
    }
    if (event.resource.custom_id !== record.canonicalEventHash) return fail('RECONCILIATION_BINDING_MISMATCH');
    // PayPal timestamps are UTC; the posted date is the UTC calendar date.
    await this.store.appendLedger({ sourceType: 'paypal_capture', sourceId: event.resource.id, webhookEventId: event.id,
      tenantId: record.tenantId, dealId: record.dealId, commitmentId: record.commitmentId, proofId: record.proofId,
      dealVersionId: record.dealVersionId, canonicalEventHash: record.canonicalEventHash, amountRupiah: record.amountRupiah,
      settlementMinor: record.settlementMinor, currency: record.currency, direction: 'inflow', effectiveDate: event.create_time.slice(0, 10) });
    const next: DepositRecord = { ...record, status: 'settled', settledWebhookEventId: event.id };
    await this.store.save(next);
    return ok(next);
  }
}
