/** Author: yunnuo <ymz@ebox.vip>
 * Description: Customer order page: the server returns only the caller's own orders.
 */
import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import type { OrderEntry } from '@unicore/sdk';
import { Badge, Button, EmptyState } from '@unicore/ui';
import { defineMessages, useI18n } from '../../i18n';
import type { PageProps } from '../../router';

const statusLabel: Record<string, string> = /* @__PURE__ */ defineMessages({ open: '待处理', processing: '处理中', done: '已完成', cancelled: '已取消' });

export function statusText(t: (value: string) => string, status: string) {
  return t(statusLabel[status] ?? status);
}

export function OrderStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone = status === 'done' ? 'success' : status === 'cancelled' ? 'muted' : status === 'processing' ? 'primary' : 'warning';
  return <Badge tone={tone as 'success' | 'muted' | 'primary' | 'warning'}>{statusText(t, status)}</Badge>;
}

export function OrdersPage({ client }: PageProps) {
  const { t } = useI18n();
  const list = useQuery({ queryKey: ['orders'], queryFn: () => client.listOrders(1), placeholderData: keepPreviousData });
  const items: OrderEntry[] = list.data?.items ?? [];
  return <section className="flex flex-col gap-4" aria-label={t('我的订单')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-md font-semibold text-ink">{t('我的订单')}</h2>
        <p className="text-xs text-muted">{t('服务端只返回本人名下的订单，状态由代理或运营推进。')}</p>
      </div>
    </div>
    {items.length === 0 && !list.isPending
      ? <EmptyState title={t('还没有订单')} detail={t('下单后订单会出现在这里。')} />
      : <ul className="flex flex-col gap-2">
          {items.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{order.title}</p>
              <p className="text-xs text-muted">{t('金额')} ¥{(order.amount_cents / 100).toFixed(2)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </li>)}
        </ul>}
    {list.data && list.data.total > items.length && <p className="text-xs text-muted">{t('仅显示第一页 {{count}} 条', { count: items.length })}</p>}
    <Button variant="ghost" onClick={() => void list.refetch()}>{t('刷新')}</Button>
  </section>;
}
