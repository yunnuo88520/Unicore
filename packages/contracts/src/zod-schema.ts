// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime adapter turning generated contract constraints into Zod schemas for React Hook Form.
// Messages mirror packages/contracts/src/validate.ts one-for-one; the SDK validate() stays the final gate.
import { z } from 'zod';
import { constraints, type SchemaName } from './validate';

type Schema = {
  $ref?: string; type?: string; required?: string[]; properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema; items?: Schema; enum?: unknown[];
  minLength?: number; maxLength?: number; pattern?: string; format?: string;
  minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean;
  'x-max-utf8-bytes'?: number;
};
const schemas = constraints as Record<string, Schema>;

const cache = new Map<SchemaName, z.ZodType>();

export function constraintsToZod(name: SchemaName): z.ZodType {
  const cached = cache.get(name);
  if (cached) return cached;
  if (!schemas[name]) throw new Error(`未登记的输入结构: ${String(name)}`);
  const schema = adapt(schemas[name], false);
  cache.set(name, schema);
  return schema;
}

function requiredError(required: boolean, fallback: string) {
  return (issue: { input?: unknown }) => (required && issue?.input === undefined ? '此项为必填' : fallback);
}

function adapt(schema: Schema, required: boolean): z.ZodType {
  if (schema.$ref) {
    const target = schemas[schema.$ref.split('/').at(-1)!];
    if (!target) return z.never({ error: '未登记的输入结构' });
    if (target === schema || target.$ref === schema.$ref) return z.lazy(() => adapt(target, required));
    return adapt(target, required);
  }
  if (schema.enum) {
    if (!schema.enum.every(value => typeof value === 'string')) throw new Error(`不支持的输入类型: 枚举含非字符串`);
    return z.enum(schema.enum as [string, ...string[]], { error: requiredError(required, '请选择有效选项') });
  }
  switch (schema.type) {
    case 'object': return objectSchema(schema, required);
    case 'string': return stringSchema(schema, required);
    case 'boolean': return z.boolean({ error: requiredError(required, '应为布尔值') });
    case 'integer': return integerSchema(schema, required);
    case 'array': return arraySchema(schema, required);
    default: return z.never({ error: requiredError(required, '不支持的输入类型') });
  }
}

function objectSchema(schema: Schema, required: boolean): z.ZodType {
  const wrapped: Record<string, z.ZodType> = {};
  const requiredFields = new Set(schema.required ?? []);
  for (const [field, property] of Object.entries(schema.properties ?? {})) {
    wrapped[field] = adapt(property, requiredFields.has(field));
  }
  if (schema.additionalProperties === false) {
    return z.strictObject(wrapped, {
      error: (issue: { code?: string; input?: unknown }) => (issue.code === 'unrecognized_keys' ? '未定义的字段' : required && issue.input === undefined ? '此项为必填' : '应为对象'),
    });
  }
  const object = z.object(wrapped, { error: requiredError(required, '应为对象') });
  return typeof schema.additionalProperties === 'object' ? object.catchall(adapt(schema.additionalProperties, false)) : object;
}

function stringSchema(schema: Schema, required: boolean): z.ZodType {
  return z.string({ error: requiredError(required, '应为文本') }).superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) return fail(`至少 ${schema.minLength} 个字符`);
    if (schema.maxLength !== undefined && length > schema.maxLength) return fail(`最多 ${schema.maxLength} 个字符`);
    if (schema['x-max-utf8-bytes'] !== undefined && new TextEncoder().encode(value).length > schema['x-max-utf8-bytes']) return fail(`最多 ${schema['x-max-utf8-bytes']} 字节`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return fail('格式不正确');
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail('请输入有效邮箱');
    if (schema.format === 'uri' && !/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(value)) return fail('请输入有效地址');
    if (schema.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || Number.isNaN(Date.parse(value)))) return fail('请输入有效时间');
  });
}

function integerSchema(schema: Schema, required: boolean): z.ZodType {
  const base = z.number({ error: requiredError(required, '应为整数') }).int('应为整数');
  if (schema.minimum !== undefined) base.min(schema.minimum, '数值低于最小值');
  if (schema.maximum !== undefined) base.max(schema.maximum, '数值超过最大值');
  return base.refine(Number.isSafeInteger, '应为整数');
}

function arraySchema(schema: Schema, required: boolean): z.ZodType {
  const base = z.array(schema.items ? adapt(schema.items, false) : z.unknown(), { error: requiredError(required, '应为列表') });
  if (schema.minItems !== undefined) base.min(schema.minItems, '列表项目不足');
  if (schema.maxItems !== undefined) base.max(schema.maxItems, '列表项目过多');
  if (schema.uniqueItems) base.refine(items => new Set(items.map(item => JSON.stringify(item))).size === items.length, '列表项目不能重复');
  return base;
}

/** Flatten a ZodError into contract-style field keys ('a.b[0]'), first message per key.
 *  Strict-object unknown keys arrive as one root issue in Zod; expand them per field like validate() does. */
export function zodFieldErrors(error: z.ZodError, limit = 20): Record<string, string> {
  const errors: Record<string, string> = Object.create(null);
  const put = (field: string, message: string) => { errors[field] ??= message; };
  for (const issue of error.issues) {
    if (Object.keys(errors).length >= limit) break;
    const prefix = issue.path.reduce<string>((acc, segment) => {
      if (typeof segment === 'number') return `${acc}[${segment}]`;
      const name = String(segment);
      return acc ? `${acc}.${name}` : name;
    }, '');
    if (issue.code === 'unrecognized_keys') {
      for (const key of (issue as unknown as { keys?: string[] }).keys ?? []) put(prefix ? `${prefix}.${key}` : key, '未定义的字段');
    } else put(prefix || '$form', issue.message);
  }
  return errors;
}
