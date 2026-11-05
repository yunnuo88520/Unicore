// Author: yunnuo <ymz@ebox.vip>
// Description: Shared themed messages with a three-second default lifetime; API identical to the legacy provider.
// Tone classes follow the danger token family while the `error` method name stays the conventional message API.
import { t, useLocale } from './i18n';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn';

export type MessageType = 'primary' | 'success' | 'warning' | 'info' | 'error';
export type MessageOptions = { content: ReactNode; type?: MessageType; duration?: number; id?: string };
type MessageItem = Required<MessageOptions>;
export type MessageAPI = { open: (options: MessageOptions) => string; destroy: (id: string) => void } & Record<MessageType, (content: ReactNode) => string>;
const Context = createContext<MessageAPI | null>(null);
const icons = { primary: Bell, success: CheckCircle2, warning: TriangleAlert, info: Info, error: CircleAlert };
const tone: Record<MessageType, string> = {
  primary: 'border-primary-line text-accent',
  success: 'border-transparent text-success',
  warning: 'border-transparent text-warning',
  info: 'border-transparent text-info',
  error: 'border-danger-line text-danger',
};

// Static access for contexts outside the React tree (SDK callbacks, global handlers);
// calls are no-ops until a MessageProvider mounts and are dropped after it unmounts.
let mounted: MessageAPI | null = null;
function through<K extends keyof MessageAPI>(key: K) {
  return (...parameters: Parameters<MessageAPI[K]>) => (mounted ? (mounted[key] as (...arguments_: unknown[]) => unknown)(...parameters) : '') as ReturnType<MessageAPI[K]>;
}
export const message: MessageAPI = {
  open: through('open'), destroy: through('destroy'), primary: through('primary'),
  success: through('success'), warning: through('warning'), info: through('info'), error: through('error'),
};

export function MessageProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [items, setItems] = useState<MessageItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sequence = useRef(0);
  const api = useMemo<MessageAPI>(() => {
    function destroy(id: string) {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      setItems(current => current.filter(item => item.id !== id));
    }
    function open({ content, type = 'info', duration = 3000, id = `message-${++sequence.current}` }: MessageOptions) {
      clearTimeout(timers.current.get(id));
      const item = { content, type, duration, id };
      setItems(current => [...current.filter(entry => entry.id !== id), item].slice(-4));
      timers.current.set(id, setTimeout(() => destroy(id), Math.max(0, duration)));
      return id;
    }
    return { open, destroy, ...Object.fromEntries(Object.keys(icons).map(type => [type, (content: ReactNode) => open({ id: `message-${type}`, type: type as MessageType, content })])) } as MessageAPI;
  }, []);
  useEffect(() => {
    mounted = api;
    return () => { mounted = null; };
  }, [api]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  return <Context.Provider value={api}>{children}<MessageViewport items={items} dismiss={api.destroy} /></Context.Provider>;
}

function MessageViewport({ items, dismiss }: { items: MessageItem[]; dismiss: (id: string) => void }) {
  useLocale();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex w-fit max-w-[calc(100vw-24px)] flex-col gap-2" role="region" aria-label={t('消息提示')}>
      {items.map(item => {
        const Icon = icons[item.type];
        return <div key={item.id} className={cn('message', `message-${item.type}`, 'pointer-events-auto flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 shadow-modal', tone[item.type])}
          data-message-type={item.type} role={item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'} aria-atomic="true">
          <Icon size={17} aria-hidden="true" className="shrink-0" />
          <span className="text-sm text-ink">{item.content}</span>
          <button type="button" aria-label={t('关闭消息')} onClick={() => dismiss(item.id)} className="ms-1 rounded-sm p-0.5 text-muted transition-colors hover:bg-surface-alt hover:text-ink">
            <X size={13} aria-hidden="true" />
          </button>
        </div>;
      })}
    </div>, document.body);
}

export function useMessage() {
  const api = useContext(Context);
  if (!api) throw new Error('useMessage requires MessageProvider');
  return api;
}
