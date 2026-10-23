// The subset of PayPal used for a customer deposit: an Orders v2 AUTHORIZE
// order, its authorization, a capture or void, and webhook verification.
// Every mutating call carries a caller-chosen request id, sent to PayPal as
// PayPal-Request-Id, so a retry after a timeout cannot charge twice.
export type PayPalProviderErrorCode =
  | 'PAYPAL_NOT_AUTHORIZED'
  | 'PAYPAL_CONFIG_INVALID'
  | 'PAYPAL_REQUEST_INVALID'
  | 'PAYPAL_ORDER_NOT_APPROVED'
  | 'PAYPAL_UNAVAILABLE'
  | 'PAYPAL_TIMEOUT'
  | 'PAYPAL_RESPONSE_INVALID';

export class PayPalProviderError extends Error {
  constructor(readonly code: PayPalProviderErrorCode) {
    super(code);
    this.name = 'PayPalProviderError';
  }
}

export interface CreateOrderInput {
  readonly requestId: string;
  // The DealTwin commitment id and canonical event hash travel with the order
  // so a PayPal record can be traced back to the proof it was paid against.
  readonly referenceId: string;
  readonly customId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
}

export interface WebhookDelivery {
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
}

export interface PayPalDepositProvider {
  createOrder(input: CreateOrderInput): Promise<{ orderId: string; approveUrl: string }>;
  authorizeOrder(orderId: string, requestId: string): Promise<{ authorizationId: string }>;
  captureAuthorization(authorizationId: string, requestId: string): Promise<{ captureId: string; status: string }>;
  voidAuthorization(authorizationId: string, requestId: string): Promise<void>;
  verifyWebhook(delivery: WebhookDelivery): Promise<boolean>;
}

export const SANDBOX_CURRENCY_DECIMALS = 2;

/** Formats minor units as PayPal's decimal amount string, e.g. 92025n → "920.25". */
export function formatMinor(amountMinor: bigint): string {
  if (amountMinor < 0n) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
  const text = amountMinor.toString().padStart(SANDBOX_CURRENCY_DECIMALS + 1, '0');
  return `${text.slice(0, -SANDBOX_CURRENCY_DECIMALS)}.${text.slice(-SANDBOX_CURRENCY_DECIMALS)}`;
}

/** Parses PayPal's decimal amount string back to minor units; null if it is not exact. */
export function parseMinor(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,15}\.\d{2}$/.test(value)) return null;
  return BigInt(value.replace('.', ''));
}
