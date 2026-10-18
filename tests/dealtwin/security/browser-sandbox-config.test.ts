import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Read the configuration contract without executing its credential/bootstrap setup.
const source = ts.createSourceFile('playwright.dealtwin.config.ts', readFileSync('playwright.dealtwin.config.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const entry = object.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(source) === name);
  return entry && ts.isPropertyAssignment(entry) ? entry.initializer : undefined;
}
function object(value: ts.Expression | undefined): ts.ObjectLiteralExpression {
  expect(value && ts.isObjectLiteralExpression(value)).toBe(true);
  return value as ts.ObjectLiteralExpression;
}

describe('Judge browser security configuration', () => {
  it('explicitly enables the Chromium sandbox instead of inheriting Playwright’s disabled default', () => {
    const exported = source.statements.find(ts.isExportAssignment);
    expect(exported && ts.isCallExpression(exported.expression)).toBe(true);
    const config = object((exported!.expression as ts.CallExpression).arguments[0]);
    const use = object(property(config, 'use'));
    const launch = object(property(use, 'launchOptions'));
    expect(property(launch, 'chromiumSandbox')?.kind).toBe(ts.SyntaxKind.TrueKeyword);
    // No custom executable, raw flags or ignored defaults may silently bypass that setting.
    expect(launch.properties.map(item => item.name?.getText(source))).toEqual(['chromiumSandbox']);
  });
});
