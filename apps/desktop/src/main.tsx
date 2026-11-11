/** Author: yunnuo <ymz@ebox.vip> */
import React from 'react';
import {t} from '@unicore/web-ui/i18n';
import { createRoot } from 'react-dom/client';
import { Workspace } from '@unicore/web-ui';
import { createHashHistory } from '@unicore/web-ui/router';
import { DashboardWidgetRegistry } from '@unicore/web-ui';
import { MonitorSummaryWidget } from '@unicore/web-ui/widgets/monitor-summary';
import { AppError, WailsTransport, type DesktopBridge } from '@unicore/sdk';
import '@unicore/theme/styles.css';

declare global { interface Window { go?: { desktop?: { Bridge?: DesktopBridge } } } }
const client = new WailsTransport(() => {
  const bridge = window.go?.desktop?.Bridge;
  if (!bridge) throw new AppError('BRIDGE_UNAVAILABLE', t('桌面桥接尚未就绪，请使用 make dev-desktop 启动'));
  return bridge;
});
const registry = new DashboardWidgetRegistry().register({
  id: 'monitor-summary',
  render: metadata => <MonitorSummaryWidget client={client} metadata={metadata} />,
});
createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace client={client} registry={registry} history={createHashHistory} /></React.StrictMode>);
