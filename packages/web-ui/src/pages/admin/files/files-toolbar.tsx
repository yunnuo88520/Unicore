// Author: yunnuo <ymz@ebox.vip>
// Description: Catalog filter selects and the table/grid view switch, hosted by the shared DataTableToolbar slots.
import { LayoutGrid, Table2 } from 'lucide-react';
import type { StorageLocation } from '@unicore/sdk';
import { Button, SimpleSelect, selectOptions } from '@unicore/ui';
import { t } from '../../../i18n';

export function FilesFilters({ locationID, onLocation, purpose, onPurpose, type, onType, locations }: {
  locationID: string; onLocation: (value: string) => void;
  purpose: string; onPurpose: (value: string) => void;
  type: string; onType: (value: string) => void;
  locations: StorageLocation[] | undefined;
}) {
  return <>
    <SimpleSelect aria-label={t('存储位置筛选')} value={locationID} onChange={onLocation} presentation="dropdown" className="w-36" options={selectOptions(<>
      <option value="">{t('全部存储位置')}</option>
      <option value="legacy-brand">{t('旧品牌存储')}</option>
      {(locations ?? []).map(item => <option key={item.id} value={item.id}>{item.name || item.provider}</option>)}
    </>)} />
    <SimpleSelect aria-label={t('业务用途筛选')} value={purpose} onChange={onPurpose} presentation="dropdown" className="w-32" options={selectOptions(<>
      <option value="">{t('全部用途')}</option>
      <option value="user">{t('业务文件')}</option>
      <option value="branding">{t('品牌资源')}</option>
    </>)} />
    <SimpleSelect aria-label={t('文件类型筛选')} value={type} onChange={onType} presentation="dropdown" className="w-32" options={selectOptions(<>
      <option value="">{t('全部类型')}</option>
      <option value="image">{t('图片')}</option>
      <option value="document">{t('文档')}</option>
      <option value="archive">{t('压缩包')}</option>
      <option value="other">{t('其他')}</option>
    </>)} />
  </>;
}

export function FilesViewSwitch({ view, onView }: { view: 'table' | 'grid'; onView: (value: 'table' | 'grid') => void }) {
  return <span className="flex items-center gap-1 rounded-lg border border-line p-0.5" role="group" aria-label={t('视图切换')}>
    <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="sm" aria-pressed={view === 'table'} aria-label={t('表格视图')} onClick={() => onView('table')}><Table2 size={14} />{t('表格')}</Button>
    <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="sm" aria-pressed={view === 'grid'} aria-label={t('网格视图')} onClick={() => onView('grid')}><LayoutGrid size={14} />{t('网格')}</Button>
  </span>;
}
