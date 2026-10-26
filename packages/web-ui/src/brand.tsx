/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared theme-aware vector identity from canonical brand geometry.
 */
import theme from '../../../assets/theme/resolved.gen.json';
import identity from '../../../assets/brand/identity.json';
export function BrandMark({ size = 36 }: { size?: number }) {
  return <svg width={size} height={size} viewBox={identity.viewBox} aria-hidden="true" className="brand-vector"><rect width="64" height="64" rx="17" fill="var(--brand-accent)" /><path d={identity.uPath} fill="white" /><path d={identity.corePath} fill="white" /></svg>;
}
export function BrandLockup({ name = theme.brand.name }: { name?: string }) {
  return <><BrandMark /><strong className="brand-name">{name}<span className="brand-dot">.</span></strong></>;
}
