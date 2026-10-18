import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {evidencePath} from '../evidence-path';
import {pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const coreFile = require.resolve('@esbuild-kit/core-utils');
const coreRequire = createRequire(coreFile);
const esbuildFile = coreRequire.resolve('esbuild');
const runner = path.resolve('tests/dealtwin/security/fixtures/core-utils-probe.mjs');
const evidence = evidencePath('esbuild-loader','output/esbuild-loader-20261018');
mkdirSync(evidence, {recursive: true});
const temporary = () => mkdtempSync(path.join(os.tmpdir(), 'dealtwin-esbuild-'));
const runNode = (args: string[], cwd = process.cwd()) => spawnSync(process.execPath, args, {
  cwd, encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024,
  env: {...process.env, ESBK_DISABLE_CACHE: '1', TSX_DISABLE_CACHE: '1', NODE_OPTIONS: '--max-old-space-size=512'},
});

describe('narrow core-utils esbuild compatibility', () => {
  it('resolves the fixed official version only in the intended dependency path', () => {
    expect(coreRequire('esbuild/package.json').version).toBe('0.25.12');
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const vulnerable = Object.entries(lock.packages).filter(([name, entry]) =>
      name.endsWith('/esbuild') && (entry as {version: string}).version === '0.18.20');
    expect(vulnerable).toEqual([]);
    expect(require('esbuild/package.json').version).toBe('0.28.1');
    const drizzleRequire = createRequire(require.resolve('drizzle-kit'));
    expect(drizzleRequire('esbuild/package.json').version).toBe('0.25.12');
  });

  it('preserves sync/async transforms, JSX, decorators, bigint, field modes, maps and syntax errors', () => {
    const result = runNode([runner, coreFile, esbuildFile, temporary()]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.results).toHaveLength(9);
    expect(record.calls).toEqual(['transform', 'transformSync', 'version']);
    expect(record.invalidSyntaxRejected).toBe(true);
    writeFileSync(path.join(evidence, 'installed-transform.json'), JSON.stringify(record, null, 2));
  });

  it('executes the real legacy ESM loader with TypeScript resolution, dynamic imports and JSON', () => {
    const directory = temporary();
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({type: 'module'}));
    writeFileSync(path.join(directory, 'values.ts'), 'export const amount: bigint = 100n; export const percentage: number = 25;');
    writeFileSync(path.join(directory, 'dynamic.ts'), 'export default 3;');
    writeFileSync(path.join(directory, 'data.json'), JSON.stringify({label: 'synthetic'}));
    writeFileSync(path.join(directory, 'entry.ts'), [
      'import {amount, percentage} from "./values.js";',
      'import data from "./data.json";',
      'const dynamic = await import("./dynamic.ts");',
      'console.log(JSON.stringify({amount:(amount*BigInt(percentage)/100n).toString(),dynamic:dynamic.default,label:data.label}));',
    ].join('\n'));
    const result = runNode(['--loader', pathToFileURL(require.resolve('@esbuild-kit/esm-loader')).href, path.join(directory, 'entry.ts')], directory);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({amount: '25', dynamic: 3, label: 'synthetic'});
    writeFileSync(path.join(evidence, 'legacy-loader.json'), JSON.stringify({stdout: result.stdout, stderr: result.stderr}, null, 2));
  });

  it('generates a bounded synthetic PostgreSQL schema and detects an unchanged second generation without a database', () => {
    const directory = temporary();
    const pgCore = require.resolve('drizzle-orm/pg-core');
    writeFileSync(path.join(directory, 'schema.ts'), [
      `import {pgTable, text, integer, bigint} from ${JSON.stringify(pgCore)};`,
      'export const accounts = pgTable("synthetic_accounts", {id:text("id").primaryKey(),name:text("name").notNull()});',
      'export const orders = pgTable("synthetic_orders", {id:text("id").primaryKey(),accountId:text("account_id").notNull().references(()=>accounts.id),quantity:integer("quantity").notNull().default(1),amount:bigint("amount",{mode:"bigint"}).notNull()});',
    ].join('\n'));
    const config = path.join(directory, 'drizzle.config.ts');
    writeFileSync(config, `export default ${JSON.stringify({schema: './schema.ts', out: './generated', dialect: 'postgresql'})};`);
    const cli = path.join(path.dirname(require.resolve('drizzle-kit')), 'bin.cjs');
    const args = [cli, 'generate', `--config=${config}`, '--name=synthetic'];
    const first = runNode(args, directory);
    expect(first.error).toBeUndefined();
    expect(first.status, first.stderr + first.stdout).toBe(0);
    const generated = path.join(directory, 'generated');
    const sqlFiles = readdirSync(generated).filter(name => name.endsWith('.sql'));
    expect(sqlFiles).toHaveLength(1);
    const sql = readFileSync(path.join(generated, sqlFiles[0]), 'utf8');
    expect(sql).toContain('CREATE TABLE "synthetic_accounts"');
    expect(sql).toContain('CREATE TABLE "synthetic_orders"');
    expect(sql).toContain('"amount" bigint NOT NULL');
    expect(sql).toContain('FOREIGN KEY ("account_id")');
    const snapshot = JSON.parse(readFileSync(path.join(generated, 'meta/0000_snapshot.json'), 'utf8'));
    expect(Object.keys(snapshot.tables).sort()).toEqual(['public.synthetic_accounts', 'public.synthetic_orders']);
    const second = runNode(args, directory);
    expect(second.status, second.stderr + second.stdout).toBe(0);
    expect(second.stdout).toMatch(/No schema changes/);
    expect(readdirSync(generated).filter(name => name.endsWith('.sql'))).toEqual(sqlFiles);
    expect(readFileSync(path.join(generated, sqlFiles[0]), 'utf8')).toBe(sql);
    // Random snapshot identity is not schema behavior; keep raw files in temp.
    const {id: _id, prevId: _previous, ...schema} = snapshot;
    void _id; void _previous;
    writeFileSync(path.join(evidence, 'schema-generation.json'), JSON.stringify({sql, schema, secondUnchanged: true}, null, 2));
  }, 30000);
});
