// Author: yunnuo <ymz@ebox.vip>
// Description: Own query caches and component state for exactly one browser session generation.
import { t, useLocale } from './i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AppError, type AppClient, type SessionEvent } from '@unicore/sdk';
import { useMessage } from './message';

const sessionKey = 'unicore.session.changed';
export function SessionBoundary({ client, children }: { client: AppClient; children: (notice: string) => ReactNode }) {
  useLocale();
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    function changed(event: SessionEvent) {
      setNotice(event === 'expired' ? t('会话已失效，请重新登录。') : event === 'password-changed' ? t('密码已更新，所有设备的旧会话已退出，请重新登录。') : '');
      setGeneration(value => value + 1);
      if (event !== 'external') {
        // This is only an invalidation signal. No identity, CSRF or credential is persisted.
        try { localStorage.setItem(`${sessionKey}.${client.sessionScope ?? 'local'}`, crypto.randomUUID()); } catch { /* Private browsing may deny storage. */ }
      }
    }
    const unsubscribe = client.subscribeSession?.(changed);
    const external = (event: StorageEvent) => { if (event.key === `${sessionKey}.${client.sessionScope ?? 'local'}`) client.resetSession?.(); };
    const revalidate = () => { if (document.visibilityState === 'visible' && client.subscribeSession) void client.bootstrap().catch(() => {}); };
    window.addEventListener('storage', external);
    document.addEventListener('visibilitychange', revalidate);
    return () => { unsubscribe?.(); window.removeEventListener('storage', external); document.removeEventListener('visibilitychange', revalidate); };
  }, [client]);
  return <QueryScope key={generation}>{children(notice)}</QueryScope>;
}

function QueryScope({ children }: { children: ReactNode }) {
  useLocale();
  const message = useMessage();
  const [queries] = useState(() => new QueryClient({ mutationCache: new MutationCache({
    onMutate: () => message.destroy('mutation-error'),
    onError: error => { if (!(error instanceof AppError && error.code === 'SESSION_CHANGED')) message.open({ id: 'mutation-error', type: 'error', content: error.message }); },
  }), defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  useEffect(() => () => { void queries.cancelQueries(); queries.clear(); }, [queries]);
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

export function useSession(client: AppClient) {
  const metadata = useQuery({ queryKey: ['bootstrap', client.transport], queryFn: ({ signal }) => client.bootstrap({ signal }) });
  const status = metadata.isPending ? 'loading' : metadata.isError ? 'error' : !metadata.data.capabilities.authentication ? 'unavailable' : metadata.data.current_user ? 'authenticated' : 'anonymous';
  return { metadata, status } as const;
}
