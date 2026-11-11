// Author: yunnuo <ymz@ebox.vip>
// Description: Run the same schema boundary cases as the Go request validator.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validate, type SchemaName } from './validate';
const cases = JSON.parse(readFileSync('packages/contracts/validation-cases.json','utf8')) as { name:string; schema:SchemaName; value:unknown; fields:string[]; repeatText?:number }[];
for(const entry of cases) it(entry.name,()=>expect(Object.keys(validate(entry.schema,entry.repeatText ? {text:(entry.value as {text:string}).text.repeat(entry.repeatText)} : entry.value)).sort()).toEqual(entry.fields.sort()));
// JSON cannot express a present key with an undefined value, but JavaScript callers
// build inputs that way (optional form fields submitted as `field: '' || undefined`).
// The validator must mirror JSON.stringify and the Go decoder: undefined means absent.
describe('undefined-valued keys mirror JSON encoding',()=>{
  it('optional field set to undefined stays absent',()=>expect(validate('UserCreate',{username:'member',email:'member@example.test',password:'test-password-strong',role:'user',department_id:undefined})).toEqual({}));
  it('required field set to undefined stays required',()=>expect(validate('UserCreate',{username:undefined,email:'member@example.test',password:'test-password-strong',role:'user'})).toEqual({username:'此项为必填'}));
});
