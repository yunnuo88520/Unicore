// Author: yunnuo <ymz@ebox.vip>
// Description: Shared public site identity and optional ICP link on workspace and account pages.
import { RichContent } from './rich-content';
import { cn } from '@unicore/ui/cn';
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
  return <footer className={cn('mt-auto flex w-full min-w-0 flex-col items-center gap-1 px-4 py-3 text-center text-xs text-muted', compact && 'py-4')}>
    <div className="w-full min-w-0 [overflow-wrap:anywhere]" dir="ltr">
      © {new Date().getFullYear()} {metadata?.site_name ?? productName}{credit && ` · ${credit}`}
    </div>
    {(metadata?.site_icp_number || metadata?.site_police_number) && <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 [overflow-wrap:anywhere]" dir="ltr">
      {metadata?.site_icp_number && (link
        ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 transition-colors hover:text-muted">{metadata.site_icp_number}</a>
        : <span>{metadata.site_icp_number}</span>)}
      {metadata?.site_police_number && <span>{metadata.site_police_number}</span>}
    </div>}
    {metadata?.site_footer_html && <div className="w-full min-w-0 break-words text-center [overflow-wrap:anywhere]"><RichContent html={metadata.site_footer_html} /></div>}
  </footer>;
}
