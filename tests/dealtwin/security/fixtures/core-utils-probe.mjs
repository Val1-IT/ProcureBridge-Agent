import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {compileFunction, runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Isolated trusted-package comparison only. Never installs, edits a package,
// enables the disk cache, or permits the development-server API to be invoked.
process.env.ESBK_DISABLE_CACHE = '1';
const [coreFile, esbuildFile, output] = process.argv.slice(2);
mkdirSync(output, {recursive: true});
const localRequire = createRequire(coreFile);
const esbuild = localRequire(esbuildFile);
const calls = new Set();
const allowed = new Set(['version', 'transform', 'transformSync']);
const selected = new Proxy(esbuild, {get(target, key) {
  assert(allowed.has(key), `Unexpected esbuild API: ${String(key)}`);
  calls.add(key);
  return Reflect.get(target, key);
}});
const loadedModule = {exports: {}};
compileFunction(readFileSync(coreFile, 'utf8'), ['exports', 'require', 'module', '__filename', '__dirname'])(
  loadedModule.exports, name => name === 'esbuild' ? selected : localRequire(name), loadedModule, coreFile, path.dirname(coreFile),
);
const core = loadedModule.exports;
const cases = [
  {name: 'types-enums', source: 'interface Item {amount: number}; enum Kind {First = 2, Second}; const item: Item = {amount: 4}; export default item.amount + Kind.Second;', expected: 7},
  {name: 'type-only-generics', source: 'import type {Missing} from "not-a-runtime-package"; const identity = <T>(x:T):T => x; export default identity({value: 25} satisfies {value: number}).value;', expected: 25},
  {name: 'bigint', source: 'const amount: bigint = 9007199254740993n; export default ((amount * 25n) / 100n).toString();', expected: '2251799813685248'},
  {name: 'class-fields', source: 'class Counter { #amount = 7; static label = "ok"; value() { return this.#amount; } }; export default [new Counter().value(), Counter.name, Counter.label];', expected: [7, 'Counter', 'ok']},
  {name: 'optional-nullish', source: 'const row: {value?:number} = {}; export default [row?.value ?? 8, ({value:0}?.value ?? 9)];', expected: [8, 0]},
  {name: 'jsx', extension: 'tsx', source: 'const h = (tag,props,...children) => ({tag,children}); export default <item>synthetic</item>;', options: {jsxFactory: 'h'}, expected: {tag: 'item', children: ['synthetic']}},
  {name: 'legacy-decorator', source: 'function tag<T extends new (...args:any[])=>any>(constructor:T) { return class extends constructor { label="tagged"; }; } @tag class Item { label="base"; } export default new Item().label;', options: {tsconfigRaw: {compilerOptions: {experimentalDecorators: true}}}, expected: 'tagged'},
  ...[true, false].map(useDefineForClassFields => ({name: `field-mode-${useDefineForClassFields}`, source: 'class Base { set value(v:number) { this.result=v; } result=0; } class Child extends Base { value=5; } export default new Child().result;', options: {tsconfigRaw: {compilerOptions: {useDefineForClassFields}}}, expected: useDefineForClassFields ? 0 : 5})),
];
const results = [];
for (const item of cases) {
  const filename = path.join(output, `${item.name}.${item.extension ?? 'ts'}`);
  const options = {target: 'node22', ...item.options};
  const sync = core.transformSync(item.source, filename, options);
  const context = {module: {exports: {}}, exports: {}};
  runInNewContext(sync.code, context, {timeout: 1000});
  const syncValue = JSON.parse(JSON.stringify(context.module.exports.default));
  assert.deepEqual(syncValue, item.expected);
  const asyncResult = await core.transform(item.source, filename, options);
  const esm = path.join(output, `${item.name}.mjs`);
  writeFileSync(esm, asyncResult.code);
  const asyncValue = (await import(pathToFileURL(esm).href)).default;
  assert.deepEqual(asyncValue, item.expected);
  for (const transformed of [sync, asyncResult]) {
    assert.equal(transformed.map.version, 3);
    assert(transformed.map.mappings.length > 0);
    assert(transformed.map.sourcesContent.includes(item.source));
    assert.equal(transformed.warnings?.length ?? 0, 0);
  }
  results.push({name: item.name, syncValue, asyncValue, sourceMapsValid: true});
}
for (const method of ['transformSync', 'transform']) {
  await assert.rejects(async () => core[method]('export const broken: = ;', path.join(output, 'invalid.ts')), error => {
    assert.equal(error.name, 'Error');
    assert.equal(error.errors[0].location.line, 1);
    return true;
  });
}
console.log(JSON.stringify({version: esbuild.version, calls: [...calls].sort(), results, invalidSyntaxRejected: true}));
