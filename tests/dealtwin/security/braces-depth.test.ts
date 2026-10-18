import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
type Ast = {type: string; nodes?: Ast[]; value?: string; parent?: Ast};
type Walker = (input: string | Ast, options?: Record<string, unknown>) => unknown;
const braces = require('braces') as Record<string, Walker>;
const nested = (count: number, open = '(', close = ')') => open.repeat(count) + 'x' + close.repeat(count);
const astAtDepth = (depth: number): Ast => {
  const root: Ast = {type: 'root', nodes: []};
  let node = root;
  for (let i = 0; i < depth; i++) {
    const child: Ast = {type: 'paren', nodes: [], parent: node};
    node.nodes!.push(child);
    node = child;
  }
  node.nodes!.push({type: 'text', value: 'x', parent: node});
  return root;
};

describe('maintained braces depth boundary', () => {
  it.each(['parse', 'compile', 'expand', 'stringify', 'create'])('%s rejects 65 nested containers with a controlled error', method => {
    for (const [open, close] of [['(', ')'], ['{', '}'], ['({', '})']]) {
      const count = open.length === 2 ? 33 : 65;
      expect(() => braces[method](nested(count, open, close))).toThrow(expect.objectContaining({code: 'ERR_BRACES_DEPTH'}));
    }
  });

  it.each([63, 64])('preserves valid patterns at depth %i', depth => {
    expect(braces.stringify(nested(depth))).toBe(nested(depth));
    expect(braces.compile(nested(depth))).toBe(nested(depth));
    expect(braces.expand(nested(depth))).toEqual([nested(depth)]);
    expect(braces.stringify(nested(depth, '{', '}'))).toBe(nested(depth, '{', '}'));
  });

  it('rejects unmatched nesting and nested ranges before recursive parser helpers', () => {
    for (const input of ['('.repeat(65), '{'.repeat(65), '{'.repeat(65) + '1..3,4' + '}'.repeat(65)]) {
      expect(() => braces.parse(input)).toThrow(expect.objectContaining({code: 'ERR_BRACES_DEPTH'}));
    }
  });

  it('guards the internal parser and callable array entry point', () => {
    const parse = require('braces/lib/parse') as Walker;
    const main = require('braces') as (input: string[]) => unknown;
    expect(() => parse(nested(65))).toThrow(expect.objectContaining({code: 'ERR_BRACES_DEPTH'}));
    expect(() => main(['{a,b}', nested(65)])).toThrow(expect.objectContaining({code: 'ERR_BRACES_DEPTH'}));
    expect(main(['{a,b}', '{c,d}'])).toEqual(['(a|b)', '(c|d)']);
  });

  it.each(['compile', 'expand', 'stringify'])('%s validates direct ASTs and internal library entry points', method => {
    const internal = require(`braces/lib/${method}`) as Walker;
    for (const walk of [braces[method], internal]) {
      expect(walk(astAtDepth(64))).toEqual(method === 'expand' ? ['x'] : 'x');
      expect(() => walk(astAtDepth(65))).toThrow(expect.objectContaining({code: 'ERR_BRACES_DEPTH'}));
      // This assertion fails before any cycle is passed to an unpatched implementation.
      // RED uses only the 65-level, 67-node bounded tree above.
      const cycle: Ast = {type: 'root', nodes: []};
      cycle.nodes!.push(cycle);
      expect(() => walk(cycle)).toThrow(expect.objectContaining({code: 'ERR_BRACES_AST'}));
      const parentCycle = astAtDepth(1);
      parentCycle.nodes![0].parent = parentCycle.nodes![0];
      expect(() => walk(parentCycle)).toThrow(expect.objectContaining({code: 'ERR_BRACES_AST'}));
      const shared = {type: 'text', value: 'x'};
      expect(() => walk({type: 'root', nodes: [shared, shared]})).toThrow(expect.objectContaining({code: 'ERR_BRACES_AST'}));
      expect(() => walk({type: 'root', nodes: [null]} as unknown as Ast)).toThrow(expect.objectContaining({code: 'ERR_BRACES_AST'}));
      expect(() => walk({type: 'root', nodes: 'bad'} as unknown as Ast)).toThrow(expect.objectContaining({code: 'ERR_BRACES_AST'}));
    }
  });

  it('preserves escaping, quotes, brackets, ranges and expansion options', () => {
    const literal = '{'.repeat(80);
    expect(braces.stringify('\\{'.repeat(80))).toBe(literal);
    expect(braces.stringify('\\{'.repeat(80), {keepEscaping: true})).toBe('\\{'.repeat(80));
    for (const quote of ['"', "'", '`']) {
      expect(braces.stringify(quote + literal + quote)).toBe(literal);
      expect(braces.stringify(quote + literal + quote, {keepQuotes: true})).toBe(quote + literal + quote);
    }
    expect(braces.stringify('[' + literal + ']')).toBe('[' + literal + ']');
    expect(braces.expand('file{01..03}.{js,ts}')).toEqual(['file01.js', 'file01.ts', 'file02.js', 'file02.ts', 'file03.js', 'file03.ts']);
    expect(braces.expand('{a,a,,b}', {nodupes: true, noempty: true})).toEqual(['a', 'b']);
    expect(() => braces.expand('{1..5}', {rangeLimit: 3})).toThrow(/range limit/);
    expect(braces.expand('a{b,c{d,e}}f')).toEqual(['abf', 'acdf', 'acef']);
  });

  it('preserves real micromatch and fast-glob consumers', () => {
    const micromatch = require('micromatch') as (paths: string[], patterns: string[]) => string[];
    expect(micromatch(['a.ts', 'b.js', 'c.md', 'd.test.ts'], ['*.{js,ts}', '!*.test.ts'])).toEqual(['a.ts', 'b.js']);
    const glob = require('fast-glob') as {sync(pattern: string, options: object): string[]};
    expect(glob.sync('lib/dealtwin/{domain,compiler}/**/*.{ts,tsx}', {onlyFiles: true}).length).toBeGreaterThan(0);
  });
});
