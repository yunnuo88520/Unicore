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
    // The cache toast is only a fallback: mutations with their own onError
    // surface the failure in context, and the page-level message must always
    // render — so the cache yields whenever a page handles the error itself.
    onMutate: () => message.destroy('mutation-error'),
    onError: (error, _variables, _context, mutation) => {
      if (error instanceof AppError && error.code === 'SESSION_CHANGED') return;
      // Mutations with their own onError surface the failure in context; the
      // cache toast only covers the ones that don't.
      if (mutation?.options?.onError) return;
      message.open({ id: 'mutation-error', type: 'error', content: error.message });
    },
  }), defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  useEffect(() => () => { void queries.cancelQueries(); queries.clear(); }, [queries]);
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

export function useSession(client: AppClient) {
  const metadata = useQuery({ queryKey: ['bootstrap', client.transport], queryFn: ({ signal }) => client.bootstrap({ signal }), refetchInterval: query => query.state.data?.profile === 'web-platform' && query.state.data.identity_realm !== 'administrator' ? 30000 : false });
  const status = metadata.isPending ? 'loading' : metadata.isError ? 'error' : !metadata.data.capabilities.authentication ? 'unavailable' : metadata.data.current_user ? 'authenticated' : 'anonymous';
  return { metadata, status } as const;
}
