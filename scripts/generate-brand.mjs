// Author: yunnuo <ymz@ebox.vip>
// Description: Derive all brand artwork and favicon sizes from one vector identity.
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const theme = JSON.parse(readFileSync('assets/theme/resolved.gen.json', 'utf8'));
function publish(path,value){const expected=Buffer.from(value);if(process.argv.includes('--check')){if(!readFileSync(path).equals(expected))throw new Error(`${path} is stale; run pnpm design:generate`);}else writeFileSync(path,expected);}
const identity = JSON.parse(readFileSync('assets/brand/identity.json', 'utf8'));
const mark = (background) => `<!-- Author: yunnuo <ymz@ebox.vip> -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${identity.viewBox}"><rect width="64" height="64" rx="17" fill="${background}"/><path d="${identity.uPath}" fill="white"/><path d="${identity.corePath}" fill="white"/></svg>\n`;
publish('assets/brand/mark.svg', mark(theme.brand.accent));
publish('assets/brand/mark-dark.svg', mark(theme.dark['brand-accent']));
const escapedName=theme.brand.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const wordmarkWidth=96+theme.brand.name.length*27;
publish('assets/brand/wordmark.svg', `<!-- Author: yunnuo <ymz@ebox.vip> -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${wordmarkWidth}" height="80" viewBox="0 0 ${wordmarkWidth} 80"><style>text{fill:${theme.light.text}}@media(prefers-color-scheme:dark){text{fill:${theme.dark.text}}}</style><g transform="translate(0 8)">${mark(theme.brand.accent).match(/<rect[\s\S]*<\/svg>/)[0].replace('</svg>','')}</g><text x="82" y="54" font-size="43" font-weight="650" font-family="Arial,sans-serif" letter-spacing="-1.5">${escapedName}<tspan fill="${theme.brand.accent}">.</tspan></text></svg>\n`);
for (const size of [16,32,48,64,128,180,192,256,512,1024]) {
 const renderer = new Resvg(mark(theme.brand.accent), {fitTo:{mode:'width',value:size}});
 publish(`assets/brand/icon-${size}.png`, renderer.render().asPng());
}
 const sizes=[16,32,48,256];const buffers=sizes.map(size=>readFileSync(`assets/brand/icon-${size}.png`));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,index)=>{const at=6+16*index;header[at]=size===256?0:size;header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(buffers[index].length,at+8);header.writeUInt32LE(offset,at+12);offset+=buffers[index].length;});
 publish('assets/brand/favicon.ico',Buffer.concat([header,...buffers]));

console.log('Generated Unicore vector, app icons, touch icons and multi-size ICO.');
