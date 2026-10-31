// Author: yunnuo <ymz@ebox.vip>
// Description: Prove the build gate rejects new untranslated components and incomplete catalogs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectSource,inspectCatalog,inspectMetadata,checkI18n} from './check-i18n.mjs';

test('rejects raw JSX, attributes, metadata and dynamic translation keys',()=>{
  const catalog={'保存':'Save','名称':'Name','你好 {{name}}':'Hello {{name}}'};
  for(const source of ['<button>保存</button>','<input aria-label="名称"/>',"const title='保存';",'t(`你好 ${name}`)']){
    assert.ok(inspectSource('nested/new-page.tsx',source,catalog).length,source);
  }
  assert.deepEqual(inspectSource('page.tsx',"const labels=defineMessages({save:'保存'});const ui=<button>{t('保存')}</button>",catalog),[]);
  assert.ok(inspectSource('page.tsx',"t('没有配套英文')",catalog).some(error=>error.includes('Missing English')));
  assert.ok(inspectSource('page.tsx',"defineMessages({new:'没有配套英文'})",catalog).some(error=>error.includes('Missing English')));
  assert.deepEqual(inspectSource('page.tsx',"// 注释不属于 UI\nconst input=user.content;",catalog),[]);
});
test('rejects missing interpolation and empty translations',()=>{
  assert.equal(inspectCatalog({'你好 {{name}}':'Hello','保存':' '}).length,2);
  assert.deepEqual(inspectCatalog({'你好 {{name}}':'Hello {{name}}'}),[]);
});
test('discovers nested new feature sources and ignores test fixtures',()=>{
  const root=mkdtempSync(join(tmpdir(),'unicore-i18n-gate-'));
  const put=(path,text)=>{const file=join(root,path);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,text);};
  try{
    put('packages/web-ui/src/locales/en.json','{"保存":"Save"}');
    for(const feature of ['license','updates'])put(`packages/web-ui/src/locales/${feature}.en.json`,'{}');
    put('packages/contracts/openapi.json','{"x-error-codes":{}}');
    for(const app of ['web','desktop'])put(`apps/${app}/src/main.tsx`,'export {};');
    put('packages/web-ui/src/features/new/page.test.tsx','<button>测试样本</button>');
    put('packages/web-ui/src/features/new/page.tsx','<button>保存</button>');
    assert.equal(checkI18n(root).length,1);
    put('packages/web-ui/src/features/new/page.tsx',"<button>{t('保存')}</button>");
    assert.deepEqual(checkI18n(root),[]);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('requires translations for settings and permission metadata',()=>{
  assert.equal(inspectMetadata('internal/settings/feature.go','{"feature.enabled", "boolean", "feature", "新功能", "false", true, false, validate}',{}).length,1);
  assert.equal(inspectMetadata('internal/platform/roles.go','{Name: "新权限", Description: "新说明", Group: "新分组"}',{}).length,3);
});
