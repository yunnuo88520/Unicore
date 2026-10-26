// Author: yunnuo <ymz@ebox.vip>
// Description: Derive typed calls, validation constraints, error catalogue and offline reference from OpenAPI.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const header='// Code generated from packages/contracts/openapi.json; DO NOT EDIT.\n// Author: yunnuo <ymz@ebox.vip>\n';
const methods=new Set(['get','post','put','patch','delete','head','options']);
const refName=schema=>schema?.$ref?.split('/').at(-1);
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function contractArtifacts(spec){
 const operations={};const names=new Set();
 for(const [path,item] of Object.entries(spec.paths))for(const [method,operation] of Object.entries(item)){
  if(!methods.has(method))continue;
  const id=operation.operationId;const policy=operation['x-unicore'];
  if(!id||names.has(id))throw new Error(`Missing or duplicate operationId: ${method} ${path}`);names.add(id);
  if(!policy?.profiles?.length||!policy.access||!Array.isArray(policy.permissions)||typeof policy.csrf!=='boolean')throw new Error(`Missing access metadata: ${id}`);
  if(path.includes('/admin/')&&!policy.permissions.length)throw new Error(`Admin operation needs permissions: ${id}`);
  for(const security of operation.security??[])for(const name of Object.keys(security))if(!spec.components.securitySchemes[name])throw new Error(`Unknown security scheme: ${name}`);
  if(policy.maxBodyBytes!==undefined&&(!Number.isInteger(policy.maxBodyBytes)||policy.maxBodyBytes<1024||policy.maxBodyBytes>512*1024))throw new Error(`Invalid body limit: ${id}`);
  const requestSchema=refName(operation.requestBody?.content?.['application/json']?.schema);
  const responseSchema=refName(operation.responses?.['200']?.content?.['application/json']?.schema);
  if(operation.requestBody&&!requestSchema)throw new Error(`Request must use a named schema: ${id}`);
  const parameters=[...(item.parameters??[]),...(operation.parameters??[])];
  for(const name of [...path.matchAll(/\{([^}]+)\}/g)].map(match=>match[1]))if(!parameters.some(parameter=>parameter.in==='path'&&parameter.name===name&&parameter.required))throw new Error(`Missing required path parameter: ${id}/${name}`);
  operations[id]={method:method.toUpperCase(),path,requestSchema:requestSchema??null,responseSchema:responseSchema??null,...policy};
 }
 let ts=header+"import type * as Models from './schema.gen';\n\n";
 ts+=`export const operations = ${JSON.stringify(operations,null,2)} as const;\nexport type OperationId = keyof typeof operations;\n`;
 ts+='export interface OperationInputs {\n';for(const [id,op] of Object.entries(operations))ts+=`  ${id}: ${op.requestSchema?`Models.${op.requestSchema}`:'undefined'};\n`;ts+='}\n';
 ts+='export interface OperationData {\n';for(const [id,op] of Object.entries(operations))ts+=`  ${id}: ${op.responseSchema?`Models.${op.responseSchema}['data']`:'void'};\n`;ts+='}\n';
 let errors=header+'\npackage contracts\n\ntype ErrorDefinition struct { Status int; Message string }\n\nvar ErrorCatalog = map[string]ErrorDefinition{\n';
 for(const [code,error] of Object.entries(spec['x-error-codes']))errors+=`${JSON.stringify(code)}: {Status: ${error.status}, Message: ${JSON.stringify(error.message)}},\n`;errors+='}\n';
 errors=execFileSync('gofmt',[],{input:errors,encoding:'utf8'});
 const constraints=JSON.parse(JSON.stringify(spec.components.schemas, (key,value)=>['description','title','example','examples'].includes(key)?undefined:value));
 const supported=new Set(['type','$ref','required','properties','additionalProperties','items','enum','minLength','maxLength','pattern','format','minimum','maximum','minItems','maxItems','uniqueItems','x-max-utf8-bytes']);
 function check(schema){for(const key of Object.keys(schema))if(!supported.has(key))throw new Error(`Extend runtime validation before adding schema keyword: ${key}`);if(schema.pattern)new RegExp(schema.pattern);if(schema.format&&!['email','uri','date-time'].includes(schema.format))throw new Error(`Unsupported format ${schema.format}`);for(const child of Object.values(schema.properties??{}))check(child);if(schema.items)check(schema.items);if(typeof schema.additionalProperties==='object')check(schema.additionalProperties);}
 for(const schema of Object.values(constraints))check(schema);
 const validation=header+`export const constraints = ${JSON.stringify(constraints,null,2)};\n`;
 const theme=JSON.parse(readFileSync('assets/theme/tokens.json','utf8'));
 const palette=JSON.parse(readFileSync('assets/theme/resolved.gen.json','utf8'));
 const html=`<!doctype html>\n<!-- Code generated from OpenAPI; DO NOT EDIT. Author: yunnuo <ymz@ebox.vip> -->\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(theme.brand.name)} · API Reference</title><link rel="icon" href="/favicon.ico"><style>
 :root{color-scheme:light dark;--bg:${theme.modes.light.bg};--surface:${theme.modes.light.surface};--text:${theme.modes.light.text};--muted:${theme.modes.light.muted};--border:${theme.modes.light.border};--primary:${palette.light.primary};font-family:${theme.typography.sans};--space:calc(${theme.spacing.unit} * ${theme.spacing.scale});font-size:calc(16px * ${theme.typography.scale});line-height:1.65}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}main{max-width:1080px;margin:auto;padding:calc(40 * var(--space)) calc(24 * var(--space))}a{color:var(--primary)}h1{font-size:2rem;margin-bottom:8px}h2{margin-top:2rem}p{color:var(--muted)}article,details{background:var(--surface);border:1px solid var(--border);border-radius:calc(16px * ${theme.shape.scale});padding:calc(18 * var(--space));margin:calc(14 * var(--space)) 0}summary{cursor:pointer;overflow-wrap:anywhere}code,pre{font-family:${theme.typography.mono};overflow-wrap:anywhere}pre{white-space:pre-wrap;font-size:.85rem;max-width:100%}.method{color:var(--primary);font-weight:bold}nav{display:flex;gap:calc(18 * var(--space));flex-wrap:wrap}label{display:block;margin:24px 0}input{display:block;width:100%;max-width:500px;padding:12px;border:1px solid var(--border);border-radius:calc(10px * ${theme.shape.scale});background:var(--surface);color:var(--text)}small{color:var(--muted)}@media(prefers-color-scheme:dark){:root{--bg:${theme.modes.dark.bg};--surface:${theme.modes.dark.surface};--text:${theme.modes.dark.text};--muted:${theme.modes.dark.muted};--border:${theme.modes.dark.border};--primary:${palette.dark.primary}}@media(max-width:480px){main{padding:calc(24 * var(--space)) calc(16 * var(--space))}h1{font-size:1.65rem}}
 </style></head><body><main><small>${escape(theme.brand.name.toUpperCase())} · CONTRACT REFERENCE</small><h1>API 文档</h1><p>从唯一 OpenAPI 契约自动生成，包含 ${names.size} 个接口。按运行形态装配；服务端仍独立执行身份、权限及业务校验。</p><nav><a href="#operations">接口目录</a><a href="#schemas">数据结构</a><a href="#errors">错误目录</a><a href="/openapi.json">下载 OpenAPI</a></nav><section id="operations"><h2>接口目录</h2>${Object.entries(operations).map(([id,op])=>`<details id="${escape(id)}"><summary><span class="method">${op.method}</span> <code>${escape(op.path)}</code></summary><p>${escape(spec.paths[op.path][op.method.toLowerCase()].description??id)}</p><small>Profile: ${op.profiles.join(', ')} · Access: ${op.access} · Permissions: ${escape(op.permissions.join(', ')||'—')} · CSRF: ${op.csrf}</small><p>输入：${op.requestSchema?`<a href="#schema-${op.requestSchema}">${op.requestSchema}</a>`:'无 JSON 请求体'} · 响应：${op.responseSchema?`<a href="#schema-${op.responseSchema}">${op.responseSchema}</a>`:'浏览器回调跳转'}</p></details>`).join('')}</section><section id="schemas"><h2>数据结构与校验</h2>${Object.entries(spec.components.schemas).map(([name,schema])=>`<details id="schema-${name}"><summary>${name}</summary><pre>${escape(JSON.stringify(schema,null,2))}</pre></details>`).join('')}</section><section id="errors"><h2>错误目录</h2><p>统一响应包含 code、message、request_id；校验错误可附 fields。日志和错误响应不回显提交值。</p>${Object.entries(spec['x-error-codes']).map(([code,error])=>`<article><code>${code}</code> · ${error.status}<p>${escape(error.message)}</p></article>`).join('')}</section></main></body></html>\n`;
 return [['packages/contracts/src/operations.gen.ts',ts],['packages/contracts/src/constraints.gen.ts',validation],['internal/contracts/errors.gen.go',errors],['packages/contracts/reference.gen.html',html]];
}
