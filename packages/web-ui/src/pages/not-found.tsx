// Author: yunnuo <ymz@ebox.vip>
// Description: 404 for unregistered paths; rendered inside the signed-in shell or the guest auth layout, so it stays layout-neutral.
import { ErrorPage, GoBackButton, HomeButton } from './error';
import { t } from '../i18n';

export function NotFoundPage() {
  return <ErrorPage standalone code="404" title={t('页面不存在')} detail={<>{t('你要访问的页面不存在，可能已被移动或删除。')}</>}>
    <GoBackButton />
    <HomeButton />
  </ErrorPage>;
}
