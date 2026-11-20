// Author: yunnuo <ymz@ebox.vip>
// Description: Revisiting the tab refetches bootstrap through the query cache for both realms.
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient } from '@unicore/sdk';
import { SessionBoundary, useSession } from './session';

let visibilityDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => {
  if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
  else Reflect.deleteProperty(document, 'visibilityState');
});

function probeClient(responses: unknown[], options: { subscribe?: boolean } = {}) {
  let call = 0;
  const bootstrap = vi.fn(() => Promise.resolve(responses[Math.min(call++, responses.length - 1)]));
  const client = {
    transport: {},
    sessionScope: 'test',
    subscribeSession: options.subscribe === false ? undefined : () => () => {},
    bootstrap,
  } as unknown as AppClient;
  return { client, bootstrap };
}

function Probe({ client }: { client: AppClient }) {
  const { metadata } = useSession(client);
  return <div>{metadata.data?.current_user?.username ?? 'pending'}</div>;
}

const metadata = (username: string, realm: 'user' | 'administrator' = 'user') => ({ profile: 'web-platform', identity_realm: realm, capabilities: { authentication: true }, current_user: { username } });

function workspace(client: AppClient) {
  return render(
    <MessageProvider>
      <SessionBoundary client={client}>{() => <Probe client={client} />}</SessionBoundary>
    </MessageProvider>,
  );
}

it.each(['user', 'administrator'] as const)('revisiting the %s tab refetches bootstrap and writes the result back to the query cache', async realm => {
  const { client, bootstrap } = probeClient([metadata('before', realm), metadata('after', realm)]);
  workspace(client);
  await waitFor(() => expect(screen.getByText('before')).toBeTruthy());
  expect(bootstrap).toHaveBeenCalledTimes(1);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  // The refreshed metadata must replace the cached snapshot: a bare
  // client.bootstrap() call would warm nothing and the probe keeps rendering
  // the stale administrator navigation and permissions.
  await waitFor(() => expect(screen.getByText('after')).toBeTruthy());
  expect(bootstrap).toHaveBeenCalledTimes(2);
});

it('stays idle while the tab is hidden', async () => {
  const { client, bootstrap } = probeClient([metadata('only')]);
  workspace(client);
  await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(bootstrap).toHaveBeenCalledTimes(1);
});

it('keeps clients without session subscription idle', async () => {
  const { client, bootstrap } = probeClient([metadata('only')], { subscribe: false });
  workspace(client);
  await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(bootstrap).toHaveBeenCalledTimes(1);
});
