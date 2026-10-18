import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Deployment metadata is needed only when configuring the Sites target. */
export async function readHostingBindings(root: string): Promise<{ d1?: string; r2?: string }> {
  let source: string;
  try {
    source = await readFile(resolve(root, '.openai', 'hosting.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('SITES_HOSTING_CONFIG_REQUIRED: .openai/hosting.json is missing. Use npm run judge:build for the local Node/PostgreSQL target.');
    }
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('INVALID_SITES_HOSTING_CONFIG'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SITES_HOSTING_CONFIG');
  const config = value as Record<string, unknown>;
  const bindings: { d1?: string; r2?: string } = {};
  for (const key of ['d1', 'r2'] as const) {
    const binding = config[key];
    if (binding === undefined || binding === null || binding === '') continue;
    if (typeof binding !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(binding)) throw new Error('INVALID_SITES_HOSTING_BINDING');
    bindings[key] = binding;
  }
  return bindings;
}
