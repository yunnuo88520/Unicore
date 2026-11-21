/** Author: yunnuo <ymz@ebox.vip>
 * Description: Managed order list shared by the agent and operations consoles: the detail renders from the URL sub-route.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import type { AppClient, Bootstrap, OrderEntry } from '@unicore/sdk';
import { Button, EmptyState } from '@unicore/ui';
import { useI18n } from '../../i18n';
import { consolePageHref } from '../../console-registry';
import { statusText, OrderStatusBadge } from './orders';

function StatusActions({ order, client, refresh }: { order: OrderEntry; client: AppClient; refresh: () => void }) {
  const { t } = useI18n();
  const next: { status: string; label: string; tone: 'primary' | 'success' | 'danger' }[] = [];
  if (order.status === 'open') next.push({ status: 'processing', label: t('开始处理'), tone: 'primary' });
  if (order.status === 'open' || order.status === 'processing') {
    next.push({ status: 'done', label: t('标记完成'), tone: 'success' });
    next.push({ status: 'cancelled', label: t('取消订单'), tone: 'danger' });
  }
  const move = useMutation({
    mutationFn: (status: string) => client.updateOrderStatus(order.id, { status, version: order.version }),
    onSuccess: refresh,
  });
  if (!next.length) return null;
  return <div className="flex flex-wrap gap-2">
    {next.map(item => <Button key={item.status} variant={item.tone === 'danger' ? 'secondary' : 'primary'} disabled={move.isPending}
      onClick={() => move.mutate(item.status)}>{item.label}</Button>)}
  </div>;
}

function Detail({ client, metadata, id, onBack }: { client: AppClient; metadata: Bootstrap; id: string; onBack: () => void }) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const detail = useQuery({ queryKey: ['managed-order', id], queryFn: () => client.readOrder(id) });
  if (detail.isPending) return <p role="status">{t('正在加载订单…')}</p>;
  if (detail.isError) return <EmptyState title={t('订单不可见')} detail={t('订单不存在或不在你的授权范围内。')} action={<Button onClick={onBack}>{t('返回列表')}</Button>} />;
  const order = detail.data;
  const refresh = () => { void cache.invalidateQueries({ queryKey: ['managed-order', id] }); void cache.invalidateQueries({ queryKey: ['managed-orders'] }); };
  return <div className="flex flex-col gap-3">
    <Button variant="ghost" onClick={onBack}>{t('返回列表')}</Button>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{order.title}</h3>
        <p className="text-xs text-muted">{t('金额')} ¥{(order.amount_cents / 100).toFixed(2)}</p>
      </div>
      <OrderStatusBadge status={order.status} />
    </div>
    <p className="text-xs text-muted">{t('客户')}: {order.owner_id}{order.agent_id ? ` · ${t('代理')}: ${order.agent_id}` : ''}</p>
    <StatusActions order={order} client={client} refresh={refresh} />
    <p className="sr-only">{t('会话身份')}: {metadata.current_user?.username}</p>
  </div>;
}

// The agent and operations consoles mount this page with their own shells;
// both read the same server-resolved managed list and never receive more
// than the caller's authorization allows.
export function ManagedOrdersPage({ client, metadata, path }: { client: AppClient; metadata: Bootstrap; path: readonly string[] }) {
  const { t } = useI18n();
  const list = useQuery({ queryKey: ['managed-orders'], queryFn: () => client.listManagedOrders(1), placeholderData: keepPreviousData });
  const items: OrderEntry[] = list.data?.items ?? [];
  if (path.length > 0) return <Detail client={client} metadata={metadata} id={path[0]} onBack={() => { window.location.assign(consolePageHref('agent', 'orders')); }} />;
  return <section className="flex flex-col gap-4" aria-label={t('订单处理')}>
    <h2 className="text-md font-semibold text-ink">{t('订单处理')}</h2>
    <p className="text-xs text-muted">{t('列表由服务端按代理归属与授权范围解析，篡改订单地址只会得到 404。')}</p>
    {items.length === 0 && !list.isPending
      ? <EmptyState title={t('暂无待处理订单')} detail={t('被授权或分配给你的订单会出现在这里。')} />
      : <ul className="flex flex-col gap-2">
          {items.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <a className="min-w-0 flex-1" href={consolePageHref('agent', 'orders', order.id)}>
              <p className="truncate text-sm font-medium text-ink">{order.title}</p>
              <p className="text-xs text-muted">{statusText(t, order.status)} · {t('金额')} ¥{(order.amount_cents / 100).toFixed(2)}</p>
            </a>
            <OrderStatusBadge status={order.status} />
          </li>)}
        </ul>}
  </section>;
}
