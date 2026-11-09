// Author: yunnuo <ymz@ebox.vip>
// Description: Shared status-page family (403/404/500/503) following the shadcn-admin error layout: an oversized code, one-line title, muted detail and an action row.
import type { ReactNode } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Button } from '@unicore/ui';
import { t } from '../i18n';
import { ClientControls } from '../client-controls';

/** Centered status page. Standalone pages own the viewport and carry the floating client controls. */
export function ErrorPage({ code, title, detail, standalone = false, children }: {
  code: string; title: string; detail: ReactNode; standalone?: boolean; children?: ReactNode;
}) {
  return <div role="alert" className={standalone
    ? 'flex h-svh w-full flex-col items-center justify-center bg-background px-4'
    : 'flex min-h-[60vh] w-full flex-col items-center justify-center px-4 py-16'}>
    {standalone && <div className="fixed top-[15px] end-[20px] z-[45] rounded-lg border border-line bg-surface px-2 py-[5px] shadow-tint"><ClientControls /></div>}
    <div aria-hidden="true" className="text-[7rem] font-bold leading-tight tracking-tight text-ink">{code}</div>
    <h1 className="font-medium text-ink">{title}</h1>
    <p className="max-w-md text-center text-sm text-muted">{detail}</p>
    {children && <div className="mt-6 flex flex-wrap justify-center gap-4">{children}</div>}
  </div>;
}

export function GoBackButton() {
  const { history } = useRouter();
  return <Button variant="secondary" onClick={() => history.go(-1)}>{t('返回上一页')}</Button>;
}

export function HomeButton() {
  const navigate = useNavigate();
  return <Button onClick={() => void navigate({ to: '/' })}>{t('返回工作台')}</Button>;
}

/** Rendered by the router for any page-level render failure. */
export function ServerErrorPage() {
  return <ErrorPage code="500" title={t('服务器出错了')} detail={<>{t('抱歉给你带来不便，请稍后重试。')}</>}>
    <GoBackButton />
    <HomeButton />
  </ErrorPage>;
}
