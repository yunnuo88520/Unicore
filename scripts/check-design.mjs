// Author: yunnuo <ymz@ebox.vip>
// Description: Keep component colors in the shared design source and verify synchronized shell icons.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function exists(path){try{readdirSync(path);return true;}catch{return false;}}
// Token definitions live in the generated theme layer plus the shell CSS entry points;
// usages are scanned across every package that renders styles.
const dirs=['packages/theme/src','packages/web-ui/src','packages/ui/src','packages/form/src'];
const entries=dirs.filter(dir=>exists(dir)).flatMap(dir=>readdirSync(dir).filter(name=>/\.(css|tsx)$/.test(name)).map(file=>`${dir}/${file}`));
const styles=entries.filter(file=>file.endsWith('.css'));
const definedTokens=new Set(styles.flatMap(file=>[...readFileSync(file,'utf8').matchAll(/(--[\w-]+)\s*:/g)].map(match=>match[1])));
for(const file of entries)for(const match of readFileSync(file,'utf8').matchAll(/var\((--[\w-]+)/g)){
 // Template-built prefixes like var(--preset-${id}) resolve to defined tokens at runtime.
 if(match[1].endsWith('-'))continue;
 if(!definedTokens.has(match[1]))throw new Error(`${file}: undefined design token ${match[1]}`);
}
for(const file of entries){
 if(file.includes('.gen.')||file.includes('.test.'))continue; // Generated and test files may carry literal colors.
 const text=readFileSync(file,'utf8');
 if(/#[0-9a-f]{3,8}\b/i.test(text)||/\brgba?\(/i.test(text))throw new Error(`${file}: move raw palette colors into assets/theme/tokens.json`);
}
for(const app of ['web','desktop'])for(const[source,target]of [['mark.svg','favicon.svg'],['favicon.ico','favicon.ico'],['icon-180.png','apple-touch-icon.png'],['icon-192.png','icon-192.png'],['icon-512.png','icon-512.png']]){
 if(digest(`assets/brand/${source}`)!==digest(`apps/${app}/public/${target}`))throw new Error(`${app}/${target} is stale; run pnpm design:generate`);
}
for(const file of entries){
 if(/[\u{1F000}-\u{1FAFF}\uFE0F\u20E3]/u.test(readFileSync(file,'utf8')))throw new Error(`${file}: use Lucide/SVG icons instead of emoji`);
}
console.log('PASS shared design tokens and synchronized Web/Desktop brand assets');
