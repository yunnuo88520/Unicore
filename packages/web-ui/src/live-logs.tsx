// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator live log viewer; the newest page renders on open, follows the tail and pages history on scroll-up.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Eraser, Terminal } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';
import { productName } from './product.gen';
import { t, useI18n } from './i18n';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, SimpleSelect, Switch } from '@unicore/ui';

const MAX_LINES = 2000;
const PAGE_SIZE = 200;
// Scroll-up pagination fires near the top edge of the console.
const LOAD_THRESHOLD = 48;

interface LogLine {
  time: string;
  level: string;
  text: string;
  extras: string[];
  system: boolean;
  seq: number;
}

// Terminal palette: the level token carries the color, like a real console.
const levelTextClass: Record<string, string> = {
  ERROR: 'text-terminal-error',
  WARN: 'text-terminal-warn',
  INFO: 'text-terminal-info',
  DEBUG: 'text-terminal-debug',
};

// Log frames arrive as single-line slog JSON records; anything else (broadcaster
// drop notices, plain stderr output) degrades to a plain system row without a
// sequence so it never participates in the history cursor.
function parseLine(raw: string, seq: number): LogLine {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value && typeof value.msg === 'string') {
      const extras = Object.entries(value)
        .filter(([key]) => key !== 'time' && key !== 'level' && key !== 'msg')
        .map(([key, item]) => `${key}=${typeof item === 'string' ? item : JSON.stringify(item)}`);
      return {
        time: typeof value.time === 'string' ? value.time.slice(11, 19) : '',
        level: typeof value.level === 'string' ? value.level.toUpperCase() : '',
        text: value.msg,
        extras,
        system: false,
        seq,
      };
    }
  } catch {
    // Plain text keeps flowing below.
  }
  return { time: '', level: '', text: raw, extras: [], system: true, seq: 0 };
}

export function LiveLogsButton({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="icon" className="size-8" aria-label={t('实时日志')} title={t('实时日志')} onClick={() => setOpen(true)}>
      <Terminal size={19} aria-hidden="true" />
    </Button>
    {open && <LiveLogsDialog web={web} onClose={() => setOpen(false)} />}
  </>;
}

function LiveLogsDialog({ web, onClose }: { web: WebClient; onClose: () => void }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  // Remaining buffered entries older than the rendered head; null until the
  // first tail page resolved.
  const [older, setOlder] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [level, setLevel] = useState('');
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState(0);
  // Following the tail sticks on every content mutation: the dialog entrance
  // animation and streamed rows change metrics outside any animation frame.
  const [following, setFollowing] = useState(true);
  const [armed, setArmed] = useState(false);
  // Radix mounts the portal content after the owner's first effects, so the
  // scroll node arrives through the ref callback and re-arms the stick effect.
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const previous = useRef(0);
  const applied = useRef(0);
  const loading = useRef(false);
  const shown = level ? lines.filter(line => line.system || line.level === level) : lines;

  // Opening the console pages the newest history first, then attaches the
  // live stream at that cursor so no full-buffer replay floods the dialog.
  useEffect(() => {
    let disposed = false;
    let cancelStream: (() => void) | null = null;
    (async () => {
      let page;
      try {
        page = await web.logTail({ limit: PAGE_SIZE });
      } catch {
        if (!disposed) setStatus('disconnected');
        return;
      }
      if (disposed) return;
      applied.current = page.latest_seq;
      previous.current = page.items.length;
      setLines(page.items.map(item => parseLine(item.line, item.seq)));
      setOlder(page.older_count);
      if (disposed) return;
      cancelStream = web.subscribeLogEvents(page.latest_seq, (raw, seq) => {
        // EventSource replays the original URL after a reconnect; the
        // sequence dedupes frames the viewer already rendered.
        if (seq > 0) {
          if (seq <= applied.current) return;
          applied.current = seq;
        }
        setLines(current => current.length >= MAX_LINES ? [...current.slice(current.length - MAX_LINES + 1), parseLine(raw, seq)] : [...current, parseLine(raw, seq)]);
      }, setStatus);
      if (disposed) cancelStream();
    })();
    return () => { disposed = true; cancelStream?.(); };
  }, [web]);

  // Follow the tail until the viewer pauses scrolling or scrolls away; count
  // the lines missed meanwhile so the jump chip can offer to catch up.
  useEffect(() => {
    const arrived = Math.max(0, lines.length - previous.current);
    previous.current = lines.length;
    if (!following || paused || !armed) {
      if (arrived > 0) setPending(current => current + arrived);
    }
  }, [lines.length, following, paused, armed]);
  // The entrance animation reshapes the scroll metrics and would read as
  // "scrolled away": ignore scroll events until it settles, then arm the
  // follow loop with a fresh stick and the mutation observer.
  useEffect(() => {
    if (!following || paused || !scrollNode) return;
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), 350);
    return () => clearTimeout(timer);
  }, [following, paused, scrollNode]);
  useEffect(() => {
    if (!following || paused || !scrollNode || !armed) return;
    setPending(0);
    const stick = () => { scrollNode.scrollTop = scrollNode.scrollHeight; };
    stick();
    const observer = new MutationObserver(stick);
    observer.observe(scrollNode, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [following, paused, scrollNode, armed]);

  const loadOlder = useCallback(async () => {
    if (loading.current || !lines.length) return;
    const oldest = lines.find(line => line.seq > 0)?.seq ?? 0;
    if (!oldest) return;
    loading.current = true;
    setLoadingOlder(true);
    const node = scrollNode;
    const previousHeight = node?.scrollHeight ?? 0;
    const previousTop = node?.scrollTop ?? 0;
    try {
      const page = await web.logTail({ before_seq: oldest, limit: PAGE_SIZE });
      if (!page.items.length) {
        setOlder(0);
        return;
      }
      const parsed = page.items.map(item => parseLine(item.line, item.seq));
      // Prepended history is not "new" traffic: keep the pending counter clean.
      previous.current += parsed.length;
      setLines(current => [...parsed, ...current]);
      setOlder(page.older_count);
      requestAnimationFrame(() => {
        if (node) node.scrollTop = node.scrollHeight - previousHeight + previousTop;
      });
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }, [lines, web]);

  const onScroll = () => {
    if (!armed) return;
    const node = scrollNode;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 28;
    setFollowing(atBottom);
    if (atBottom) setPending(0);
    if (node.scrollTop <= LOAD_THRESHOLD) void loadOlder();
  };
  const jump = () => {
    setFollowing(true);
    setPaused(false);
    setPending(0);
    setArmed(true);
    if (scrollNode) scrollNode.scrollTop = scrollNode.scrollHeight;
  };
  const statusView = status === 'connected'
    ? <span className="flex items-center gap-1.5 text-xs font-normal text-success"><span className="size-[5px] rounded-full bg-success shadow-[0_0_0_3px_var(--success-soft)]" aria-hidden="true" />{t('已连接')}</span>
    : status === 'disconnected'
      ? <span className="flex items-center gap-1.5 text-xs font-normal text-warning"><span className="size-[5px] animate-pulse rounded-full bg-warning" aria-hidden="true" />{t('连接已断开，自动重连中')}</span>
      : <span className="flex items-center gap-1.5 text-xs font-normal text-muted"><span className="size-[5px] animate-pulse rounded-full bg-muted" aria-hidden="true" />{t('连接中')}</span>;
  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-w-[860px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2.5">
          <Terminal size={16} aria-hidden="true" />
          {t('实时日志')}
          {statusView}
        </DialogTitle>
      </DialogHeader>
      <p className="-mt-1 text-xs text-muted">{t('打开即定位到最新日志并自动跟随；向上滚动加载更早历史，关闭窗口即断开连接。')}</p>
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <SimpleSelect label={t('级别')} className="h-8 w-36" value={level} onChange={setLevel}
          options={[{ value: '', label: t('全部级别') }, { value: 'DEBUG', label: 'DEBUG' }, { value: 'INFO', label: 'INFO' }, { value: 'WARN', label: 'WARN' }, { value: 'ERROR', label: 'ERROR' }]} />
        <label className="flex items-center gap-2 text-xs text-muted">
          <Switch checked={paused} onChange={setPaused} />
          {t('暂停滚动')}
        </label>
        <Button variant="ghost" size="sm" onClick={() => { setLines([]); setPending(0); setOlder(0); applied.current = 0; }}><Eraser size={14} />{t('清屏')}</Button>
        <span className="ms-auto text-2xs text-muted tabular-nums">{t('显示 {{count}} 行 · 缓冲 {{total}} 行', { count: shown.length, total: lines.length })}</span>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-terminal-line">
        {/* Terminal chrome: the traffic dots are decorative, the title carries the translation. */}
        <div className="flex items-center gap-1.5 bg-terminal-bar px-3.5 py-2">
          <span className="size-2.5 rounded-full bg-danger" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-warning" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-success" aria-hidden="true" />
          <span className="ms-2 min-w-0 truncate font-mono text-2xs text-terminal-dim">{productName} — {t('实时日志')}</span>
        </div>
        {/* pe-4 keeps line ends clear of the macOS overlay scrollbar band. */}
        <div ref={setScrollNode} onScroll={onScroll} role="log" aria-label={t('实时日志行')}
          className="flex max-h-[58dvh] min-h-56 flex-col overflow-y-auto bg-terminal-bg py-2 pe-4 font-mono text-xs leading-relaxed">
          {older !== null && older > 0 && shown.length > 0 && <p role="status" className="py-1.5 text-center text-2xs text-terminal-dim">{loadingOlder ? t('正在加载更早日志…') : t('已省略 {{count}} 条更早日志，向上滚动加载', { count: older })}</p>}
          {older === 0 && shown.length > 0 && <p role="status" className="py-1.5 text-center text-2xs text-terminal-dim">{t('已到缓冲区起点')}</p>}
          {!shown.length
            ? <p role="status" className="my-auto py-12 text-center text-sm text-terminal-dim">{status === 'connected' ? t('已连接，等待新的日志输出…') : t('正在建立日志连接…')}</p>
            : shown.map((line, index) => line.system
              ? <div key={index} className="px-4 py-0.5 text-center text-2xs text-terminal-dim">{line.text}</div>
              : <div key={index} className="flex items-baseline gap-2.5 px-4 py-px hover:bg-terminal-bar">
                  <time className="shrink-0 text-terminal-dim tabular-nums">{line.time || '--:--:--'}</time>
                  {line.level && <span className={`w-12 shrink-0 text-end font-semibold ${levelTextClass[line.level] ?? 'text-terminal-dim'}`}>{line.level}</span>}
                  <span className="min-w-0 flex-1 break-all text-terminal-text">
                    {line.text}
                    {line.extras.length > 0 && <span className="text-terminal-dim"> {line.extras.join(' ')}</span>}
                  </span>
                </div>)}
        </div>
        {!paused && pending > 0 && <Button size="sm" className="absolute bottom-3 start-1/2 -translate-x-1/2" onClick={jump}><ArrowDown size={14} />{t('回到底部（{{count}} 条新日志）', { count: pending })}</Button>}
        {paused && <p role="status" className="pointer-events-none absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-2xs text-muted shadow">{t('滚动已暂停，新日志仍在缓冲')}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
