/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared public site identity and optional ICP link on workspace and account pages.
 */
import type { Bootstrap } from '@unicore/sdk';

export function SiteFooter({ metadata, compact = false }: { metadata?: Bootstrap; compact?: boolean }) {
  let link = '';
  try {
    const url = new URL(metadata?.site_icp_url ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) link = url.href;
  } catch { /* Empty or legacy invalid links render as plain text. */ }
  return <footer className={compact ? 'site-footer flow-site-footer' : 'site-footer'}>
    <div className="site-footer-identity"><span>© {new Date().getFullYear()} {metadata?.site_name ?? 'Unicore'} · {metadata?.site_copyright ?? 'Crafted by yunnuo'}</span>
      {metadata?.site_icp_number && (link ? <a href={link} target="_blank" rel="noopener noreferrer">{metadata.site_icp_number}</a> : <span>{metadata.site_icp_number}</span>)}
    </div><span>Go + React <span className="footer-dot">·</span> {metadata?.version ? `v${metadata.version}` : '工作空间'}</span>
  </footer>;
}
