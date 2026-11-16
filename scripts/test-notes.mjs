// Author: yunnuo <ymz@ebox.vip>
// Description: Verify real optional-note builds, dependency exclusion, native contributions and cross-edition data preservation.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { readFeatures } from './build-features.mjs';

const directory=mkdtempSync(join(tmpdir(),'unicore-notes-'));
function run(command,args,env,capture=false){return execFileSync(command,args,{env,encoding:'utf8',stdio:capture?['ignore','pipe','inherit']:'inherit',maxBuffer:16*1024*1024});}
const targets=['./internal/modules/notes','./internal/modules/notes/desktop','./migrations/runner','./internal/adapter/http'];
try{
 // The same actual SQLite files survive three differently compiled processes.
 for(const [enabled,stage] of [[false,'fresh'],[true,'seed'],[false,'disabled'],[true,'restored']]){
  const env={...process.env,FEATURE_NOTES:String(enabled),UNICORE_NOTES_TEST_DIR:directory,UNICORE_NOTES_TEST_STAGE:stage};
  const {tags}=readFeatures(env);
  run('go',['test','-tags',tags,...targets,'-run','TestNotesEdition|TestAPIRoutesMatchContract','-count=1'],env);
 }
 for(const enabled of [false,true]){
  const env={...process.env,FEATURE_NOTES:String(enabled)};
  const {tags}=readFeatures(env);
  for(const [target,buildTags] of [['./cmd/server',tags],['./cmd/desktop',['desktop',tags].filter(Boolean).join(',')]]){
   const dependencies=run('go',['list','-deps','-tags',buildTags,target],env,true);
   for(const suffix of ['domain','usecase','storage/notessql']) assert.equal(dependencies.includes(`/internal/modules/notes/${suffix}`),enabled,`${target}: ${suffix}`);
  }
  for(const app of ['web','desktop']){
   run('pnpm',['--filter',`@unicore/${app}`,'build','--manifest'],env);
   const features=JSON.parse(readFileSync(`apps/${app}/static/features.json`,'utf8'));
   assert.equal(features.notes,enabled);
   const manifest=JSON.parse(readFileSync(`apps/${app}/static/.vite/manifest.json`,'utf8'));
   assert.equal(Object.keys(manifest).some(key=>key.endsWith('/modules/notes/notes.tsx')),enabled,`${app}: notes page chunk exclusion`);
   assert(Object.keys(manifest).some(key=>key.endsWith('/pages/appearance.tsx')),`${app}: settings foundation retained`);
  }
  run('go',['build','-tags',tags,'-o',join(directory,'server'),'./cmd/server'],env);
  run('pnpm',['exec','vitest','run','packages/web-ui/src/notes-edition.test.ts'],env);
  console.log(`PASS notes=${enabled}: server/native assembly, web/desktop bundles and UI gating`);
 }
}finally{rmSync(directory,{recursive:true,force:true});}
