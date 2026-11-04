// Author: yunnuo <ymz@ebox.vip>
// Description: Not-found state rendered by the router for unregistered paths.
import { t } from '../i18n';
import { Info } from 'lucide-react';
import { Button } from '../ui';
import { useNavigate } from '@tanstack/react-router';

export function NotFoundPage() {
  const navigate = useNavigate();
  return <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-card">
    <Info size={26} className="text-muted" aria-hidden="true" />
    <strong className="text-md font-semibold text-ink">{t('找不到这个页面')}</strong>
    <p className="text-sm text-muted">{t('请通过导航进入已有页面。')}</p>
    <Button className="mt-2" onClick={() => void navigate({ to: '/' })}>{t('返回工作台')}</Button>
  </div>;
}
