// Author: yunnuo <ymz@ebox.vip>
// Description: Run the same schema boundary cases as the Go request validator.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validate, type SchemaName } from './validate';
const cases = JSON.parse(readFileSync('packages/contracts/validation-cases.json','utf8')) as { name:string; schema:SchemaName; value:unknown; fields:string[]; repeatText?:number }[];
for(const entry of cases) it(entry.name,()=>expect(Object.keys(validate(entry.schema,entry.repeatText ? {text:(entry.value as {text:string}).text.repeat(entry.repeatText)} : entry.value)).sort()).toEqual(entry.fields.sort()));
