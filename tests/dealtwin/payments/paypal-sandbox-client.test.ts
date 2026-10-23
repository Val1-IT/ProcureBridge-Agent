import { describe, expect, it } from 'vitest';
import { PayPalSandboxClient, payPalSandboxClientFromEnv, type PayPalSandboxClientOptions } from '../../../lib/dealtwin/payments/paypal-sandbox-client';
import { PayPalProviderError } from '../../../lib/dealtwin/payments/paypal-provider';

// No network: every request goes to an injected fetcher that answers from memory.
const sandbox = 'https://api-m.sandbox.paypal.com';
type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(routes: Record<string, unknown>, seen: Seen[]): typeof fetch {
  return async (target, init) => {
    const url = String(target);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const raw = init?.body === undefined ? undefined : String(init.body);
    seen.push({ url, method: init?.method ?? 'GET', headers, body: raw && headers['content-type'] === 'application/json' ? JSON.parse(raw) : raw });
    expect(init?.redirect).toBe('error');
    const path = url.slice(sandbox.length);
    if (!(path in routes)) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

const options = (fetcher: typeof fetch, overrides: Partial<PayPalSandboxClientOptions> = {}): PayPalSandboxClientOptions =>
  ({ clientId: 'synthetic-client', clientSecret: 'synthetic-secret', webhookId: 'synthetic-webhook', enabled: true, fetcher, ...overrides });
const token = { '/v1/oauth2/token': { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 300 } };

describe('PayPal sandbox client (injected fetch only)', () => {
  it('refuses to run when disabled or misconfigured, before any request', async () => {
    const seen: Seen[] = [];
    const fetcher = fakeFetch(token, seen);
    const order = { requestId: 'deposit-1', referenceId: 'commitment-a', customId: 'a'.repeat(64), amountMinor: 92_025n, currency: 'USD' };
    await expect(new PayPalSandboxClient(options(fetcher, { enabled: false })).createOrder(order)).rejects.toMatchObject({ code: 'PAYPAL_NOT_AUTHORIZED' });
    await expect(new PayPalSandboxClient(options(fetcher, { clientSecret: '' })).createOrder(order)).rejects.toMatchObject({ code: 'PAYPAL_CONFIG_INVALID' });
    await expect(new PayPalSandboxClient(options(fetcher, { baseUrl: 'https://api-m.paypal.com' })).createOrder(order)).rejects.toMatchObject({ code: 'PAYPAL_CONFIG_INVALID' });
    expect(seen).toEqual([]);
  });

  it('only builds a client from env when the sandbox flag and all three values are present', () => {
    expect(payPalSandboxClientFromEnv({})).toBeNull();
    expect(payPalSandboxClientFromEnv({ PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'y', PAYPAL_WEBHOOK_ID: 'z' })).toBeNull();
    expect(payPalSandboxClientFromEnv({ DEALTWIN_PAYPAL_SANDBOX_ENABLED: 'true', PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'y' })).toBeNull();
    expect(payPalSandboxClientFromEnv({ DEALTWIN_PAYPAL_SANDBOX_ENABLED: 'true', PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'y', PAYPAL_WEBHOOK_ID: 'z' })).toBeInstanceOf(PayPalSandboxClient);
  });

  it('creates an AUTHORIZE order on the sandbox host with an idempotent PayPal-Request-Id', async () => {
    const seen: Seen[] = [];
    const client = new PayPalSandboxClient(options(fakeFetch({ ...token, '/v2/checkout/orders': { id: 'ORDER-1', status: 'CREATED',
      links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1' }] } }, seen)));
    const order = await client.createOrder({ requestId: 'deposit-1', referenceId: 'commitment-a', customId: 'a'.repeat(64), amountMinor: 92_025n, currency: 'USD' });
    expect(order).toEqual({ orderId: 'ORDER-1', approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1' });
    expect(seen[0]).toMatchObject({ url: `${sandbox}/v1/oauth2/token`, method: 'POST', body: 'grant_type=client_credentials',
      headers: { authorization: `Basic ${Buffer.from('synthetic-client:synthetic-secret').toString('base64')}` } });
    expect(seen[1]).toMatchObject({ url: `${sandbox}/v2/checkout/orders`, method: 'POST',
      headers: { authorization: 'Bearer synthetic-token', 'paypal-request-id': 'deposit-1' },
      body: { intent: 'AUTHORIZE', purchase_units: [{ reference_id: 'commitment-a', custom_id: 'a'.repeat(64), amount: { currency_code: 'USD', value: '920.25' } }] } });
  });

  it('authorizes, captures and voids through the documented Orders v2 and Payments v2 paths', async () => {
    const seen: Seen[] = [];
    const client = new PayPalSandboxClient(options(fakeFetch({ ...token,
      '/v2/checkout/orders/ORDER-1/authorize': { id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { authorizations: [{ id: 'AUTH-1', status: 'CREATED' }] } }] },
      '/v2/payments/authorizations/AUTH-1/capture': { id: 'CAPTURE-1', status: 'COMPLETED' },
      '/v2/payments/authorizations/AUTH-2/void': {},
    }, seen)));
    expect(await client.authorizeOrder('ORDER-1', 'authorize-1')).toEqual({ authorizationId: 'AUTH-1' });
    expect(await client.captureAuthorization('AUTH-1', 'capture-1')).toEqual({ captureId: 'CAPTURE-1', status: 'COMPLETED' });
    await client.voidAuthorization('AUTH-2', 'void-1');
    expect(seen.filter(call => call.url !== `${sandbox}/v1/oauth2/token`).map(call => [call.url.slice(sandbox.length), call.headers['paypal-request-id']])).toEqual([
      ['/v2/checkout/orders/ORDER-1/authorize', 'authorize-1'], ['/v2/payments/authorizations/AUTH-1/capture', 'capture-1'], ['/v2/payments/authorizations/AUTH-2/void', 'void-1'],
    ]);
    // One OAuth token is reused while it is fresh.
    expect(seen.filter(call => call.url === `${sandbox}/v1/oauth2/token`)).toHaveLength(1);
  });

  it('asks PayPal to verify webhook signatures and trusts only SUCCESS', async () => {
    const headers = { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
      'paypal-transmission-id': 'tx-1', 'paypal-transmission-sig': 'sig', 'paypal-transmission-time': '2026-09-16T08:00:00Z' };
    const rawBody = JSON.stringify({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' });
    for (const [status, expected] of [['SUCCESS', true], ['FAILURE', false]] as const) {
      const seen: Seen[] = [];
      const client = new PayPalSandboxClient(options(fakeFetch({ ...token, '/v1/notifications/verify-webhook-signature': { verification_status: status } }, seen)));
      expect(await client.verifyWebhook({ headers, rawBody })).toBe(expected);
      expect(seen[1]?.body).toEqual({ auth_algo: 'SHA256withRSA', cert_url: headers['paypal-cert-url'], transmission_id: 'tx-1', transmission_sig: 'sig',
        transmission_time: '2026-09-16T08:00:00Z', webhook_id: 'synthetic-webhook', webhook_event: JSON.parse(rawBody) });
    }
    const seen: Seen[] = [];
    const client = new PayPalSandboxClient(options(fakeFetch(token, seen)));
    expect(await client.verifyWebhook({ headers: { ...headers, 'paypal-transmission-sig': '' }, rawBody })).toBe(false);
    expect(seen).toEqual([]);
  });

  it('maps HTTP failures and malformed answers to provider errors without leaking secrets', async () => {
    const seen: Seen[] = [];
    const client = new PayPalSandboxClient(options(fakeFetch(token, seen)));
    const failure = await client.captureAuthorization('AUTH-404', 'capture-1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PayPalProviderError);
    expect(failure).toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
    expect(String((failure as Error).message)).not.toContain('synthetic-secret');
    const bad = new PayPalSandboxClient(options(fakeFetch({ ...token, '/v2/checkout/orders/ORDER-1/authorize': { id: 'ORDER-1' } }, [])));
    await expect(bad.authorizeOrder('ORDER-1', 'authorize-1')).rejects.toMatchObject({ code: 'PAYPAL_RESPONSE_INVALID' });
    await expect(client.authorizeOrder('../token', 'authorize-1')).rejects.toMatchObject({ code: 'PAYPAL_REQUEST_INVALID' });
  });
});
