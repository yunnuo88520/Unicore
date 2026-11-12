// Author: yunnuo <ymz@ebox.vip>
// Description: Click-through human verification widget for the three supported providers.
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from './i18n';
import { Button } from '@unicore/ui';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@unicore/ui/cn';

export type HumanCheckProvider = 'turnstile' | 'tencent' | 'alibaba';

export type HumanCheckWidget = {
  provider: HumanCheckProvider;
  siteKey: string;
  region?: string;
  prefix?: string;
};

type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (id?: string) => void };
type TencentCaptchaResult = { ret: number; ticket: string; randstr: string };
type TencentCaptchaConstructor = new (appId: string, callback: (result: TencentCaptchaResult) => void, options?: Record<string, unknown>) => { show: () => void };
type AliyunInit = (options: { SceneId: string; prefix: string; mode: string; element: string; button: string; captchaVerifyCallback: (param: string) => Promise<{ captchaResult: boolean }>; getInstance: (instance: { reload?: () => void }) => void; slideStyle: Record<string, number>; language: string }) => void;

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    TencentCaptcha?: TencentCaptchaConstructor;
    AliyunCaptchaConfig?: { region: string; prefix: string };
    initAliyunCaptcha?: AliyunInit;
  }
}

const loaded = new Set<string>();

function loadScript(src: string, id: string): Promise<void> {
  if (loaded.has(id) || document.getElementById(id)) {
    loaded.add(id);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => { loaded.add(id); resolve(); };
    script.onerror = () => reject(new Error('human-check-script-failed'));
    document.head.appendChild(script);
  });
}

/** One click-through verification control; calls onToken with the provider proof (empty clears). */
export function HumanCheck({ widget, required, token, onToken, resetSignal }: {
  widget: HumanCheckWidget;
  required: boolean;
  token: string;
  onToken: (token: string, randstr: string) => void;
  resetSignal: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const instance = useRef<{ reload?: () => void } | null>(null);
  const widgetId = useRef<string>('');

  const resolvedPrefix = widget.prefix || 'human-check';
  const elementId = `${resolvedPrefix}-human-check`;

  // Turnstile renders an inline checkbox; the token arrives through its callback.
  useEffect(() => {
    if (!required || widget.provider !== 'turnstile' || !widget.siteKey || !container.current) return;
    let cancelled = false;
    setFailed(false);
    loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js', 'human-check-turnstile-sdk')
      .then(() => {
        if (cancelled || !window.turnstile || !container.current) return;
        setReady(true);
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: widget.siteKey,
          callback: (value: unknown) => onToken(typeof value === 'string' ? value : '', ''),
          'expired-callback': () => onToken('', ''),
          'error-callback': () => { onToken('', ''); setFailed(true); },
          theme: 'auto',
          size: 'flexible',
        });
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [required, widget.provider, widget.siteKey, onToken]);

  // Aliyun binds to an existing button and pops up on click; the verify callback only captures the param.
  useEffect(() => {
    if (!required || widget.provider !== 'alibaba' || !widget.siteKey) return;
    let cancelled = false;
    setFailed(false);
    window.AliyunCaptchaConfig = { region: widget.region === 'ap-southeast-1' ? 'sgp' : 'cn', prefix: resolvedPrefix };
    loadScript('https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js', 'human-check-aliyun-sdk')
      .then(() => {
        if (cancelled || !window.initAliyunCaptcha) return;
        setReady(true);
        window.initAliyunCaptcha({
          SceneId: widget.siteKey,
          prefix: resolvedPrefix,
          mode: 'popup',
          element: `#${elementId}`,
          button: `#${elementId}-button`,
          captchaVerifyCallback: (param: string) => { onToken(param, ''); return Promise.resolve({ captchaResult: true }); },
          getInstance: value => { instance.current = value; },
          slideStyle: { width: 360, height: 40 },
          language: document.documentElement.lang === 'en' ? 'en' : 'zh-CN',
        });
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [required, widget.provider, widget.siteKey, widget.region, resolvedPrefix, elementId, onToken]);

  // Failures on the wire invalidate the collected proof so the user verifies again.
  useEffect(() => {
    if (resetSignal === 0) return;
    onToken('', '');
    if (widget.provider === 'turnstile' && window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
    if (widget.provider === 'alibaba') instance.current?.reload?.();
  }, [resetSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTencent = useCallback(async () => {
    setFailed(false);
    const region = widget.region === 'intl' ? 'intl' : 'cn';
    try {
      await loadScript(region === 'intl' ? 'https://ca.turing.captcha.qcloud.com/TJNCaptcha-global.js' : 'https://turing.captcha.qcloud.com/TJCaptcha.js', 'human-check-tencent-sdk');
    } catch {
      setFailed(true);
      return;
    }
    if (!window.TencentCaptcha) {
      setFailed(true);
      return;
    }
    setReady(true);
    new window.TencentCaptcha(widget.siteKey, result => {
      if (result.ret === 0 && result.ticket && !result.ticket.startsWith('trerror_')) onToken(result.ticket, result.randstr);
      else onToken('', '');
    }, { type: 'popup', enableAutoCheck: false }).show();
  }, [widget.provider, widget.region, widget.siteKey, onToken]);

  if (!required || !widget.siteKey) return null;
  return <div className="flex flex-col gap-1.5">
    <span className="text-sm font-medium text-ink">{t('人机验证')}</span>
    {widget.provider === 'turnstile' && <div ref={container} className="min-h-16" aria-label={t('人机验证')} />}
    {widget.provider === 'tencent' && <Button type="button" variant="secondary" ref={button} disabled={!!token}
      className={cn('justify-start', token && 'border-success-line text-success')} onClick={() => void openTencent()}>
      <ShieldCheck size={15} aria-hidden="true" />{token ? t('人机验证已通过') : t('点击完成人机验证')}
    </Button>}
    {widget.provider === 'alibaba' && <Button type="button" variant="secondary" ref={button} id={`${elementId}-button`} disabled={!!token}
      className={cn('justify-start', token && 'border-success-line text-success')} onClick={() => { /* the SDK binds this button and opens the popup */ }}>
      <ShieldCheck size={15} aria-hidden="true" />{token ? t('人机验证已通过') : t('点击完成人机验证')}
    </Button>}
    {(failed || !ready) && widget.provider !== 'turnstile' && <small className="text-2xs text-muted">{failed ? t('验证组件加载失败，请刷新页面重试。') : t('正在加载验证组件…')}</small>}
    {widget.provider === 'alibaba' && <span id={elementId} aria-hidden="true" />}
  </div>;
}
