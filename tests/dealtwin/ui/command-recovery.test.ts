import { describe, expect, it } from 'vitest';
import { sendCommand, sendCommandAttempt } from '../../../lib/dealtwin/ui/api-client';
import type { UiCommand } from '../../../lib/dealtwin/ui/commands';

const command: UiCommand = {
  path: '/api/dealtwin/judge/obligations/judge-existing-ap', method: 'PATCH',
  body: { expectedRevision: 7, idempotencyKey: 'same-original-key', amountRupiah: '19000000' },
};

describe('command transport recovery (in-memory, not database transaction evidence)', () => {
  it('retains the attempted operation before transport starts, even when no response arrives', async () => {
    let remembered: UiCommand | null = null;
    let rememberedAtDispatch: UiCommand | null = null;
    const transport: typeof fetch = async () => { rememberedAtDispatch = remembered; throw new Error('connection lost'); };
    await expect(sendCommandAttempt(command, value => { remembered = value; }, transport)).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    expect(rememberedAtDispatch).toEqual(command);
    expect(remembered).toEqual(command);
  });
  it('replaces a previous successful command when the next response is lost', async () => {
    const previous: UiCommand = { path: '/api/dealtwin/judge/reset', method: 'POST', body: { idempotencyKey: 'previous-key' } };
    let remembered: UiCommand = previous;
    await expect(sendCommandAttempt(command, value => { remembered = value; }, async () => { throw new Error('lost'); })).rejects.toThrow('NETWORK_UNAVAILABLE');
    expect(remembered).toEqual(command);
    expect(remembered).not.toEqual(previous);
  });
  it('retries the exact method, body, revision and key after a simulated accepted request loses its response', async () => {
    let remembered: UiCommand | null = null;
    const requests: { path: string; method?: string; body: unknown }[] = [];
    const receipt = { revision: 8, operation: 'synthetic-test-receipt' };
    const transport: typeof fetch = async (path, init) => {
      requests.push({ path: String(path), method: init?.method, body: JSON.parse(String(init?.body)) });
      if (requests.length === 1) throw new Error('response lost after simulated acceptance');
      return Response.json(receipt);
    };
    await expect(sendCommandAttempt(command, value => { remembered = value; }, transport)).rejects.toThrow('NETWORK_UNAVAILABLE');
    expect(remembered).not.toBeNull();
    const retry = remembered as unknown as UiCommand;
    expect(await sendCommand(retry.path, retry.body, transport, retry.method)).toEqual(receipt);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1]?.body).toEqual(command.body);
  });
  it.each([200, 503])('retains identity when status %s has an unreadable response', async status => {
    let remembered: UiCommand | null = null;
    await expect(sendCommandAttempt(command, value => { remembered = value; }, async () => new Response('truncated', { status }))).rejects.toMatchObject({ code: 'INVALID_SERVER_RESPONSE', status });
    expect(remembered).toEqual(command);
  });
  it('continues to return the actual successful response', async () => {
    let remembered: UiCommand | null = null;
    expect(await sendCommandAttempt(command, value => { remembered = value; }, async () => Response.json({ revision: 99 }))).toEqual({ revision: 99 });
    expect(remembered).toEqual(command);
  });
});
