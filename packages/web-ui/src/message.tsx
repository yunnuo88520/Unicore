/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared themed messages with a three-second default lifetime and modal-aware placement.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import './message.css';

export type MessageType = 'primary' | 'success' | 'warning' | 'info' | 'error';
export type MessageOptions = { content: string; type?: MessageType; duration?: number; id?: string };
type MessageItem = Required<MessageOptions>;
export type MessageAPI = { open: (options: MessageOptions) => string; destroy: (id: string) => void } & Record<MessageType, (content: string) => string>;
const Context = createContext<MessageAPI | null>(null);
const icons = { primary: Bell, success: CheckCircle2, warning: TriangleAlert, info: Info, error: CircleAlert };

export function MessageProvider({ children }: { children: ReactNode }) {
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
    return { open, destroy, ...Object.fromEntries(Object.keys(icons).map(type => [type, (content: string) => open({ id: `message-${type}`, type: type as MessageType, content })])) } as MessageAPI;
  }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  return <Context.Provider value={api}>{children}<MessageViewport items={items} dismiss={api.destroy} /></Context.Provider>;
}

function MessageViewport({ items, dismiss }: { items: MessageItem[]; dismiss: (id: string) => void }) {
  const [target, setTarget] = useState<Element>(document.body);
  useLayoutEffect(() => {
    // A native dialog is in the browser's top layer. Keep feedback inside it,
    // then move back to body when it closes, without restarting message timers.
    const update = () => setTarget(document.querySelector('dialog[open]:last-of-type') ?? document.body);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    update();
    return () => observer.disconnect();
  }, []);
  return createPortal(<div className="message-stack" role="region" aria-label="消息提示">{items.map(item => {
    const Icon = icons[item.type];
    return <div key={item.id} className={`message message-${item.type}`} data-message-type={item.type} role={item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'} aria-atomic="true"><Icon size={18} aria-hidden="true" /><span>{item.content}</span><button type="button" className="message-dismiss" aria-label="关闭消息" onClick={() => dismiss(item.id)}><X size={14} aria-hidden="true" /></button></div>;
  })}</div>, target);
}

export function useMessage() {
  const api = useContext(Context);
  if (!api) throw new Error('useMessage requires MessageProvider');
  return api;
}
