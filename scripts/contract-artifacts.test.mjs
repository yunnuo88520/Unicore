// Author: yunnuo <ymz@ebox.vip>
// Description: Contract generation rejects ambiguous multipart uploads and recognizes XLSX binary responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractArtifacts} from './contract-artifacts.mjs';

const load=()=>JSON.parse(readFileSync(new URL('../packages/contracts/openapi.json',import.meta.url),'utf8'));
test('XLSX metadata retains multipart request and binary response',()=>{
 const artifacts=contractArtifacts(load());
 const source=artifacts.find(([path])=>path.endsWith('operations.gen.ts'))[1];
 const operations=JSON.parse(source.slice(source.indexOf('export const operations = ')+26,source.indexOf(' as const;')));
 assert.equal(operations.importUsers.multipartRequest,true);
 assert.equal(operations.exportUsers.binaryResponse,true);
 assert.equal(operations.exportFiles.binaryResponse,true);
});
for(const mutation of [schema=>{schema.additionalProperties=true;},schema=>{schema.required=[];},schema=>{schema.properties.file.format='text';},schema=>{schema.properties.extra={type:'string'};}]){
 test(`reject multipart shape ${mutation.toString()}`,()=>{
  const spec=load();mutation(spec.paths['/api/v1/admin/users/import.xlsx'].post.requestBody.content['multipart/form-data'].schema);
  assert.throws(()=>contractArtifacts(spec),/Multipart upload must declare exactly one required binary file/);
 });
}

test('Go value metadata does not become a runtime validation keyword',()=>{
 const spec=load(); spec.components.schemas.UserCreate.properties.role['x-go-value']=true;
 const constraints=contractArtifacts(spec).find(([path])=>path.endsWith('constraints.gen.ts'))[1];
 assert.ok(!constraints.includes('x-go-value'));
});

test('branding upload contract accommodates a 500 KB image encoded as JSON base64',()=>{
 const spec=load();
 const operation=spec.paths['/api/v1/admin/branding'].put;
 assert.equal(operation['x-unicore'].maxBodyBytes,768*1024);
 assert.equal(spec.components.schemas.BrandingInput.properties.content.maxLength,682668);
 assert.doesNotThrow(()=>contractArtifacts(spec));
});

test('admin security validation and generated paths apply to every explicit root version',()=>{
 for(const root of ['/api/v2','/api/v12']){
  const spec=load();const op=structuredClone(spec.paths['/api/v1/admin/users'].get);
  op.operationId='versionedUsers';spec.paths[`${root}/admin/users`]={get:op};
  let source=contractArtifacts(spec).find(([path])=>path.endsWith('operations.gen.ts'))[1];
  assert.ok(source.includes(`"path": "${root}/admin/users"`));
  op['x-unicore'].identityRealm='user';
  assert.throws(()=>contractArtifacts(spec),/Admin operation must fix identityRealm/);
  op['x-unicore'].identityRealm='administrator';op.security=[{SessionCookie:[]}];
  assert.throws(()=>contractArtifacts(spec),/Admin operation must use AdministratorSession/);
  op.security=[{AdministratorSession:[]}];delete op['x-unicore'].uiPage;op['x-unicore'].permissions=[];
  assert.throws(()=>contractArtifacts(spec),/Admin operation needs permissions/);
 }
});
