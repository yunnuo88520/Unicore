// Author: yunnuo <ymz@ebox.vip>
// Description: Single structural shell for Web and Wails; pages supply content without owning navigation offsets.
// Geometry variants (data-layout/sidebar) live in shell.css; all visuals are Tailwind utilities.
import { useEffect, type ReactNode } from 'react';
import { useI18n } from './i18n';
import './shell.css';

type WorkspaceLayoutProps = {
  navigation: ReactNode; header: ReactNode; children: ReactNode; overlays?: ReactNode;
  navigationOpen: boolean; onNavigationClose: () => void; contentClassName?: string; navigationCollapsed?: boolean;
};
export function WorkspaceLayout({ navigation, header, children, overlays, navigationOpen, onNavigationClose, contentClassName = '', navigationCollapsed = false }: WorkspaceLayoutProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!navigationOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onNavigationClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [navigationOpen, onNavigationClose]);
  return <div className={`app-shell ${navigationCollapsed ? 'nav-collapsed' : ''}`} dir="ltr">
    <a className="fixed top-[-100px] start-5 z-50 rounded-sm border-2 border-primary bg-surface px-2.5 py-2.5 text-sm focus:top-3" href="#main-content"
      onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>
      {t('跳至主要内容')}
    </a>
    {navigationOpen && <button className="nav-scrim fixed inset-0 z-[29] bg-scrim/80 backdrop-blur-[2px]" aria-label={t('关闭导航')} onClick={onNavigationClose} />}
    <aside id="workspace-navigation" className={`sidebar z-30 flex flex-col overflow-hidden border-e border-line bg-surface px-[19px] pt-[24px] ${navigationOpen ? 'is-open' : ''}`} aria-label={t('主导航')}>
      {navigation}
    </aside>
    <div className="main-shell min-w-0 w-full">
      <header className="topbar sticky top-0 z-20 flex h-[76px] min-w-0 items-center justify-between border-b border-line bg-surface px-[38px] max-md:h-[65px] max-md:px-[22px]">{header}</header>
      <main id="main-content" tabIndex={-1} className={`main-content mx-auto w-full min-w-0 pt-9 px-[38px] pb-10 outline-none max-md:px-[22px] ${contentClassName}`}>{children}</main>
    </div>
    {overlays}
  </div>;
}
