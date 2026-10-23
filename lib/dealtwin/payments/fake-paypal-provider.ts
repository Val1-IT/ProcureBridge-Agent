import { createHash } from 'node:crypto';
import { formatMinor, PayPalProviderError, type CreateOrderInput, type PayPalDepositProvider, type WebhookDelivery } from './paypal-provider';

type Operation = 'createOrder' | 'authorizeOrder' | 'captureAuthorization' | 'voidAuthorization';
export type FakePayPalCall =
  | ({ operation: 'createOrder' } & CreateOrderInput)
  | { operation: 'authorizeOrder'; requestId: string; orderId: string }
  | { operation: 'captureAuthorization' | 'voidAuthorization'; requestId: string; authorizationId: string };

interface FakeOrder { readonly input: CreateOrderInput; approved: boolean; authorizationId: string | null }

const signature = (rawBody: string) => `fake-sig:${createHash('sha256').update(rawBody).digest('hex')}`;

/**
 * Deterministic in-memory stand-in for the PayPal sandbox. It never opens a
 * socket. Like PayPal, a repeated request id returns the first result instead
 * of acting twice, and webhooks it emits carry a signature only it accepts.
 */
export class FakePayPalProvider implements PayPalDepositProvider {
  readonly calls: FakePayPalCall[] = [];
  private readonly orders = new Map<string, FakeOrder>();
  private readonly authorizations = new Map<string, { orderId: string; voided: boolean; captureId: string | null }>();
  private readonly replies = new Map<string, unknown>();
  private readonly failures = new Set<Operation>();
  private sequence = 0;

  /** Simulates the buyer approving the order on PayPal's checkout page. */
  approveOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Unknown fake order ${orderId}`);
    order.approved = true;
  }

  /** Makes the next call of this operation fail as if PayPal were unreachable. */
  failNext(operation: Operation): void {
    this.failures.add(operation);
  }

  async createOrder(input: CreateOrderInput) {
    this.calls.push({ operation: 'createOrder', ...input });
    return this.once('createOrder', input.requestId, () => {
      const orderId = this.nextId('ORDER');
      this.orders.set(orderId, { input, approved: false, authorizationId: null });
      return { orderId, approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}` };
    });
  }

  async authorizeOrder(orderId: string, requestId: string) {
    this.calls.push({ operation: 'authorizeOrder', requestId, orderId });
    return this.once('authorizeOrder', requestId, () => {
      const order = this.orders.get(orderId);
      if (!order) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
      if (!order.approved) throw new PayPalProviderError('PAYPAL_ORDER_NOT_APPROVED');
      const authorizationId = order.authorizationId ?? this.nextId('AUTH');
      order.authorizationId = authorizationId;
      this.authorizations.set(authorizationId, { orderId, voided: false, captureId: null });
      return { authorizationId };
    });
  }

  async captureAuthorization(authorizationId: string, requestId: string) {
    this.calls.push({ operation: 'captureAuthorization', requestId, authorizationId });
    return this.once('captureAuthorization', requestId, () => {
      const authorization = this.authorizations.get(authorizationId);
      if (!authorization || authorization.voided || authorization.captureId) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
      authorization.captureId = this.nextId('CAPTURE');
      return { captureId: authorization.captureId, status: 'COMPLETED' };
    });
  }

  async voidAuthorization(authorizationId: string, requestId: string) {
    this.calls.push({ operation: 'voidAuthorization', requestId, authorizationId });
    await this.once('voidAuthorization', requestId, () => {
      const authorization = this.authorizations.get(authorizationId);
      if (!authorization || authorization.captureId) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
      authorization.voided = true;
      return null;
    });
  }

  async verifyWebhook(delivery: WebhookDelivery): Promise<boolean> {
    return delivery.headers['paypal-transmission-sig'] === signature(delivery.rawBody);
  }

  /**
   * Builds the PAYMENT.CAPTURE.COMPLETED delivery PayPal would send for a
   * capture. `amount` overrides what the event reports, to model a capture
   * whose settled amount differs from the deposit.
   */
  captureCompletedWebhook(captureId: string, createTime: string, amount?: { value: string; currency_code?: string }): WebhookDelivery {
    const authorization = [...this.authorizations.entries()].find(([, entry]) => entry.captureId === captureId);
    const order = authorization ? this.orders.get(authorization[1].orderId) : undefined;
    const rawBody = JSON.stringify({
      id: `WH-${captureId}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      create_time: createTime,
      resource: {
        id: captureId,
        status: 'COMPLETED',
        custom_id: order?.input.customId,
        amount: {
          currency_code: amount?.currency_code ?? order?.input.currency ?? 'USD',
          value: amount?.value ?? (order ? formatMinor(order.input.amountMinor) : '0.01'),
        },
        supplementary_data: { related_ids: { order_id: authorization?.[1].orderId, authorization_id: authorization?.[0] } },
      },
    });
    return { rawBody, headers: { 'paypal-transmission-id': `tx-${captureId}`, 'paypal-transmission-sig': signature(rawBody) } };
  }

  private once<T>(operation: Operation, requestId: string, act: () => T): T {
    if (this.failures.delete(operation)) throw new PayPalProviderError('PAYPAL_UNAVAILABLE');
    const key = `${operation}:${requestId}`;
    if (this.replies.has(key)) return this.replies.get(key) as T;
    const reply = act();
    this.replies.set(key, reply);
    return reply;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-FAKE-${String(this.sequence).padStart(4, '0')}`;
  }
}
