// Author: yunnuo <ymz@ebox.vip>
// Description: Keep component colors in the shared design source and verify synchronized shell icons.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const styleFiles=['tokens.gen.css','styles.css','flows.css'];
const definedTokens=new Set(styleFiles.flatMap(file=>[...readFileSync(`packages/web-ui/src/${file}`,'utf8').matchAll(/(--[\w-]+)\s*:/g)].map(match=>match[1])));
for(const file of [...styleFiles,'brand.tsx'])for(const match of readFileSync(`packages/web-ui/src/${file}`,'utf8').matchAll(/var\((--[\w-]+)/g)){
 if(!definedTokens.has(match[1]))throw new Error(`${file}: undefined design token ${match[1]}`);
}
for(const file of ['styles.css','flows.css','brand.tsx']){
 const text=readFileSync(`packages/web-ui/src/${file}`,'utf8');
 if(/#[0-9a-f]{3,8}\b/i.test(text)||/\brgba?\(/i.test(text))throw new Error(`${file}: move raw palette colors into assets/theme/tokens.json`);
}
for(const app of ['web','desktop'])for(const[source,target]of [['mark.svg','favicon.svg'],['favicon.ico','favicon.ico'],['icon-180.png','apple-touch-icon.png'],['icon-192.png','icon-192.png'],['icon-512.png','icon-512.png']]){
 if(digest(`assets/brand/${source}`)!==digest(`apps/${app}/public/${target}`))throw new Error(`${app}/${target} is stale; run pnpm design:generate`);
}
console.log('PASS shared design tokens and synchronized Web/Desktop brand assets');
