// Author: yunnuo <ymz@ebox.vip>
// Description: 403 state for signed-in accounts without the page permission; server authorization stays authoritative.
import { ShieldOff } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useI18n } from '../i18n';
import { Button } from '@unicore/ui';

export function ForbiddenPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-danger-line bg-surface px-6 py-10 text-center shadow-card">
    <ShieldOff size={26} className="text-danger" aria-hidden="true" />
    <strong className="text-md font-semibold text-ink">{t('没有访问权限')}</strong>
    <p className="text-sm text-muted">{t('此页面需要相应权限，请联系实例管理员。')}</p>
    <Button className="mt-2" onClick={() => void navigate({ to: '/' })}>{t('返回工作台')}</Button>
  </div>;
}
