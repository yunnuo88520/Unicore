// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator live log viewer; an SSE-backed console that connects on open and disconnects on close.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Eraser, ScrollText } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';
import { t, useI18n } from './i18n';
import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, SimpleSelect, Switch } from '@unicore/ui';

const MAX_LINES = 500;

interface LogLine {
  time: string;
  level: string;
  text: string;
  extras: string[];
  system: boolean;
}

const levelVariants: Record<string, 'danger' | 'warning' | 'subtle'> = { ERROR: 'danger', WARN: 'warning', INFO: 'subtle', DEBUG: 'subtle' };

// Log frames arrive as single-line slog JSON records; anything else (broadcaster
// drop notices, plain stderr output) degrades to a plain system row.
function parseLine(raw: string): LogLine {
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
      };
    }
  } catch {
    // Plain text keeps flowing below.
  }
  return { time: '', level: '', text: raw, extras: [], system: true };
}

export function LiveLogsButton({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="icon" className="size-8" aria-label={t('实时日志')} title={t('实时日志')} onClick={() => setOpen(true)}>
      <ScrollText size={19} aria-hidden="true" />
    </Button>
    {open && <LiveLogsDialog web={web} onClose={() => setOpen(false)} />}
  </>;
}

function LiveLogsDialog({ web, onClose }: { web: WebClient; onClose: () => void }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [level, setLevel] = useState('');
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const previous = useRef(0);
  const shown = level ? lines.filter(line => line.system || line.level === level) : lines;

  const append = useCallback((raw: string) => {
    setLines(current => current.length >= MAX_LINES ? [...current.slice(current.length - MAX_LINES + 1), parseLine(raw)] : [...current, parseLine(raw)]);
  }, []);

  // Closing the dialog unmounts this effect and disconnects the stream.
  useEffect(() => web.subscribeLogEvents(append, setStatus), [web, append]);

  // Follow the tail unless the viewer paused scrolling or scrolled away; count
  // the lines missed meanwhile so the jump chip can offer to catch up.
  useEffect(() => {
    const arrived = lines.length - previous.current;
    previous.current = lines.length;
    if (following.current) {
      setPending(0);
      if (!paused && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    } else if (arrived > 0) {
      setPending(current => current + arrived);
    }
  }, [lines.length, paused]);
  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 28;
    if (following.current) setPending(0);
  };
  const jump = () => {
    following.current = true;
    setPaused(false);
    setPending(0);
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
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
          <ScrollText size={16} aria-hidden="true" />
          {t('实时日志')}
          {statusView}
        </DialogTitle>
      </DialogHeader>
      <p className="-mt-1 text-xs text-muted">{t('服务端日志实时推送，关闭窗口即断开连接；断开或重连后自动回放最近缓冲。')}</p>
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <SimpleSelect label={t('级别')} className="h-8 w-36" value={level} onChange={setLevel}
          options={[{ value: '', label: t('全部级别') }, { value: 'DEBUG', label: 'DEBUG' }, { value: 'INFO', label: 'INFO' }, { value: 'WARN', label: 'WARN' }, { value: 'ERROR', label: 'ERROR' }]} />
        <label className="flex items-center gap-2 text-xs text-muted">
          <Switch checked={paused} onChange={setPaused} />
          {t('暂停滚动')}
        </label>
        <Button variant="ghost" size="sm" onClick={() => { setLines([]); setPending(0); }}><Eraser size={14} />{t('清屏')}</Button>
        <span className="ms-auto text-2xs text-muted tabular-nums">{t('显示 {{count}} 行 · 缓冲 {{total}} 行', { count: shown.length, total: lines.length })}</span>
      </div>
      <div className="relative">
        <div ref={scroller} onScroll={onScroll} role="log" aria-label={t('实时日志行')}
          className="flex max-h-[58dvh] min-h-56 flex-col overflow-y-auto rounded-lg border border-line bg-surface py-2">
          {!shown.length
            ? <p role="status" className="my-auto py-12 text-center text-sm text-muted">{status === 'connected' ? t('已连接，等待新的日志输出…') : t('正在建立日志连接…')}</p>
            : shown.map((line, index) => line.system
              ? <div key={index} className="px-4 py-0.5 text-center font-mono text-2xs text-muted">{line.text}</div>
              : <div key={index} className="flex items-baseline gap-2.5 px-4 py-px font-mono text-xs leading-relaxed hover:bg-surface-alt">
                  <time className="shrink-0 text-subtle tabular-nums">{line.time || '--:--:--'}</time>
                  {line.level && <Badge variant={levelVariants[line.level] ?? 'subtle'} className="shrink-0 rounded px-1.5 py-0">{line.level}</Badge>}
                  <span className="min-w-0 flex-1 break-all text-ink">
                    {line.text}
                    {line.extras.length > 0 && <span className="text-subtle"> {line.extras.join(' ')}</span>}
                  </span>
                </div>)}
        </div>
        {!paused && pending > 0 && <Button size="sm" className="absolute bottom-3 start-1/2 -translate-x-1/2" onClick={jump}><ArrowDown size={14} />{t('回到底部（{{count}} 条新日志）', { count: pending })}</Button>}
        {paused && <p role="status" className="pointer-events-none absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-2xs text-muted shadow">{t('滚动已暂停，新日志仍在缓冲')}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
