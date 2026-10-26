// Author: yunnuo <ymz@ebox.vip>
// Description: Shared form and client validation for the explicitly supported contract schema subset.
import { constraints } from './constraints.gen';
type Schema = { $ref?: string; type?: string; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean | Schema; items?: Schema; enum?: unknown[]; minLength?: number; maxLength?: number; pattern?: string; format?: string; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean; 'x-max-utf8-bytes'?: number };
const schemas = constraints as Record<string, Schema>;
export type SchemaName = keyof typeof constraints;
export function validate(name: SchemaName, value: unknown): Record<string, string> {
  const errors: Record<string, string> = Object.create(null);
  function walk(schema: Schema, input: unknown, path: string, depth = 0) {
    const key = path || '$form'; const fail = (message: string) => { errors[key] ??= message; };
    if (Object.keys(errors).length >= 20) return;
    if (depth > 32) { fail('输入层级过深'); return; }
    if (schema.$ref) { const target = schemas[schema.$ref.split('/').at(-1)!]; if (target) walk(target, input, path, depth + 1); else fail('未登记的输入结构'); return; }
    if (schema.enum && !schema.enum.includes(input)) { fail('请选择有效选项'); return; }
    if (schema.type === 'object') {
      if (!input || typeof input !== 'object' || Array.isArray(input)) { fail('应为对象'); return; }
      const object = input as Record<string, unknown>;
      const child = (field: string) => path ? `${path}.${field}` : field;
      for (const field of schema.required ?? []) if (!Object.hasOwn(object, field) && Object.keys(errors).length < 20) errors[child(field)] = '此项为必填';
      for (const [field, item] of Object.entries(object)) {
        if (Object.hasOwn(schema.properties ?? {}, field)) walk(schema.properties![field], item, child(field), depth + 1);
        else if (schema.additionalProperties === false) { if(Object.keys(errors).length < 20) errors[child(field)] = '未定义的字段'; }
        else if (typeof schema.additionalProperties === 'object') walk(schema.additionalProperties, item, child(field), depth + 1);
      }
    } else if (schema.type === 'string') {
      if (typeof input !== 'string') { fail('应为文本'); return; }
      const length = Array.from(input).length;
      if (schema.minLength !== undefined && length < schema.minLength) fail(`至少 ${schema.minLength} 个字符`);
      if (schema.maxLength !== undefined && length > schema.maxLength) fail(`最多 ${schema.maxLength} 个字符`);
      if (schema['x-max-utf8-bytes'] !== undefined && new TextEncoder().encode(input).length > schema['x-max-utf8-bytes']) fail(`最多 ${schema['x-max-utf8-bytes']} 字节`);
      if (schema.pattern && !new RegExp(schema.pattern).test(input)) fail('格式不正确');
      if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) fail('请输入有效邮箱');
      if (schema.format === 'uri' && !/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(input)) fail('请输入有效地址');
      if (schema.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(input) || Number.isNaN(Date.parse(input)))) fail('请输入有效时间');
    } else if (schema.type === 'boolean') { if (typeof input !== 'boolean') fail('应为布尔值');
    } else if (schema.type === 'integer') {
      if (typeof input !== 'number' || !Number.isSafeInteger(input)) { fail('应为整数'); return; }
      if (schema.minimum !== undefined && input < schema.minimum) fail('数值低于最小值');
      if (schema.maximum !== undefined && input > schema.maximum) fail('数值超过最大值');
    } else if (schema.type === 'array') {
      if (!Array.isArray(input)) { fail('应为列表'); return; }
      if (schema.minItems !== undefined && input.length < schema.minItems) fail('列表项目不足');
      if (schema.maxItems !== undefined && input.length > schema.maxItems) fail('列表项目过多');
      if (schema.uniqueItems && new Set(input.map(item => JSON.stringify(item))).size !== input.length) fail('列表项目不能重复');
      input.forEach((item, index) => { if (schema.items) walk(schema.items, item, `${path}[${index}]`, depth + 1); });
    } else fail('不支持的输入类型');
  }
  walk(schemas[name], value, ''); return errors;
}
