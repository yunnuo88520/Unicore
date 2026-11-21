/** Author: yunnuo <ymz@ebox.vip>
 * Description: The two acceptance consoles: the agent workbench and the operations workbench share the page set but own different shells.
 */
import { defineConsoles, type ConsolePageProps, type ConsoleShellProps } from '@unicore/web-ui';
import { WorkspaceLayout } from '@unicore/web-ui/layout';
import { defineMessages, useI18n } from '@unicore/web-ui/i18n';
import { ManagedOrdersPage } from '@unicore/web-ui/modules/orders/managed';

function AgentShell({ title, navigation, children }: ConsoleShellProps) {
  const { t } = useI18n();
  return <WorkspaceLayout
    navigation={<aside aria-label={t('代理工作台导航')} className="flex w-56 shrink-0 flex-col gap-1 border-e border-line bg-surface-soft p-3">
      <p className="px-2 pb-2 text-xs font-semibold text-muted">{title}</p>
      {navigation.map(item => <a key={item.href} href={item.href}
        className={'rounded-lg px-2 py-1.5 text-sm ' + (item.active ? 'bg-primary-soft font-medium text-ink' : 'text-muted hover:text-ink')}>{item.label}</a>)}
    </aside>}
    header={<div className="border-b border-line px-4 py-2 text-sm font-medium text-ink">{title}</div>}
  >{children}</WorkspaceLayout>;
}

function OperationsShell({ title, navigation, children }: ConsoleShellProps) {
  const { t } = useI18n();
  // A deliberately different layout: top tabs instead of a sidebar, proving
  // shells are independent while the page and authorization stay shared.
  return <div className="flex min-h-dvh flex-col" aria-label={t('运营工作台')}>
    <header className="border-b border-line bg-surface-soft px-4 py-2">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <nav aria-label={t('运营工作台导航')} className="mt-1 flex gap-3">
        {navigation.map(item => <a key={item.href} href={item.href}
          className={'border-b-2 px-1 pb-1 text-sm ' + (item.active ? 'border-primary font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}>{item.label}</a>)}
      </nav>
    </header>
    <main className="flex-1 p-4">{children}</main>
  </div>;
}

function ManagedPage(props: ConsolePageProps) {
  return <ManagedOrdersPage client={props.client} metadata={props.metadata} path={props.path} />;
}

// Both consoles share the orders:handle entry point and the same page set:
// one permission point may enter several consoles, and the different shells
// prove the layout is presentation only. defineMessages marks the interface
// literals for the bilingual catalog, exactly like module route facts.
export const orderConsoles = defineConsoles(
  /* @__PURE__ */ defineMessages({
    id: 'agent', title: '代理工作台', permission: 'orders:handle', shell: AgentShell, pages: [
      { id: 'orders', label: '订单处理', permission: 'orders:handle', component: ManagedPage },
    ],
  }),
  /* @__PURE__ */ defineMessages({
    id: 'operations', title: '运营工作台', permission: 'orders:handle', shell: OperationsShell, pages: [
      { id: 'orders', label: '订单处理', permission: 'orders:handle', component: ManagedPage },
    ],
  }),
);
