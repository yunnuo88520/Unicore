// Author: yunnuo <ymz@ebox.vip>
// Description: Shared accent→token derivation used by scripts/generate-theme.mjs (build time)
// and the runtime theme applier, so a custom accent can never drift from the generated palette.

const mix = (a, b, amount) => '#' + [0, 1, 2].map(i => Math.round(parseInt(a.slice(1 + i * 2, 3 + i * 2), 16) * (1 - amount) + parseInt(b.slice(1 + i * 2, 3 + i * 2), 16) * amount).toString(16).padStart(2, '0')).join('');
const opacity = (hex, alpha) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
const luminance = color => [.2126, .7152, .0722].reduce((sum, w, i) => { const c = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) / 255; return sum + w * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) }, 0);

/** CSS custom properties whose value depends on the brand accent (per light/dark mode). */
export const accentVariables = ['primary', 'primary-soft', 'brand-accent', 'brand-highlight', 'on-primary', 'button-primary', 'button-hover', 'primary-border', 'primary-shadow', 'focus', 'banner-start', 'banner-end', 'banner-text', 'banner-muted', 'glass', 'button-gradient-from', 'button-gradient-to', 'button-gradient-hover-from', 'button-gradient-hover-to', 'button-gradient-active-from', 'button-gradient-active-to'];

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
    // Shadow keys stay pure black in both modes; dark mode raises the alpha instead.
    // Legacy shadow-tint/modal remain colors: shell CSS composes them into its own shadows.
    const key = '#000000';
    const elevations = {
      'elevation-control': `0 1px 2px ${opacity(key, dark ? .12 : .06)}, 0 1px 3px ${opacity(key, dark ? .16 : .10)}`,
      'elevation-card': `0 2px 4px -1px ${opacity(key, dark ? .12 : .06)}, 0 4px 6px -1px ${opacity(key, dark ? .18 : .10)}`,
      'elevation-floating': `0 1px 1px ${opacity(key, dark ? .14 : .04)}, 0 4px 6px -1px ${opacity(key, dark ? .10 : .05)}, 0 12px 24px ${opacity(key, dark ? .16 : .08)}`,
      'elevation-overlay': `0 10px 10px -5px ${opacity(key, dark ? .08 : .04)}, 0 20px 25px -5px ${opacity(key, dark ? .20 : .10)}`,
    };
    // The primary CTA carries a 180° two-stop gradient; hover lightens via a
    // ::before opacity fade, active steps both stops darker. Dark mode keeps
    // the same ramp (only the disabled treatment differs, handled by opacity).
    const gradients = {
      'button-gradient-from': accent,
      'button-gradient-to': mix(accent, '#000000', .12),
      'button-gradient-hover-from': mix(accent, '#ffffff', .08),
      'button-gradient-hover-to': accent,
      'button-gradient-active-from': mix(accent, '#000000', .04),
      'button-gradient-active-to': mix(accent, '#000000', .18),
    };
    resolved[mode] = { ...base, ...elevations, ...gradients, primary, 'primary-soft': mix(accent, base.surface, dark ? .80 : .90), 'brand-accent': dark ? mix(accent, '#ffffff', .12) : accent, 'brand-highlight': mix(accent, '#ffffff', .18), 'on-primary': onPrimary, 'button-primary': accent, 'button-hover': mix(accent, '#000000', .13), 'primary-border': opacity(primary, dark ? .24 : .20), 'primary-shadow': opacity(accent, .13), focus: accent, green: base.success, subtle: mix(base.muted, base.surface, .45), 'success-soft': opacity(base.success, .09), 'success-border': opacity(base.success, .24), 'danger-soft': opacity(base.danger, .08), 'danger-border': opacity(base.danger, .24), 'info-soft': opacity(base.info, .10), 'info-border': opacity(base.info, .24), 'warning-soft': opacity(base.warning, .10), 'warning-border': opacity(base.warning, .24), 'banner-start': mix(accent, base.surface, dark ? .84 : .88), 'banner-end': mix(accent, base.bg, dark ? .78 : .82), 'banner-text': dark ? mix(accent, '#ffffff', .82) : mix(accent, base.text, .62), 'banner-muted': dark ? mix(accent, base.muted, .80) : mix(accent, base.muted, .68), glass: dark ? opacity(primary, .08) : '#ffffff99', scrim: '#0c102477', 'shadow-tint': opacity(key, dark ? .18 : .035), 'shadow-modal': opacity(key, dark ? .40 : .19), shadow: elevations['elevation-card'] };
  }
  return resolved;
}
