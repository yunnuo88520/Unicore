// Author: yunnuo <ymz@ebox.vip>
// Description: Reject untranslated interface literals and incomplete bilingual catalogs before builds and in CI.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const chinese=/[\u3400-\u9fff]/;
const parameters=text=>[...text.matchAll(/\{\{(\w+)\}\}/g)].map(match=>match[1]).sort().join(',');
export function inspectSource(filename,text,catalog){
  const source=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,filename.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const errors=[];
  const report=(node,message)=>{const {line,character}=source.getLineAndCharacterOfPosition(node.getStart(source));errors.push(`${filename}:${line+1}:${character+1} ${message}`);};
  function approved(node){
    let child=node;
    for(let parent=node.parent;parent;child=parent,parent=parent.parent){
      if(ts.isCallExpression(parent)&&parent.arguments[0]===child&&['t','defineMessages'].includes(parent.expression.getText(source)))return true;
      if(ts.isJsxElement(parent)||ts.isJsxSelfClosingElement(parent)||ts.isBlock(parent))return false;
    }
    return false;
  }
  function visit(node){
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)){
      const value=node.text;
      if(chinese.test(value)){
        if(!approved(node))report(node,'Interface Chinese must use t() or a defineMessages() dictionary; business samples belong in fixtures/data.');
        else if(!catalog[value]?.trim())report(node,`Missing English catalog entry: ${value}`);
      }
    }
    if(ts.isCallExpression(node)&&node.expression.getText(source)==='t'&&node.arguments[0]&&ts.isTemplateExpression(node.arguments[0]))report(node,'Use named interpolation instead of a dynamic translation key.');
    ts.forEachChild(node,visit);
  }
  visit(source);return errors;
}
export function inspectCatalog(catalog){
  return Object.entries(catalog).flatMap(([key,value])=>typeof value!=='string'||!value.trim()?[`Empty translation: ${key}`]:parameters(key)!==parameters(value)?[`Translation parameters differ: ${key}`]:[]);
}
export function inspectMetadata(filename,text,catalog){
  // The settings registry uses ordered literal fields; permissions use named UI fields.
  const patterns=filename.replaceAll('\\','/').includes('/settings/')
    ? [/\{\s*"[\w.]+"\s*,\s*"\w+"\s*,\s*"\w+"\s*,\s*("(?:\\.|[^"\\])*")/g,/\bLabel:\s*("(?:\\.|[^"\\])*")/g]
    : [/\b(?:Name|Description|Group):\s*("(?:\\.|[^"\\])*")/g];
  const errors=[];
  for(const pattern of patterns)for(const match of text.matchAll(pattern)){
    const label=JSON.parse(match[1]);
    if(chinese.test(label)&&!catalog[label]?.trim())errors.push(`${filename}: metadata missing English: ${label}`);
  }
  return errors;
}
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(directory,entry.name)):[resolve(directory,entry.name)]);}
export function checkI18n(root){
  const catalogs=['en','license.en','updates.en'].map(name=>JSON.parse(readFileSync(resolve(root,`packages/web-ui/src/locales/${name}.json`),'utf8')));
  const catalog=Object.assign({},...catalogs),errors=inspectCatalog(catalog);
  const seen=new Set();for(const values of catalogs)for(const key of Object.keys(values)){if(seen.has(key))errors.push(`Duplicate catalog key across features: ${key}`);seen.add(key);}
  for(const directory of ['packages/web-ui/src','apps/web/src','apps/desktop/src'])for(const file of files(resolve(root,directory))){
    if(!/\.tsx?$/.test(file)||/\.(test|spec|gen)\.|\.d\.ts$/.test(file))continue;
    errors.push(...inspectSource(relative(root,file),readFileSync(file,'utf8'),catalog));
  }
  const settings=resolve(root,'internal/settings');
  if(existsSync(settings))for(const file of files(settings).filter(file=>file.endsWith('.go')&&!file.endsWith('_test.go'))){
    errors.push(...inspectMetadata(relative(root,file),readFileSync(file,'utf8'),catalog));
  }
  const permissions=resolve(root,'internal/platform/roles.go');
  if(existsSync(permissions))errors.push(...inspectMetadata('internal/platform/roles.go',readFileSync(permissions,'utf8'),catalog));
  const spec=JSON.parse(readFileSync(resolve(root,'packages/contracts/openapi.json'),'utf8'));
  for(const {message} of Object.values(spec['x-error-codes']))if(!catalog[message])errors.push(`Contract error missing English: ${message}`);
  return errors;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const errors=checkI18n(resolve(fileURLToPath(new URL('..',import.meta.url))));
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('PASS bilingual UI literals, catalogs, interpolation and contract errors');
}
