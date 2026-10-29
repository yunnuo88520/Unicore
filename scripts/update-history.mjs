// Author: yunnuo <ymz@ebox.vip>
// Description: Generate offline release history from the single Changelog/version sources.
import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync('CHANGELOG.md','utf8');
const matches=[...source.matchAll(/^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\s*$/gm)];
const releases=matches.map((m,i)=>({version:m[1],published_at:m[2]+'T00:00:00Z',notes:source.slice(m.index+m[0].length,matches[i+1]?.index??source.length).trim(),prerelease:true,url:'',assets:[]}));
const data=JSON.stringify({author:'yunnuo <ymz@ebox.vip>',releases},null,2)+'\n';
const path='assets/updates/history.gen.json';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==data)throw Error('Offline update history drift; run make docs');}
else writeFileSync(path,data);
