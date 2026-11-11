// Author: yunnuo <ymz@ebox.vip>
// Description: 403 for signed-in accounts without the page permission; server authorization stays authoritative.
import { ErrorPage, GoBackButton, HomeButton } from './error';
import { useI18n } from '../i18n';

export function ForbiddenPage() {
  const { t } = useI18n();
  return <ErrorPage standalone code="403" title={t('没有访问权限')} detail={<>{t('此页面需要相应权限，请联系实例管理员。')}</>}>
    <GoBackButton />
    <HomeButton />
  </ErrorPage>;
}
