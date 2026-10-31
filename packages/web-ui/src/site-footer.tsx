// Author: yunnuo <ymz@ebox.vip>
// Description: Shared public site identity and optional ICP link on workspace and account pages.
import { t, useLocale } from './i18n';
import { cn } from './lib/cn';
import type { Bootstrap } from '@unicore/sdk';

export function SiteFooter({ metadata, compact = false }: { metadata?: Bootstrap; compact?: boolean }) {
  useLocale();
  let link = '';
  try {
    const url = new URL(metadata?.site_icp_url ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) link = url.href;
  } catch { /* Empty or legacy invalid links render as plain text. */ }
  return <footer className={cn('flex flex-wrap items-center justify-between gap-2.5 px-1 py-6 text-2xs text-subtle', compact && 'justify-center py-5 text-center')}>
    <div className="flex flex-wrap items-center gap-2.5" dir="ltr">
      <span>© {new Date().getFullYear()} {metadata?.site_name ?? 'Unicore'} · {metadata?.site_copyright ?? 'Crafted by yunnuo'}</span>
      {metadata?.site_icp_number && (link
        ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 transition-colors hover:text-muted">{metadata.site_icp_number}</a>
        : <span>{metadata.site_icp_number}</span>)}
    </div>
    <span className="flex items-center gap-1.5">Go + React <span aria-hidden="true" className="text-line">·</span> {metadata?.version ? `v${metadata.version}` : t('工作空间')}</span>
  </footer>;
}
