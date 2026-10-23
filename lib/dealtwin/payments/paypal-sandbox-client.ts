import { formatMinor, PayPalProviderError, type CreateOrderInput, type PayPalDepositProvider, type WebhookDelivery } from './paypal-provider';

// PayPal REST client pinned to the sandbox host. It is off unless
// DEALTWIN_PAYPAL_SANDBOX_ENABLED=true and the caller supplies sandbox app
// credentials; a live host is refused outright. Tests inject `fetcher`, so
// no test in this repository reaches PayPal.
const sandboxBaseUrl = 'https://api-m.sandbox.paypal.com';

export interface PayPalSandboxClientOptions {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  enabled: boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  responseBytes?: number;
  baseUrl?: string;
}

const id = (value: string) => /^[A-Za-z0-9_-]{1,64}$/.test(value);
const requestId = (value: string) => /^[A-Za-z0-9:_-]{1,108}$/.test(value);
const secret = (value: string) => Boolean(value) && value.length <= 4096 && Boolean(value.trim()) && !/[\r\n]/.test(value);
const webhookHeaders = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'] as const;

export function payPalSandboxClientFromEnv(env: Readonly<Record<string, string | undefined>>): PayPalSandboxClient | null {
  const { DEALTWIN_PAYPAL_SANDBOX_ENABLED: enabled, PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret, PAYPAL_WEBHOOK_ID: webhookId } = env;
  if (enabled !== 'true' || !clientId || !clientSecret || !webhookId) return null;
  return new PayPalSandboxClient({ clientId, clientSecret, webhookId, enabled: true });
}

export class PayPalSandboxClient implements PayPalDepositProvider {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly options: PayPalSandboxClientOptions) {}

  async createOrder(input: CreateOrderInput) {
    if (!requestId(input.requestId) || !/^[A-Z]{3}$/.test(input.currency) || input.amountMinor <= 0n) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
    const body = await this.call('/v2/checkout/orders', input.requestId, {
      intent: 'AUTHORIZE',
      purchase_units: [{ reference_id: input.referenceId, custom_id: input.customId, amount: { currency_code: input.currency, value: formatMinor(input.amountMinor) } }],
    }) as { id?: unknown; links?: { rel?: unknown; href?: unknown }[] };
    const approve = Array.isArray(body.links) ? body.links.find(link => link.rel === 'approve' || link.rel === 'payer-action') : undefined;
    if (typeof body.id !== 'string' || !id(body.id) || typeof approve?.href !== 'string' || !approve.href.startsWith('https://www.sandbox.paypal.com/')) {
      throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID');
    }
    return { orderId: body.id, approveUrl: approve.href };
  }

  async authorizeOrder(orderId: string, request: string) {
    if (!id(orderId) || !requestId(request)) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
    const body = await this.call(`/v2/checkout/orders/${orderId}/authorize`, request, {}) as
      { purchase_units?: { payments?: { authorizations?: { id?: unknown }[] } }[] };
    const authorizations = body.purchase_units?.[0]?.payments?.authorizations;
    const authorizationId = Array.isArray(authorizations) && authorizations.length === 1 ? authorizations[0]?.id : undefined;
    if (typeof authorizationId !== 'string' || !id(authorizationId)) throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID');
    return { authorizationId };
  }

  async captureAuthorization(authorizationId: string, request: string) {
    if (!id(authorizationId) || !requestId(request)) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
    // final_capture: one deposit is captured once, which releases any remainder of the hold.
    const body = await this.call(`/v2/payments/authorizations/${authorizationId}/capture`, request, { final_capture: true }) as { id?: unknown; status?: unknown };
    if (typeof body.id !== 'string' || !id(body.id) || typeof body.status !== 'string') throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID');
    return { captureId: body.id, status: body.status };
  }

  async voidAuthorization(authorizationId: string, request: string) {
    if (!id(authorizationId) || !requestId(request)) throw new PayPalProviderError('PAYPAL_REQUEST_INVALID');
    await this.call(`/v2/payments/authorizations/${authorizationId}/void`, request, undefined);
  }

  /** Asks PayPal to check the transmission signature; only SUCCESS is trusted. */
  async verifyWebhook(delivery: WebhookDelivery): Promise<boolean> {
    const headers = Object.fromEntries(Object.entries(delivery.headers).map(([key, value]) => [key.toLowerCase(), value]));
    if (webhookHeaders.some(name => typeof headers[name] !== 'string' || !headers[name])) return false;
    let event: unknown;
    try { event = JSON.parse(delivery.rawBody); } catch { return false; }
    const body = await this.call('/v1/notifications/verify-webhook-signature', null, {
      auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'], transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'], transmission_time: headers['paypal-transmission-time'],
      webhook_id: this.options.webhookId, webhook_event: event,
    }) as { verification_status?: unknown };
    return body.verification_status === 'SUCCESS';
  }

  private config() {
    const options = this.options;
    if (!options.enabled) throw new PayPalProviderError('PAYPAL_NOT_AUTHORIZED');
    const timeout = options.timeoutMs ?? 10_000;
    const limit = options.responseBytes ?? 65_536;
    if ((options.baseUrl ?? sandboxBaseUrl) !== sandboxBaseUrl || !secret(options.clientId) || !secret(options.clientSecret) || !secret(options.webhookId)
      || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 10_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 65_536) {
      throw new PayPalProviderError('PAYPAL_CONFIG_INVALID');
    }
    return { timeout, limit, fetcher: options.fetcher ?? fetch };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64');
    const body = await this.send('/v1/oauth2/token', { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' }, 'grant_type=client_credentials') as
      { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || !secret(body.access_token) || typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in)) {
      throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID');
    }
    // Refresh a minute early so a token never expires mid-request.
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000 };
    return this.token.value;
  }

  private async call(path: string, request: string | null, payload: unknown): Promise<unknown> {
    this.config();
    const token = await this.accessToken();
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    if (request) headers['paypal-request-id'] = request;
    return this.send(path, headers, payload === undefined ? undefined : JSON.stringify(payload));
  }

  private async send(path: string, headers: Record<string, string>, body: string | undefined): Promise<unknown> {
    const { timeout, limit, fetcher } = this.config();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(`${sandboxBaseUrl}${path}`, { method: 'POST', redirect: 'error', headers, body, signal: controller.signal });
      // Error bodies are never surfaced: they can echo request data.
      if (!response.ok) throw new PayPalProviderError(response.status === 422 && /ORDER_NOT_APPROVED/.test(await this.read(response, limit).catch(() => ''))
        ? 'PAYPAL_ORDER_NOT_APPROVED' : 'PAYPAL_UNAVAILABLE');
      if (response.status === 204) return {};
      const text = await this.read(response, limit);
      if (!text) return {};
      try { return JSON.parse(text) as unknown; } catch { throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID'); }
    } catch (error) {
      if (controller.signal.aborted) throw new PayPalProviderError('PAYPAL_TIMEOUT');
      if (error instanceof PayPalProviderError) throw error;
      throw new PayPalProviderError('PAYPAL_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  private async read(response: Response, limit: number): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > limit) { await reader.cancel(); throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID'); }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw new PayPalProviderError('PAYPAL_RESPONSE_INVALID'); }
  }
}
