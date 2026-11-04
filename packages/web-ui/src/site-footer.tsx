// Author: yunnuo <ymz@ebox.vip>
// Description: Shared public site identity and optional ICP link on workspace and account pages.
import { RichContent } from './rich-content';
import { cn } from './lib/cn';
import { productName } from './product.gen';
import type { Bootstrap } from '@unicore/sdk';

export function SiteFooter({ metadata, compact = false }: { metadata?: Bootstrap; compact?: boolean }) {
  const copyright = metadata?.site_copyright ?? 'Crafted by Yunnuo';
  const credit = copyright === 'Crafted by yunnuo' ? 'Crafted by Yunnuo' : copyright;
  let link = '';
  try {
    const url = new URL(metadata?.site_icp_url ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) link = url.href;
  } catch { /* Empty or legacy invalid links render as plain text. */ }
  return <footer className={cn('flex flex-wrap items-center gap-2.5 px-1 py-6 text-2xs text-subtle', compact && 'justify-center py-5 text-center')}>
    <div className="flex flex-wrap items-center gap-2.5" dir="ltr">
      <span>© {new Date().getFullYear()} {metadata?.site_name ?? productName}{credit && ` · ${credit}`}</span>
      {metadata?.site_icp_number && (link
        ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 transition-colors hover:text-muted">{metadata.site_icp_number}</a>
        : <span>{metadata.site_icp_number}</span>)}
      {metadata?.site_police_number && <span>{metadata.site_police_number}</span>}
    </div>
    {metadata?.site_footer_html && <div className="w-full break-words"><RichContent html={metadata.site_footer_html} /></div>}
  </footer>;
}
