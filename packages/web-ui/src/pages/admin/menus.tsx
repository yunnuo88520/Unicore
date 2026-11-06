// Author: yunnuo <ymz@ebox.vip>
// Description: Workspace navigation editor: per-page label overrides, grouping, ordering and visibility saved as one table.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import type { MenuEntry, MenuList, WebClient } from '@unicore/sdk';
import { menuDestinations } from '../../navigation';
import { routes, type Page } from '../../routes';
import { t, useLocale } from '../../i18n';
import { Button, Card, CardContent, Input, NativeSelect, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import type { PageProps } from '../../router';

const PAGES = (Object.keys(routes) as Page[]).filter(page => page !== 'not-found');
const COLUMN_COUNT = 5;
const DEFAULT_SORT = 100;

type Draft = Record<string, MenuEntry>;

// Empty label / group_key mean "keep the route default"; sort mirrors the
// navigation fallback so unconfigured pages submit their effective placement.
const defaultGroup = (page: Page) => ('group' in routes[page] ? (routes[page].group as string) : '');

function mergeDraft(items: MenuEntry[]): Draft {
  const configured = new Map(items.map(entry => [entry.menu_key, entry]));
  const draft: Draft = {};
  for (const page of PAGES) {
    const entry = configured.get(page);
    draft[page] = {
      menu_key: page,
      label: entry?.label ?? '',
      group_key: entry?.group_key ?? defaultGroup(page),
      sort: entry?.sort ?? DEFAULT_SORT,
      visible: entry?.visible ?? true,
    };
  }
  return draft;
}

export function AdminMenusPage({ client }: PageProps) {
  if (!client.web) return null;
  return <MenuPanel web={client.web} />;
}

function MenuPanel({ web }: { web: WebClient }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<Draft>({});
  const config = useQuery<MenuList>({ queryKey: ['menu-config'], queryFn: () => web.menuConfig() });
  useEffect(() => { if (config.data) setDraft(mergeDraft(config.data.items)); }, [config.data]);
  const save = useMutation({
    mutationFn: (items: MenuEntry[]) => web.saveMenuConfig({ items }),
    onSuccess: () => {
      message.success(t('菜单配置已保存'));
      void cache.invalidateQueries({ queryKey: ['menu-config'] });
      // Navigation derives from bootstrap.menus; refresh it so the workspace picks up the new layout.
      void cache.invalidateQueries({ queryKey: ['bootstrap'] });
    },
    onError: error => message.error(t(error.message)),
  });
  const update = (page: Page, patch: Partial<MenuEntry>) => setDraft(current => ({ ...current, [page]: { ...current[page], ...patch } }));
  const groupOptions = [
    { value: '', label: t('默认') },
    ...(['primary', 'files', 'standalone', 'system', 'personal'] as const).map(key => ({ value: key, label: t(menuDestinations[key]) })),
  ];
  const rows = PAGES.flatMap(page => draft[page] ? [{ page, entry: draft[page] }] : []);
  const pending = save.isPending;
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <div>
        <h2 className="text-md font-semibold text-ink">{t('菜单配置')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('这些配置作用于用户端工作空间导航：调整各页面的分组、排序、显示名称与可见性。')}</p>
      </div>
      {config.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        <span>{t(config.error.message)}</span>
        <Button variant="secondary" size="sm" onClick={() => void config.refetch()}><RotateCcw size={13} />{t('重试')}</Button>
      </div>}
      {config.isPending && <p role="status" className="py-6 text-center text-sm text-muted">{t('正在读取菜单配置…')}</p>}
      {config.data && <>
        <div className="rounded-lg border border-line" aria-busy={config.isFetching}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('页面')}</TableHead>
                <TableHead>{t('显示名称')}</TableHead>
                <TableHead>{t('导航分组')}</TableHead>
                <TableHead>{t('排序')}</TableHead>
                <TableHead>{t('可见')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ page, entry }) => <TableRow key={page}>
                <TableCell>
                  <strong className="block font-medium text-ink">{t(routes[page].label)}</strong>
                  <small className="text-2xs text-subtle">{page}</small>
                </TableCell>
                <TableCell>
                  <Input className="h-8 max-w-44" maxLength={80} autoComplete="off" aria-label={t('{{name}}的显示名称', { name: t(routes[page].label) })}
                    placeholder={t('使用默认')} value={entry.label} disabled={pending}
                    onChange={event => update(page, { label: event.target.value })} />
                </TableCell>
                <TableCell>
                  <NativeSelect className="h-8 w-36" aria-label={t('{{name}}的导航分组', { name: t(routes[page].label) })}
                    value={entry.group_key} disabled={pending} onChange={event => update(page, { group_key: event.target.value })}>
                    {groupOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Input className="h-8 w-20" type="number" aria-label={t('{{name}}的排序', { name: t(routes[page].label) })}
                    value={entry.sort} disabled={pending} onChange={event => update(page, { sort: Number(event.target.value) || 0 })} />
                </TableCell>
                <TableCell>
                  <Switch aria-label={t('{{name}}在导航中可见', { name: t(routes[page].label) })}
                    checked={entry.visible} disabled={pending} onChange={value => update(page, { visible: value })} />
                </TableCell>
              </TableRow>)}
              {!rows.length && <TableEmpty colSpan={COLUMN_COUNT}>{t('正在合成页面清单…')}</TableEmpty>}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>{t('显示名称留空使用页面默认名称；分组「默认」保持路由自带位置。保存时全量替换所有页面的配置。')}</span>
          <Button pending={pending} disabled={!rows.length}
            onClick={() => save.mutate(PAGES.map(page => draft[page]).filter(Boolean))}>
            <Save size={14} />{t('保存菜单配置')}
          </Button>
        </div>
      </>}
    </CardContent>
  </Card>;
}
