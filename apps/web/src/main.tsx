/** Author: yunnuo <ymz@ebox.vip> */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from '@unicore/web-ui';
import { MonitorSummaryWidget } from '@unicore/web-ui/widgets/monitor-summary';
import { DashboardWidgetRegistry } from '@unicore/web-ui';
import { HttpTransport } from '@unicore/sdk';
import '@unicore/theme/styles.css';

const client = new HttpTransport();
// Local profiles show the runtime monitor summary; the platform user surface
// stays free of instance metrics (the widget self-checks the profile).
const registry = new DashboardWidgetRegistry().register({
  id: 'monitor-summary',
  render: metadata => <MonitorSummaryWidget client={client} metadata={metadata} />,
});
createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace client={client} registry={registry} /></React.StrictMode>);
