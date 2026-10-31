// Author: yunnuo <ymz@ebox.vip>
// Description: Keep shared interface copy and contract error translations complete and interpolation-safe.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import english from './locales/en.json';
import license from './locales/license.en.json';
import updates from './locales/updates.en.json';

it('covers literal UI copy and preserves every interpolation parameter', () => {
  const catalog: Record<string, string> = { ...english, ...license, ...updates };
  const directory = resolve('packages/web-ui/src') + '/';
  const missing: string[] = [];
  for (const file of readdirSync(directory).filter(file => file.endsWith('.tsx') && !file.includes('.test.'))) {
    const source = ts.createSourceFile(file, readFileSync(directory + file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const text = node.arguments[0].text;
        if (/[\u3400-\u9fff]/.test(text) && !catalog[text]) missing.push(`${file}: ${text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const spec = JSON.parse(readFileSync('packages/contracts/openapi.json', 'utf8'));
  for (const error of Object.values(spec['x-error-codes']) as {message: string}[]) {
    if (!catalog[error.message]) missing.push(`contract error: ${error.message}`);
  }
  expect(missing).toEqual([]);
  const parameters = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
  for (const [key, value] of Object.entries(catalog)) expect(parameters(value), key).toEqual(parameters(key));
});
