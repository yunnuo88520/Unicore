/** Author: yunnuo <ymz@ebox.vip>
 * Description: Compiled identity fallback and theme-aware runtime instance identity for every shared page.
 */
import { t, useLocale } from './i18n';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Branding } from '@unicore/sdk';
import { useResolvedTheme } from '@unicore/theme';
import theme from '../../../assets/theme/resolved.gen.json';
import identity from '../../../assets/brand/identity.json';
const BrandContext = createContext<{ branding?: Branding; name?: string }>({});
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
  return <BrandContext.Provider value={{ branding, name }}>{children}</BrandContext.Provider>;
}
export function DefaultBrandMark({ size = 36 }: { size?: number }) {
  useLocale();
  return <svg width={size} height={size} viewBox={identity.viewBox} aria-hidden="true" className="brand-vector"><rect width="64" height="64" rx="17" fill="var(--brand-accent)" /><path d={identity.uPath} fill="white" /><path d={identity.corePath} fill="white" /></svg>;
}
function BrandImage({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? fallback : <img className="brand-image" src={src} alt="" onError={() => setFailed(true)} />;
}
type BrandProps = { branding?: Branding; name?: string; appearance?: 'light' | 'dark'; size?: number; maxWidth?: number; compact?: boolean };

function InitialMark({ name, size }: { name: string; size: number }) {
  return <span className="flex shrink-0 items-center justify-center rounded-md bg-accent text-on-primary font-medium" style={{ width: size, height: size, fontSize: size * 0.55 }}>{Array.from(name.trim())[0]?.toLocaleUpperCase() || 'U'}</span>;
}

/** A bounded logo slot: icons stay square, full logos use their natural width. */
export function BrandMark({ size = 36, maxWidth = size, branding: override, name, appearance, compact = false }: BrandProps) {
  useLocale();
  const context = useContext(BrandContext);
  const resolved = useResolvedTheme();
  const branding = override ?? context.branding;
  const mode = appearance ?? resolved;
  const custom = !!(branding?.logo || branding?.logo_dark || branding?.favicon);
  const logo = mode === 'dark' ? branding?.logo_dark || branding?.logo : branding?.logo;
  // Compact slots represent the app icon: the configured favicon or the
  // compiled mark. A letter tile would impersonate the default mark, and
  // shrinking a custom wordmark stays unreadable, so neither appears here.
  const src = compact ? branding?.favicon : logo || branding?.favicon;
  const fallback = custom && !compact ? <InitialMark name={name ?? context.name ?? theme.brand.name} size={size} /> : <DefaultBrandMark size={size} />;
  const fullLogo = !compact && !!logo && maxWidth > size;
  const style = { height: size, '--brand-logo-size': `${size}px`, '--brand-logo-max-width': `${fullLogo ? maxWidth : size}px` } as CSSProperties;
  return <span className={`instance-brand brand-logo ${fullLogo ? 'logo-mode-text' : 'logo-mode-icon'}`} style={style} aria-hidden="true"><span className={`instance-brand-${mode}`}>{src ? <BrandImage key={src} src={src} fallback={fallback} /> : fallback}</span></span>;
}

/** Explicit logo/title slots protect the title from arbitrary uploaded image geometry.
 * The maxWidth budget bounds the logo only; the title shares the consumer's
 * container instead of the logo budget, so roomy surfaces render full names. */
export function BrandLockup({ name, maxWidth = 180, size = 36, branding: override, appearance, compact = false }: BrandProps) {
  useLocale();
  const context = useContext(BrandContext);
  const resolved = useResolvedTheme();
  const branding = override ?? context.branding;
  const label = name ?? context.name ?? theme.brand.name;
  const mode = appearance ?? resolved;
  const logo = mode === 'dark' ? branding?.logo_dark || branding?.logo : branding?.logo;
  if (compact) return <span className="brand inline-flex shrink-0" data-brand-layout="compact" title={label}><BrandMark size={size} branding={branding} name={label} appearance={mode} compact /></span>;
  const wordmark = branding?.display_mode === 'wordmark' && !!logo;
  const fallback = <span className="brand-name min-w-0 truncate font-medium">{label}</span>;
  const logoWidth = Math.min(120, maxWidth);
  return <span className="brand flex min-w-0 items-center gap-2" data-brand-layout={wordmark ? 'wordmark' : 'icon-title'} style={{ width: wordmark ? 'auto' : '100%' }} title={label}>
    {wordmark ? <span className="instance-brand brand-logo logo-mode-text" style={{ height: size, '--brand-logo-size': `${size}px`, '--brand-logo-max-width': `${logoWidth}px` } as CSSProperties} role="img" aria-label={label}><span className={`instance-brand-${mode}`}><BrandImage key={logo} src={logo} fallback={fallback} /></span></span>
      : <><BrandMark size={size} maxWidth={logoWidth} branding={branding} name={label} appearance={mode} /><strong className="brand-name min-w-0 flex-1 truncate font-medium">{label}</strong></>}
  </span>;
}
