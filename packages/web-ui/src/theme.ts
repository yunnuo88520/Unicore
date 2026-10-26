// Author: yunnuo <ymz@ebox.vip>
// Description: Accessible three-state local theme preference with system updates.
import { useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export function useTheme(defaultTheme?: string) {
  const hasPreference = useRef(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem('unicore.theme'); hasPreference.current = saved === 'light' || saved === 'dark' || saved === 'system'; return saved === 'light' || saved === 'dark' ? saved : 'system'; }
    catch { return 'system'; }
  });
  useEffect(() => { if (!hasPreference.current && (defaultTheme === 'light' || defaultTheme === 'dark' || defaultTheme === 'system')) setTheme(defaultTheme); }, [defaultTheme]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme; };
    apply();
    try { localStorage.setItem('unicore.theme', theme); } catch { /* Restricted webviews can disable storage. */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return [theme, (value: Theme) => { hasPreference.current = true; setTheme(value); }] as const;
}
