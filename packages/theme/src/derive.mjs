// Author: yunnuo <ymz@ebox.vip>
// Description: Shared accent→token derivation used by scripts/generate-theme.mjs (build time)
// and the runtime theme applier, so a custom accent can never drift from the generated palette.

const mix = (a, b, amount) => '#' + [0, 1, 2].map(i => Math.round(parseInt(a.slice(1 + i * 2, 3 + i * 2), 16) * (1 - amount) + parseInt(b.slice(1 + i * 2, 3 + i * 2), 16) * amount).toString(16).padStart(2, '0')).join('');
const opacity = (hex, alpha) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
const luminance = color => [.2126, .7152, .0722].reduce((sum, w, i) => { const c = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) / 255; return sum + w * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) }, 0);

/** CSS custom properties whose value depends on the brand accent (per light/dark mode). */
export const accentVariables = ['primary', 'primary-soft', 'brand-accent', 'brand-highlight', 'on-primary', 'button-primary', 'button-hover', 'primary-border', 'primary-shadow', 'focus', 'banner-start', 'banner-end', 'banner-text', 'banner-muted', 'glass'];

/**
 * Derive the complete light/dark variable maps for one accent color.
 * @param {string} accent #RRGGBB brand accent.
 * @param {{light: object<string,string>, dark: object<string,string>}} modes mode base palettes from assets/theme/tokens.json.
 * @returns {{light: object<string,string>, dark: object<string,string>}} variables including the mode base passthroughs.
 */
export function derivePalette(accent, modes) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('accent must be #RRGGBB');
  const onPrimary = luminance(accent) > .179 ? '#111111' : '#ffffff';
  const resolved = { light: {}, dark: {} };
  for (const mode of ['light', 'dark']) {
    const dark = mode === 'dark', base = modes[mode];
    const primary = dark ? mix(accent, '#ffffff', .43) : accent;
    resolved[mode] = { ...base, primary, 'primary-soft': mix(accent, base.surface, dark ? .80 : .90), 'brand-accent': dark ? mix(accent, '#ffffff', .12) : accent, 'brand-highlight': mix(accent, '#ffffff', .18), 'on-primary': onPrimary, 'button-primary': accent, 'button-hover': mix(accent, '#000000', .13), 'primary-border': opacity(primary, dark ? .24 : .20), 'primary-shadow': opacity(accent, .13), focus: mix(primary, '#ffffff', .20), green: base.success, subtle: mix(base.muted, base.surface, .45), 'success-soft': opacity(base.success, .09), 'success-border': opacity(base.success, .24), 'danger-soft': opacity(base.danger, .08), 'danger-border': opacity(base.danger, .24), 'info-soft': opacity(base.info, .10), 'info-border': opacity(base.info, .24), 'warning-soft': opacity(base.warning, .10), 'warning-border': opacity(base.warning, .24), 'banner-start': mix(accent, base.surface, dark ? .84 : .88), 'banner-end': mix(accent, base.bg, dark ? .78 : .82), 'banner-text': dark ? mix(accent, '#ffffff', .82) : mix(accent, base.text, .62), 'banner-muted': dark ? mix(accent, base.muted, .80) : mix(accent, base.muted, .68), glass: dark ? opacity(primary, .08) : '#ffffff99', scrim: '#0c102477', 'shadow-tint': opacity(base.text, .035), 'shadow-modal': opacity(base.text, .19), shadow: dark ? 'none' : '0 2px 5px ' + opacity(base.text, .025) };
  }
  return resolved;
}
