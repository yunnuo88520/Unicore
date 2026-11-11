// Author: yunnuo <ymz@ebox.vip>
// Description: Local monitoring omits capabilities absent from the current carrier and describes only local events.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { AppClient, MonitorSnapshot } from '@unicore/sdk';
import type { PageProps } from '../router';
import { MonitorPage } from './monitor';

it.each(['web-standalone', 'desktop'])('shows only applicable %s services and local event sources', async profile => {
  const snapshot: MonitorSnapshot = {
    profile, version: '0.1.3', commit: 'test', build_time: '', go_version: 'go1.25', started_at: 1, uptime_seconds: 30, status: 'healthy',
    http_service: { applicable: profile === 'web-standalone', requests_total: 3 },
    database: { status: 'healthy', latency_ms: 1 }, storage: { applicable: false }, tasks: { applicable: false },
    runtime: { goroutines: 4, heap_alloc_bytes: 1024, heap_sys_bytes: 2048, gc_cycles: 1 }, host: { available: false },
  };
  const client = { monitorSnapshot: vi.fn().mockResolvedValue(snapshot), monitorEvents: vi.fn().mockResolvedValue({ items: [], capacity: 200 }) } as unknown as AppClient;
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MonitorPage {...{ client } as PageProps} />
  </QueryClientProvider>);
  await screen.findByText('连接正常');
  expect(screen.queryByText('最近异常')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: '服务健康' }));
  expect(screen.getByRole('tabpanel', { name: '服务健康' })).toBeVisible();
  expect(screen.getByText('连接正常')).toBeVisible();
  if (profile === 'desktop') expect(screen.queryByText('HTTP 服务')).not.toBeInTheDocument();
  else expect(screen.getByText('HTTP 服务')).toBeVisible();
  for (const name of ['对象存储', '后台任务', '不适用']) expect(screen.queryByText(name)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: '资源监控' }));
  expect(screen.getByText('进程与 Go Runtime')).toBeVisible();
  for (const name of ['主机信息', 'CPU 使用率', '磁盘空间', '网络 I/O']) expect(screen.queryByText(name)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: '运行事件' }));
  await screen.findByText('关于运行事件');
  expect(screen.getByText(/记录应用启动/)).toBeVisible();
  expect(screen.queryByText(/对象存储|定时任务|系统通知|平台/)).not.toBeInTheDocument();
});
