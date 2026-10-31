/** Author: yunnuo <ymz@ebox.vip>
 * Description: Compiled identity fallback and theme-aware runtime instance identity for every shared page.
 */
import { t, useLocale } from './i18n';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Branding } from '@unicore/sdk';
import theme from '../../../assets/theme/resolved.gen.json';
import identity from '../../../assets/brand/identity.json';
const BrandContext = createContext<Branding | undefined>(undefined);
export function BrandProvider({ branding, name, children }: { branding?: Branding; name?: string; children: ReactNode }) {
  useLocale();
  useEffect(() => {
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="apple-touch-icon"]')];
    const originals = links.map(link => ({ link, href: link.getAttribute('href')!, type: link.getAttribute('type') }));
    if (branding?.favicon) for (const link of links) { link.href = branding.favicon; link.type = 'image/png'; }
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]'); const originalManifest = manifest?.getAttribute('href');
    if (manifest && branding?.favicon?.startsWith('/')) manifest.href = `/site.webmanifest?brand=${encodeURIComponent(branding.favicon.split('/').at(-1) ?? '')}&name=${encodeURIComponent(name ?? '')}`;
    return () => { for (const { link, href, type } of originals) { link.setAttribute('href', href); if (type) link.type = type; else link.removeAttribute('type'); } if (manifest && originalManifest) manifest.href = originalManifest; };
  }, [branding?.favicon, name]);
  return <BrandContext.Provider value={branding}>{children}</BrandContext.Provider>;
}
export function DefaultBrandMark({ size = 36 }: { size?: number }) {
  useLocale();
  return <svg width={size} height={size} viewBox={identity.viewBox} aria-hidden="true" className="brand-vector"><rect width="64" height="64" rx="17" fill="var(--brand-accent)" /><path d={identity.uPath} fill="white" /><path d={identity.corePath} fill="white" /></svg>;
}
function BrandImage({ src, size }: { src: string; size: number }) {
  useLocale();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? <DefaultBrandMark size={size} /> : <img className="brand-image" width={size} height={size} src={src} alt="" onError={() => setFailed(true)} />;
}
export function BrandMark({ size = 36 }: { size?: number }) {
  useLocale();
  const branding = useContext(BrandContext);
  if (!branding?.logo && !branding?.logo_dark) return <DefaultBrandMark size={size} />;
  return <span className="instance-brand" style={{ width: size, height: size }} aria-hidden="true"><span className="instance-brand-light">{branding.logo ? <BrandImage src={branding.logo} size={size} /> : <DefaultBrandMark size={size} />}</span><span className="instance-brand-dark">{branding.logo_dark || branding.logo ? <BrandImage src={branding.logo_dark || branding.logo} size={size} /> : <DefaultBrandMark size={size} />}</span></span>;
}
export function BrandLockup({ name = theme.brand.name }: { name?: string }) {
  useLocale();
  return <><BrandMark /><strong className="brand-name">{name}<span className="brand-dot">.</span></strong></>;
}
