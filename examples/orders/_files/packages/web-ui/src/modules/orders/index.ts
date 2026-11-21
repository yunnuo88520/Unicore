/** Author: yunnuo <ymz@ebox.vip>
 * Description: Orders module contribution: the customer page joins the shared registries; the agent and operations consoles register from consoles.tsx.
 */
import { ShoppingCart } from 'lucide-react';
import { defineMessages } from '../../i18n';
import { registerUiModule, type UiModule } from '../../module-registry';

const routes = /* @__PURE__ */ defineMessages({
  orders: { label: '我的订单', title: '我的订单', description: '查看本人订单与当前状态。', permission: 'orders:access', icon: ShoppingCart, database: true, surfaces: ['user'] as ['user'] },
});

const orders: UiModule<typeof routes> = {
  slug: 'orders',
  routes,
  order: ['orders'],
  icons: { orders: 'ShoppingCart' },
};

registerUiModule(orders);

export { orders };
