// Author: yunnuo <ymz@ebox.vip>
// Description: Copy versioned brand assets into Web, Wails and native packaging inputs.
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const theme=JSON.parse(readFileSync(`${root}assets/theme/resolved.gen.json`,'utf8'));
for(const app of ['web','desktop']){
 const target=`${root}apps/${app}/public`;mkdirSync(target,{recursive:true});
 writeFileSync(`${target}/site.webmanifest`,JSON.stringify({name:theme.brand.name,short_name:theme.brand.name,start_url:'/',display:'standalone',background_color:theme.light.bg,theme_color:theme.brand.accent,icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}]}));
 const htmlPath=`${root}apps/${app}/index.html`;
 const html=readFileSync(htmlPath,'utf8').replace(/(<meta name="theme-color" content=")[^"]+/,`$1${theme.brand.accent}`);
 writeFileSync(htmlPath,html);
 for(const [source,name] of [['mark.svg','favicon.svg'],['favicon.ico','favicon.ico'],['icon-180.png','apple-touch-icon.png'],['icon-192.png','icon-192.png'],['icon-512.png','icon-512.png']])cpSync(`${root}assets/brand/${source}`,`${target}/${name}`);
}
mkdirSync(`${root}build/desktop`,{recursive:true});cpSync(`${root}assets/brand/icon-1024.png`,`${root}build/desktop/appicon.png`);

mkdirSync(`${root}build/desktop/windows`,{recursive:true});cpSync(`${root}assets/brand/favicon.ico`,`${root}build/desktop/windows/icon.ico`);

mkdirSync(`${root}build/desktop/darwin`,{recursive:true});cpSync(`${root}assets/native/Info.plist`,`${root}build/desktop/darwin/Info.plist`);

const configPath=`${root}cmd/desktop/wails.json`;const config=JSON.parse(readFileSync(configPath,'utf8'));config.name=theme.brand.name;config.info.productName=theme.brand.name;config.info.comments=`${theme.brand.name} · Go + React`;writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
