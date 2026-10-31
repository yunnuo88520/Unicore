// Author: yunnuo <ymz@ebox.vip>
import { describe, expect, it } from 'vitest';
import { validate, type SchemaName } from './validate';
import { constraintsToZod, zodFieldErrors } from './zod-schema';

/** First message per field from the SDK validate() — the source of truth this adapter mirrors. */
function contractErrors(name: SchemaName, value: unknown): Record<string, string> {
  return validate(name, value);
}

function zodErrors(name: SchemaName, value: unknown): Record<string, string> {
  const result = constraintsToZod(name).safeParse(value);
  return result.success ? {} : zodFieldErrors(result.error);
}

function expectParity(name: SchemaName, value: unknown) {
  const expected = contractErrors(name, value);
  const actual = zodErrors(name, value);
  for (const [field, message] of Object.entries(expected)) {
    if (message === '输入层级过深') continue; // depth guard is a validate()-only safeguard
    expect(actual[field], `${name}.${field}`).toBe(message);
  }
}

describe('constraintsToZod parity with contract validate()', () => {
  it('accepts valid login input', () => {
    const value = { username: 'yunnuo', password: 'secret-password', captcha_id: '', captcha_answer: '' };
    expect(zodErrors('LoginInput', value)).toEqual({});
    expectParity('LoginInput', value);
  });

  it('reports missing required fields', () => {
    expectParity('LoginInput', {});
    expect(zodErrors('LoginInput', {}).username).toBe('此项为必填');
  });

  it('reports wrong value types', () => {
    expectParity('LoginInput', { username: 42, password: true, captcha_id: 1, captcha_answer: [] });
    expect(zodErrors('LoginInput', { username: 42, password: true, captcha_id: 1, captcha_answer: [] }).username).toBe('应为文本');
  });

  it('counts string length in Unicode code points', () => {
    // '😀' is one code point but two UTF-16 units; a title of three emoji stays within minLength 1 / maxLength 120.
    const value = { title: '😀😀😀', body: 'ok', status: 'open', attachment_ids: [] };
    expectParity('NoteInput', value);
    expect(zodErrors('NoteInput', value)).toEqual({});
  });

  it('rejects unknown fields on strict objects, keyed per field', () => {
    const value = { username: 'a', password: 'b', captcha_id: '', captcha_answer: '', extra: 1 };
    expectParity('LoginInput', value);
    expect(zodErrors('LoginInput', value).extra).toBe('未定义的字段');
  });

  it('maps nested paths to contract-style keys', () => {
    const result = constraintsToZod('LoginInput').safeParse({ username: { deep: 1 }, password: 'x', captcha_id: '', captcha_answer: '' });
    expect(result.success).toBe(false);
    expect(Object.keys(zodFieldErrors(result.error!))).toContain('username');
  });

  it('validates email format through the contract schema', () => {
    const value = { username: 'someone', email: 'not-an-email', password: 'longenough1', captcha_id: '', captcha_answer: '' };
    expectParity('RegisterInput', value);
    expect(zodErrors('RegisterInput', value).email).toBe('请输入有效邮箱');
  });

  it('caches schemas per name', () => {
    expect(constraintsToZod('LoginInput')).toBe(constraintsToZod('LoginInput'));
  });
});
