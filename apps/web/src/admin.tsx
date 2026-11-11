/** Author: yunnuo <ymz@ebox.vip> */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminWorkspace } from '@unicore/web-ui/admin';
import { DashboardWidgetRegistry } from '@unicore/web-ui';
import { ActivityWidget } from '@unicore/web-ui/widgets/activity';
import { MonitorSummaryWidget } from '@unicore/web-ui/widgets/monitor-summary';
import { HttpTransport } from '@unicore/sdk';
import '@unicore/theme/styles.css';
const client = new HttpTransport('', globalThis.fetch.bind(globalThis), 'administrator');
const registry = new DashboardWidgetRegistry().register({
  id: 'activity-7d',
  render: metadata => <ActivityWidget client={client} metadata={metadata} />,
}).register({
  id: 'monitor-summary',
  render: metadata => <MonitorSummaryWidget client={client} metadata={metadata} />,
});
createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminWorkspace client={client} registry={registry} /></React.StrictMode>);
