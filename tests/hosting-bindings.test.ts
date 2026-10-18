import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readHostingBindings } from '../build/hosting-bindings';

const roots: string[] = [];
async function fixture(source?: string) {
  const root = await mkdtemp(join(tmpdir(), 'dealtwin-hosting-'));
  roots.push(root);
  if (source !== undefined) {
    await mkdir(join(root, '.openai'));
    await writeFile(join(root, '.openai', 'hosting.json'), source);
  }
  return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('Sites configuration stays separate from portable Judge source', () => {
  it('fails clearly without inventing a deployment when metadata is absent', async () => {
    await expect(readHostingBindings(await fixture())).rejects.toThrow('SITES_HOSTING_CONFIG_REQUIRED');
  });
  it('preserves the configured resource names without returning unrelated metadata', async () => {
    const root = await fixture(JSON.stringify({ d1: 'existing_db', r2: 'existing_bucket', unrelated: 'not-a-binding' }));
    expect(await readHostingBindings(root)).toEqual({ d1: 'existing_db', r2: 'existing_bucket' });
  });
  it('supports a configured site without optional bindings', async () => {
    expect(await readHostingBindings(await fixture('{"d1":null,"r2":""}'))).toEqual({});
  });
  it.each(['{', 'null', '[]', '{"d1":17}', '{"r2":"invalid binding"}'])('rejects malformed metadata: %s', async source => {
    await expect(readHostingBindings(await fixture(source))).rejects.toThrow(/INVALID_SITES_HOSTING/);
  });
});
