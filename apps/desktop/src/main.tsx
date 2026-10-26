/** Author: yunnuo <ymz@ebox.vip> */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from '@unicore/web-ui';
import { AppError, WailsTransport, type DesktopBridge } from '@unicore/sdk';
import '@unicore/web-ui/styles.css';

declare global { interface Window { go?: { desktop?: { Bridge?: DesktopBridge } } } }
const client = new WailsTransport(() => {
  const bridge = window.go?.desktop?.Bridge;
  if (!bridge) throw new AppError('BRIDGE_UNAVAILABLE', '桌面桥接尚未就绪，请使用 make dev-desktop 启动');
  return bridge;
});
createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace client={client} /></React.StrictMode>);
