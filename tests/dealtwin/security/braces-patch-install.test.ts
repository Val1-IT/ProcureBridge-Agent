import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {applyBracesPatch} from '../../../scripts/security/apply-braces-patch.mjs';

type PatchFile = {path: string; source?: string; originalSha256: string | null; patchedSha256: string; edits?: {before: string; after: string}[]};
const manifest = JSON.parse(readFileSync('patches/braces-3.0.3/manifest.json', 'utf8')) as {version: string; integrity: string; resolved: string; files: PatchFile[]};
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const output = path.resolve('output/braces-backport-20261018/install-fixtures');
mkdirSync(output, {recursive: true});

// Small isolated fixtures are retained under ignored output for inspection. No live
// package is overwritten or unpatched, and these tests never run npm/install hooks.
function pristineFixture() {
  const root = mkdtempSync(path.join(output, 'case-'));
  const directory = path.join(root, 'node_modules/braces');
  const entry = {version: manifest.version, integrity: manifest.integrity, resolved: manifest.resolved};
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {'node_modules/braces': entry}}));
  for (const file of manifest.files) {
    if (file.source) continue;
    let data = readFileSync(path.join('node_modules/braces', file.path));
    if (sha(data) === file.patchedSha256) {
      let source = data.toString();
      for (const edit of [...(file.edits ?? [])].reverse()) {
        expect(source.split(edit.after)).toHaveLength(2);
        source = source.replace(edit.after, edit.before);
      }
      data = Buffer.from(source);
    }
    expect(sha(data)).toBe(file.originalSha256);
    const target = path.join(directory, file.path);
    mkdirSync(path.dirname(target), {recursive: true});
    writeFileSync(target, data);
  }
  return {root, directory, entry};
}

describe('reproducible braces patch installation', () => {
  it('permits explicitly omitted development packages, but still patches any installed copy', () => {
    const root = mkdtempSync(path.join(output, 'production-'));
    writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {'node_modules/braces': {
      version: manifest.version, integrity: manifest.integrity, resolved: manifest.resolved, dev: true,
    }}}));
    expect(() => applyBracesPatch(root, {omitDev: false})).toThrow();
    expect(applyBracesPatch(root, {omitDev: true})).toMatchObject({copies: 0, omittedDevCopies: 1, changedFiles: 0});
    const installed = pristineFixture();
    expect(applyBracesPatch(installed.root, {omitDev: true})).toMatchObject({copies: 1, changedFiles: 5});
  });

  it('matches pristine 3.0.3 on a bounded normal-pattern corpus', () => {
    const {directory} = pristineFixture();
    const require = createRequire(import.meta.url);
    type Braces = Record<string, (input: string, options: object) => unknown>;
    const upstream = require(path.join(directory, 'index.js')) as Braces;
    const patched = require('braces') as Braces;
    const atoms = ['plain', '{a,b}', '{1..3}', '{03..01}', '{a..c}', '{}', '{a,,b}', '{x', 'x}', '(x)', '[{()}]', '\\{x\\}', '"{a,b}"', '${x,y}', '{1..x}'];
    const patterns = atoms.flatMap(atom => [atom, `pre${atom}post`, `{a,${atom}}`, `(${atom})`]);
    for (const pattern of patterns) {
      for (const options of [{}, {keepEscaping: true, keepQuotes: true}, {escapeInvalid: true, nodupes: true, noempty: true}]) {
        for (const method of ['compile', 'expand', 'stringify']) {
          expect(patched[method](pattern, options), `${method}: ${pattern}`).toEqual(upstream[method](pattern, options));
        }
      }
    }
  });

  it('patches exact original bytes, verifies every file and is idempotent', () => {
    const {root, directory} = pristineFixture();
    expect(() => applyBracesPatch(root, {check: true})).toThrow(/patch missing/);
    expect(applyBracesPatch(root)).toMatchObject({copies: 1, changedFiles: 5});
    for (const file of manifest.files) expect(sha(readFileSync(path.join(directory, file.path)))).toBe(file.patchedSha256);
    expect(applyBracesPatch(root)).toMatchObject({changedFiles: 0});
    expect(applyBracesPatch(root, {check: true})).toMatchObject({changedFiles: 0, checked: true});
  });

  it('refuses unknown bytes before changing any file', () => {
    const {root, directory} = pristineFixture();
    const parse = readFileSync(path.join(directory, 'lib/parse.js'));
    writeFileSync(path.join(directory, 'lib/utils.js'), 'unexpected package content');
    expect(() => applyBracesPatch(root)).toThrow(/unknown braces bytes/);
    expect(readFileSync(path.join(directory, 'lib/parse.js'))).toEqual(parse);
    expect(() => readFileSync(path.join(directory, 'lib/depth-guard.js'))).toThrow();
  });

  it('refuses changed version and lock integrity instead of silently carrying the patch forward', () => {
    const {root, directory, entry} = pristineFixture();
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({version: '3.0.4'}));
    expect(() => applyBracesPatch(root)).toThrow(/version changed/);
    writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {'node_modules/braces': {...entry, integrity: 'changed'}}}));
    expect(() => applyBracesPatch(root)).toThrow(/lock provenance changed/);
  });

  it('preflights all locked copies and patches nested copies', () => {
    const {root, directory, entry} = pristineFixture();
    const name = 'node_modules/consumer/node_modules/braces';
    const nested = path.join(root, name);
    cpSync(directory, nested, {recursive: true});
    writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {'node_modules/braces': entry, [name]: entry}}));
    const target = path.join(nested, 'lib/compile.js');
    const original = readFileSync(target);
    writeFileSync(target, 'unknown');
    expect(() => applyBracesPatch(root)).toThrow(/unknown braces bytes/);
    expect(() => readFileSync(path.join(directory, 'lib/depth-guard.js'))).toThrow();
    writeFileSync(target, original);
    expect(applyBracesPatch(root)).toMatchObject({copies: 2, changedFiles: 10});
    expect(applyBracesPatch(root, {check: true})).toMatchObject({copies: 2, checked: true});
  });

  it('recovers a partially applied patch and rejects tampering in check mode', () => {
    const {root, directory} = pristineFixture();
    const original = readFileSync(path.join(directory, 'lib/parse.js'));
    applyBracesPatch(root);
    writeFileSync(path.join(directory, 'lib/parse.js'), original);
    expect(applyBracesPatch(root)).toMatchObject({changedFiles: 1});
    writeFileSync(path.join(directory, 'lib/depth-guard.js'), 'tampered');
    expect(() => applyBracesPatch(root, {check: true})).toThrow(/unknown braces bytes/);
  });
});
