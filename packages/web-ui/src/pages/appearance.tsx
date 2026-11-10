// Author: yunnuo <ymz@ebox.vip>
// Description: Device appearance settings for users, plus the administrator settings sections (base tabs and mail).
import { defineMessages, t, useLocale } from '../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Building2, CheckCircle2, Monitor, Moon, Save, Sun, type LucideIcon } from 'lucide-react';
import { invalidateAfter } from '../queries';
import { AppearanceDrawer } from '../appearance-drawer';
import { BrandingPanel } from '../branding-panel';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Modal, NativeSelect, Switch, Tabs, Textarea, useMessage } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { useRouteSearch, type PageProps } from '../router';
import type { AppClient, Bootstrap, OIDCCheckInfo, SettingPatch, WebClient } from '@unicore/sdk';
import type { Theme } from '@unicore/theme';

/** Shape of one settings registry row as delivered by client.settings(). */
type SettingEntry = { key: string; value: string; value_type: string; group: string; label: string; sensitive: boolean; configured?: boolean };

const groupNames: Record<string, string> = defineMessages({ site: '站点信息', maintenance: '维护模式', registration: '注册设置', appearance: '默认外观', admin: '后台入口', protection: '站点防护', security: '安全', mail: '邮件服务', oidc: '企业登录（OIDC）', logging: '日志保留' });
const baseSections = defineMessages([
  { id: 'site', label: '基础信息', groups: ['site'] },
  { id: 'branding', label: '品牌图片', groups: [] },
  { id: 'appearance', label: '外观设置', groups: ['appearance'] },
  { id: 'security', label: '安全与控制', groups: ['protection', 'admin'] },
  { id: 'registration', label: '注册设置', groups: ['registration'] },
  { id: 'maintenance', label: '维护模式', groups: ['maintenance'] },
  { id: 'logs', label: '日志', groups: ['logging'] },
  { id: 'oidc', label: '企业登录', groups: ['oidc'] },
]) as readonly { id: string; label: string; groups: string[] }[];

export function AppearancePage({ theme, setTheme }: PageProps) {
  useLocale();
  return <UserAppearance theme={theme} onSaved={setTheme} />;
}

export function AdminMailSettingsPage({ client, metadata, theme, setTheme, refresh, page }: PageProps) {
  useLocale();
  if (!client.settings || !client.patchSettings) return null;
  return <AdminSettings section={page === 'mail' ? 'mail' : page === 'account-policy' ? 'security' : 'base'} client={client} metadata={metadata} theme={theme} onThemeSaved={setTheme} onSaved={refresh} />;
}

/** Device-level appearance: theme cards save through preferences, deeper controls live in the drawer. */
function UserAppearance({ theme, onSaved }: { theme: Theme; onSaved: (theme: Theme) => void }) {
  useLocale();
  const [draft, setDraft] = useState(theme);
  const [expanded, setExpanded] = useState(false);
  const message = useMessage();
  useEffect(() => { setDraft(theme); }, [theme]);
  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div>
        <CardTitle>{t('界面主题')}</CardTitle>
        <CardDescription>{t('保存在当前客户端，不修改全局配置，也不影响其他用户')}</CardDescription>
      </div>
      <Badge>{t('仅当前客户端')}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <ThemeChoices theme={draft} onChange={setDraft} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={event => { event.currentTarget.focus(); setExpanded(true); }}>{t('更多外观设置')}</Button>
        <Button disabled={draft === theme} onClick={() => { onSaved(draft); message.success(t('外观已保存到当前客户端')); }}>{t('保存设置')}</Button>
      </div>
    </CardContent>
    {expanded && <AppearanceDrawer onClose={() => setExpanded(false)} />}
  </Card>;
}

const themeChoices = defineMessages([
  { id: 'light', title: '浅色', detail: '明亮清晰，专注每一处细节', icon: Sun },
  { id: 'dark', title: '深色', detail: '柔和低光，适合夜间工作', icon: Moon },
  { id: 'system', title: '跟随系统', detail: '自动匹配设备的外观偏好', icon: Monitor },
]) as readonly { id: Theme; title: string; detail: string; icon: LucideIcon }[];

export function ThemeChoices({ theme, onChange, disabled = false }: { theme: Theme; onChange: (theme: Theme) => void; disabled?: boolean }) {
  useLocale();
  // Compact card row: the group stays at a fixed width so each preview keeps a phone-like ratio on wide panels.
  return <div className="grid max-w-lg gap-3 sm:grid-cols-3" role="group" aria-label={t('界面主题')}>
    {themeChoices.map(({ id, title, detail, icon: Icon }) => {
      const selected = theme === id;
      return <button key={id} type="button" disabled={disabled} aria-pressed={selected} onClick={() => onChange(id)}
        className={cn('flex flex-col items-start gap-2 rounded-lg border p-2 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55',
          selected ? 'border-primary-line bg-primary-soft' : 'border-line bg-surface hover:border-primary-line')}>
        <ThemePreview variant={id} />
        <strong className="flex items-center gap-1.5 text-sm font-medium text-ink"><Icon size={15} aria-hidden="true" />{t(title)}{selected && <CheckCircle2 size={15} className="text-success" aria-hidden="true" />}</strong>
        <small className="text-2xs leading-4 text-muted">{t(detail)}</small>
      </button>;
    })}
  </div>;
}

function ThemePreview({ variant }: { variant: Theme }) {
  const background = variant === 'light'
    ? 'var(--light-surface)'
    : variant === 'dark'
      ? 'var(--dark-surface)'
      : 'linear-gradient(105deg, var(--light-surface) 50%, var(--dark-surface) 50%)';
  const track = variant === 'dark' ? 'var(--dark-border)' : 'var(--light-border)';
  const line = variant === 'dark' ? 'var(--dark-muted)' : 'var(--light-muted)';
  const surface = variant === 'dark' ? 'var(--dark-surface-alt, var(--dark-border))' : 'var(--light-surface-alt, var(--light-border))';
  return <span aria-hidden="true" className="flex h-24 w-full flex-col gap-1 rounded-md border border-line p-1.5" style={{ background: track }}>
    <span className="flex items-center gap-1 rounded-xs px-1 py-0.5" style={{ background }}>
      <i className="h-1.5 w-1.5 rounded-full" style={{ background: line }} />
      <i className="h-1 w-8 rounded-full" style={{ background: line }} />
      <i className="ms-auto h-1 w-4 rounded-full" style={{ background: line }} />
    </span>
    <span className="flex flex-1 gap-1 overflow-hidden rounded-xs" style={{ background }}>
      <span className="flex w-1/4 flex-col gap-1 rounded-xs p-1" style={{ background: surface }}>
        <i className="h-1 w-full rounded-full" style={{ background: line }} />
        <i className="h-1 w-2/3 rounded-full" style={{ background: line }} />
        <i className="h-1 w-3/4 rounded-full" style={{ background: track }} />
        <i className="h-1 w-1/2 rounded-full" style={{ background: track }} />
      </span>
      <span className="flex flex-1 flex-col gap-1 pt-1">
        <i className="h-1.5 w-1/2 rounded-full" style={{ background: line }} />
        <i className="h-1 w-full rounded-full" style={{ background: track }} />
        <i className="h-1 w-3/4 rounded-full" style={{ background: track }} />
        <i className="min-h-3 flex-1 w-full rounded-xs" style={{ background: track }} />
      </span>
    </span>
  </span>;
}

type AdminSettingsProps = {
  section: 'base' | 'mail' | 'security';
  client: AppClient;
  metadata: Bootstrap;
  theme: Theme;
  onThemeSaved?: (theme: Theme) => void;
  onSaved: () => void;
};

/** Persistent instance settings: drafts survive tab switches, saves patch only the visible section. */
function AdminSettings({ section = 'base', client, metadata, theme, onThemeSaved, onSaved }: AdminSettingsProps) {
  useLocale();
  const message = useMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tab } = useRouteSearch<{ tab: string }>();
  const query = useQuery({ queryKey: ['persistent-settings'], queryFn: () => client.settings!() });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: (patch: SettingPatch) => client.patchSettings!(patch),
    onSuccess: (_, patch) => {
      const keys = new Set(patch.changes.map(change => change.key));
      setDraft(value => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key))));
      setCleared(value => value.filter(key => !keys.has(key)));
      const themeValue = patch.changes.find(change => change.key === 'appearance.theme')?.value;
      if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system') onThemeSaved?.(themeValue);
      message.success(t('设置已保存'));
      void invalidateAfter(queryClient, 'settings');
      onSaved();
      // Moving the admin entrance remounts the whole administrator app; send the browser to the new path at once.
      const adminPath = patch.changes.find(change => change.key === 'admin.path')?.value;
      if (adminPath && metadata.identity_realm === 'administrator' && !window.location.pathname.startsWith(adminPath)) {
        window.setTimeout(() => window.location.assign(adminPath), 600);
      }
    },
  });
  if (query.isPending) return <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取设置…')}</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
    <p className="text-sm text-muted">{t(query.error.message)}</p>
    <Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button>
  </CardContent></Card>;
  const localAppearance = metadata.profile === 'web-platform';
  const candidates = section === 'security' ? [{id:'security',label:t('账户安全'),groups:['security']}] : section === 'mail' ? [{ id: 'mail', label: t('邮件设置'), groups: ['mail'] }] : baseSections;
  const available = candidates.filter(item => item.id === 'appearance' && localAppearance
    ? true
    : item.id === 'branding'
      ? !!client.branding && !!client.updateBranding
      : query.data.items.some(entry => item.groups.includes(entry.group)));
  const active = available.find(item => item.id === tab) ?? available[0];
  const groups = active.groups;
  const changes = Object.entries(draft)
    .filter(([key]) => query.data.items.some(item => item.key === key && groups.includes(item.group)))
    .map(([key, value]) => ({ key, value, ...(cleared.includes(key) ? { clear: true } : {}) }));
  const dirty = (group: string) => query.data.items.some(item => item.group === group && item.key in draft);
  const plainSection = active.id !== 'branding' && !(localAppearance && active.id === 'appearance');
  return <div className="flex flex-col gap-4">
    {section === 'base' && <Tabs
      id="instance-settings"
      label={t('设置分组')}
      items={available.map(item => ({ id: item.id, label: t(item.label), dirty: item.groups.some(dirty) }))}
      value={active.id}
      onChange={id => { save.reset(); void navigate({ to: '/site', search: { tab: id }, replace: true }); }}
    />}
    {client.branding && client.updateBranding && <div role="tabpanel" id="instance-settings-panel-branding" aria-labelledby="instance-settings-tab-branding" hidden={active.id !== 'branding'}>
      <BrandingPanel client={client} canWrite onSaved={onSaved} />
    </div>}
    {localAppearance && <div role="tabpanel" id="instance-settings-panel-appearance" aria-labelledby="instance-settings-tab-appearance" hidden={active.id !== 'appearance'}>
      <UserAppearance theme={theme} onSaved={onThemeSaved ?? (() => {})} />
    </div>}
    {plainSection && <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{t(active.label)}</CardTitle>
          <CardDescription>{t('配置保存在服务器，统一应用于整个实例')}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className="max-sm:hidden">{t('持久化')}</Badge>
          <Button pending={save.isPending} disabled={save.isPending || !changes.length} onClick={() => save.mutate({ changes })}>
            {!save.isPending && <Save size={14} aria-hidden="true" />}{t('保存设置')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {groups.map(group => <fieldset key={group} className="flex flex-col gap-3 rounded-lg border border-line p-3" disabled={save.isPending}>
          <legend className="px-1 text-sm font-semibold text-ink">{t(groupNames[group] ?? group)}</legend>
          {group === 'protection' && <p className="text-xs text-muted">{t('人机验证与找回密码面向整个站点；开启邮件找回密码前，请先在邮件设置完成 SMTP 测试。')}</p>}
          {group === 'mail' && <p className="text-xs text-muted">{t('STARTTLS 使用端口 587，SSL/TLS（隐式 TLS）使用端口 465，明文仅允许本机（25）；切换加密方式会自动填入常用端口，可再手动修改。保存后点击下方“发送测试”验证连接。')}</p>}
          {group === 'oidc' && <p className="text-xs text-muted">{t('支持授权码 + PKCE；保存后在本页检查连接，再完成一次实际登录。')}</p>}
          {group === 'logging' && <p className="text-xs text-muted">{t('作用于数据目录 logs 内的本程序日志；桌面与单机版通过部署配置调整，站点日志在操作日志页查看。')}</p>}
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            {query.data.items.filter(item => item.group === group && !HUMAN_CHECK_KEYS.includes(item.key)).map(entry => <SettingField key={entry.key} entry={entry} draft={draft} cleared={cleared}
              onValue={(key, value) => {
                setDraft(current => {
                  const next = { ...current, [key]: value };
                  // Switching the SMTP encryption pre-fills its well-known port, but never overrides a custom one.
                  if (key === 'mail.tls') {
                    const suggested = { starttls: '587', tls: '465', plain: '25' }[value] ?? '';
                    const saved = query.data.items.find(item => item.key === 'mail.port')?.value ?? '';
                    if (suggested && ['', '25', '465', '587'].includes(next['mail.port'] ?? saved)) next['mail.port'] = suggested;
                  }
                  return next;
                });
                setCleared(current => current.filter(item => item !== key));
              }}
              onClear={key => {
                setDraft(current => ({ ...current, [key]: '' }));
                setCleared(current => current.includes(key) ? current : [...current, key]);
              }} />)}
          </div>
        </fieldset>)}
        {section === 'base' && active.id === 'security' && <HumanCheckPanel
          draft={draft}
          entries={query.data.items}
          onValue={(key, value) => { setDraft(current => ({ ...current, [key]: value })); setCleared(current => current.filter(item => item !== key)); }}
          onRevert={key => setDraft(current => Object.fromEntries(Object.entries(current).filter(([item]) => item !== key)))}
        />}
      </CardContent>
    </Card>}
    {client.web && section === 'mail' && <MailTest web={client.web} canWrite dirty={dirty('mail')} revision={query.dataUpdatedAt} />}
    {/* No remount key: a background settings refetch after saving must not
        orphan an in-flight connection check and drop its endpoint result. The
        info query below already refetches through its revision-scoped key. */}
    {client.web && active.id === 'oidc' && <OidcConnection web={client.web} dirty={dirty('oidc')} revision={query.dataUpdatedAt} />}
  </div>;
}

const HUMAN_CHECK_KEYS = ['security.human_check_enabled', 'security.human_check_provider', 'security.turnstile_site_key', 'security.turnstile_secret_key', 'security.tencent_captcha_app_id', 'security.tencent_captcha_app_secret_key', 'security.tencent_captcha_secret_id', 'security.tencent_captcha_secret_key', 'security.tencent_captcha_region', 'security.aliyun_captcha_access_key_id', 'security.aliyun_captcha_access_key_secret', 'security.aliyun_captcha_scene_id', 'security.aliyun_captcha_region'];

const HUMAN_CHECK_PROVIDERS = defineMessages([['turnstile', 'Cloudflare Turnstile'], ['tencent', '腾讯天御验证码'], ['alibaba', '阿里云验证码 2.0']]) as readonly (readonly [string, string])[];

function Segmented({ label, current, options, onChange }: { label: string; current: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-line bg-surface-alt p-1">
    {options.map(([id, name]) => <button key={id} type="button" role="radio" aria-checked={current === id} onClick={() => onChange(id)}
      className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', current === id ? 'bg-surface text-accent shadow-tint' : 'text-muted hover:text-ink')}>{t(name)}</button>)}
  </div>;
}

/** Human verification panel mirroring the reference flow: collapsed until enabled,
 *  one segmented provider choice, then only that provider's credentials. */
function HumanCheckPanel({ draft, entries, onValue, onRevert }: {
  draft: Record<string, string>;
  entries: SettingEntry[];
  onValue: (key: string, value: string) => void;
  onRevert: (key: string) => void;
}) {
  useLocale();
  const entry = (key: string) => entries.find(item => item.key === key);
  const current = (key: string) => (key in draft ? draft[key] : entry(key)?.value ?? '');
  const configured = (key: string) => !!entry(key)?.configured;
  const loginOn = current('security.human_check_enabled') === 'true';
  const provider = current('security.human_check_provider') || 'turnstile';
  const expanded = loginOn;
  // Secret inputs stay blank until typed; emptying a field reverts the draft so the stored value survives.
  const secret = (key: string, placeholder: string) => {
    const isConfigured = configured(key);
    return <Input type="password" autoComplete="new-password" placeholder={isConfigured ? t('留空以保留当前值') : placeholder}
      value={draft[key] ?? ''} onChange={event => { if (event.target.value) onValue(key, event.target.value); else onRevert(key); }} />;
  };
  const link = (href: string, children: ReactNode) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">{children}</a>;
  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div>
        <CardTitle>{t('启用人机验证')}</CardTitle>
        <CardDescription>{t('开启后登录、注册等入口需要通过人机验证')}</CardDescription>
      </div>
      <Switch checked={loginOn} onChange={checked => onValue('security.human_check_enabled', String(checked))} />
    </CardHeader>
    {expanded && <CardContent className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('验证服务商')}</span>
        <Segmented label={t('验证服务商')} current={provider} options={HUMAN_CHECK_PROVIDERS} onChange={value => onValue('security.human_check_provider', value)} />
      </div>
      {provider === 'turnstile' && <>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('站点密钥')}</span>
          <Input placeholder="0x4AAAAAAAA..." value={current('security.turnstile_site_key')} onChange={event => onValue('security.turnstile_site_key', event.target.value)} />
          <small className="text-xs text-muted">{t('从 Cloudflare Dashboard 获取')} · {link('https://dash.cloudflare.com/?to=/:account/turnstile', t('打开 Turnstile 控制台'))} · {link('https://developers.cloudflare.com/turnstile/', t('查看 Web 接入文档'))}</small>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('私密密钥')}</span>
          {secret('security.turnstile_secret_key', '0x4AAAAAAAA...')}
          <small className="text-xs text-muted">{t('服务端验证密钥（请保密）')}</small>
        </div>
      </>}
      {provider === 'tencent' && <>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('服务站点')}</span>
          <Segmented label={t('服务站点')} current={current('security.tencent_captcha_region') || 'cn'} options={[['cn', t('中国站')], ['intl', t('国际站')]]} onChange={value => onValue('security.tencent_captcha_region', value)} />
          <small className="text-xs text-muted">{t('决定前端加载的 SDK 脚本与服务端校验接入点，需与 CaptchaAppId 所属站点一致；国际站请在 Tencent Cloud 国际站控制台创建验证。')}</small>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-line p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('验证码应用密钥')}</span>
            <small className="text-xs text-muted">{t('CaptchaAppId 与 AppSecretKey 来自验证码控制台的验证管理页面。')}</small>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">CaptchaAppId</span>
              <Input placeholder="123456789" value={current('security.tencent_captcha_app_id')} onChange={event => onValue('security.tencent_captcha_app_id', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">AppSecretKey</span>
              {secret('security.tencent_captcha_app_secret_key', t('留空以保留当前值'))}
              <small className="text-xs text-muted">{t('启用前必须填写此项。')}</small>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-line p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('云 API 调用密钥')}</span>
            <small className="text-xs text-muted">{t('SecretId 与 SecretKey 用于服务端调用 DescribeCaptchaResult 接口。')}</small>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{t('腾讯云 SecretId')}</span>
              {secret('security.tencent_captcha_secret_id', t('留空以保留当前值'))}
              <small className="text-xs text-muted">{t('启用前必须填写此项。')}</small>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{t('腾讯云 SecretKey')}</span>
              {secret('security.tencent_captcha_secret_key', t('留空以保留当前值'))}
              <small className="text-xs text-muted">{t('启用前必须填写此项。')}</small>
            </div>
          </div>
          <small className="text-xs text-muted">{t('推荐创建 CAM 子用户并授予 QcloudCaptchaFullAccess，避免使用主账号永久密钥。')}</small>
          <small className="text-xs text-muted">{link('https://console.cloud.tencent.com/captcha', t('打开验证码控制台'))} · {link('https://console.cloud.tencent.com/cam/capi', t('创建 SecretId / SecretKey'))} · {link('https://cloud.tencent.com/document/product/1110', t('查看 Web 接入文档'))}</small>
        </div>
      </>}
      {provider === 'alibaba' && <>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('服务地域')}</span>
            <Segmented label={t('服务地域')} current={current('security.aliyun_captcha_region') || 'cn-shanghai'} options={[['cn-shanghai', t('中国内地')], ['ap-southeast-1', t('新加坡')]]} onChange={value => onValue('security.aliyun_captcha_region', value)} />
            <small className="text-xs text-muted">{t('决定前端接入区域与服务端接入点，需与阿里云验证码实例所属地域一致。')}</small>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('身份标（prefix）')}</span>
            <Input placeholder="14xxxxxx" value={current('security.aliyun_captcha_prefix') || ''} onChange={event => onValue('security.aliyun_captcha_prefix', event.target.value)} />
            <small className="text-xs text-muted">{t('在控制台概览页实例基本信息中获取')}</small>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('场景 ID')}</span>
          <Input placeholder="1cxxxxxx" value={current('security.aliyun_captcha_scene_id')} onChange={event => onValue('security.aliyun_captcha_scene_id', event.target.value)} />
          <small className="text-xs text-muted">{t('在阿里云验证码控制台创建验证场景后获取；验证方式（无痕/滑块拼图）在控制台按场景配置。')}</small>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">AccessKey ID</span>
            <Input placeholder="LTAI..." value={current('security.aliyun_captcha_access_key_id')} onChange={event => onValue('security.aliyun_captcha_access_key_id', event.target.value)} />
            <small className="text-xs text-muted">{t('用于服务端验证的阿里云 AccessKey ID，建议使用仅含验证码权限的 RAM 子账号。')}</small>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">AccessKey Secret</span>
            {secret('security.aliyun_captcha_access_key_secret', '••••••••')}
            <small className="text-xs text-muted">{t('服务端验证密钥（请保密）')}</small>
          </div>
        </div>
        <small className="text-xs text-muted">{link('https://captcha2.console.aliyun.com', t('打开验证码控制台'))} · {link('https://ram.console.aliyun.com/manage/ak', t('创建 AccessKey'))} · {link('https://help.aliyun.com/zh/captcha/user-guide/overview-of-captcha-2-0', t('查看 Web 接入文档'))}</small>
      </>}
    </CardContent>}
  </Card>;
}

/** One registry entry: boolean switch, known selects, sensitive password with explicit clearing. */
function SettingField({ entry, draft, cleared, onValue, onClear }: {
  entry: SettingEntry;
  draft: Record<string, string>;
  cleared: string[];
  onValue: (key: string, value: string) => void;
  onClear: (key: string) => void;
}) {
  useLocale();
  const current = draft[entry.key] ?? entry.value;
  const id = `setting-${entry.key}`;
  return <div className={cn("flex min-w-0 flex-col gap-1.5", ['site.footer_html', 'maintenance.message', 'account.email_domains', 'account.nickname_blacklist', 'account.username_blacklist', 'account.password_blacklist', 'account.ip_blacklist'].includes(entry.key) && "md:col-span-2")}>
    <label htmlFor={id} className="text-sm font-medium text-ink">{t(entry.label)}</label>
    {entry.value_type === 'boolean'
      ? <Switch id={id} checked={current === 'true'} onChange={checked => onValue(entry.key, String(checked))} />
      : entry.key === 'appearance.theme' || entry.key === 'mail.tls' || entry.key === 'account.email_domain_mode'
        ? <NativeSelect id={id} value={current} onChange={event => onValue(entry.key, event.target.value)} className="max-w-56">
            {(entry.key === 'account.email_domain_mode' ? [['unrestricted', t('不限制')], ['allowlist', t('白名单')], ['blocklist', t('黑名单')]] : entry.key === 'mail.tls'
              ? [['starttls', t('STARTTLS（推荐）')], ['tls', 'SSL/TLS'], ['plain', t('明文（仅本机）')]]
              : [['system', t('跟随系统')], ['light', t('浅色')], ['dark', t('深色')]]
            ).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect>
        : entry.key === 'site.footer_html' || entry.key === 'maintenance.message' || entry.key === 'account.email_domains' || entry.key.endsWith('_blacklist')
          ? <Textarea id={id} rows={4} maxLength={entry.key.startsWith('account.') ? 16000 : entry.key === 'site.footer_html' ? 4000 : 1000} value={current} onChange={event => onValue(entry.key, event.target.value)} />
        : <Input id={id}
            type={entry.sensitive ? 'password' : entry.value_type === 'integer' ? 'number' : ['site.icp_url', 'site.base_url'].includes(entry.key) ? 'url' : entry.key === 'site.admin_email' ? 'email' : 'text'}
            autoComplete={entry.sensitive ? 'new-password' : undefined}
            placeholder={entry.sensitive ? (entry.configured ? t('已配置 · 留空保留') : t('尚未配置')) : undefined}
            value={current}
            onChange={event => onValue(entry.key, event.target.value)} />}
    {entry.sensitive && entry.configured && <div>
      <Button variant="link" size="sm" className="h-auto px-0" onClick={() => onClear(entry.key)}>
        {cleared.includes(entry.key) ? t('保存时将清除') : t('清除已保存密钥')}
      </Button>
    </div>}
    {entry.key === 'account.registration_enabled' && <small className="text-xs text-muted">{t('默认关闭。开启后允许用户自行注册；邮箱验证由独立开关控制。')}</small>}
    {entry.key === 'account.phone_required' && <small className="text-xs text-muted">{t('开启后注册必须填写手机号；仅做格式与唯一性校验，不发送短信验证码。')}</small>}
    {['account.register_rate_minutes', 'account.register_rate_max'].includes(entry.key) && <small className="text-xs text-muted">{t('同一 IP 在窗口分钟数内最多注册上限次数，超出后返回“尝试过于频繁”；两者配合调节注册防刷强度。')}</small>}
    {entry.key === 'security.login_captcha' && <small className="text-xs text-muted">{t('开启后登录页要求输入图形验证码，拦截脚本批量尝试。')}</small>}
    {entry.key === 'security.register_captcha' && <small className="text-xs text-muted">{t('开启后注册页要求输入图形验证码，拦截机器人批量注册。')}</small>}
    {entry.key === 'security.human_check_provider' && <small className="text-xs text-muted">{t('Cloudflare Turnstile 使用站点密钥+服务端密钥；腾讯验证码需要 CaptchaAppId、AppSecretKey 与云 API 密钥；阿里验证码需要 AccessKey 与 SceneId。同一时间只用一家。')}</small>}
    {entry.key === 'account.password_reset_enabled' && <small className="text-xs text-muted">{t('开启后登录页提供“通过邮箱重置密码”入口；须先在邮件设置保存 SMTP 并通过测试。')}</small>}
    {entry.key === 'account.email_login_enabled' && <small className="text-xs text-muted">{t('开启后登录页支持邮箱验证码登录；须先在邮件设置保存 SMTP 并通过测试。')}</small>}
    {entry.key === 'security.login_failure_limit' && <small className="text-xs text-muted">{t('同一 IP 连续登录失败达到此次数后临时封禁，不冻结账号。')}</small>}
    {entry.key === 'security.ip_ban_minutes' && <small className="text-xs text-muted">{t('封禁期间拒绝新的登录尝试；成功登录会清除连续失败计数。')}</small>}
    {['security.user_idle_minutes', 'security.admin_idle_minutes'].includes(entry.key) && <small className="text-xs text-muted">{t('超过此时间没有主动请求时会话失效；后台状态轮询不会延长空闲时间。')}</small>}
    {entry.key === 'security.admin_max_minutes' && <small className="text-xs text-muted">{t('从管理员首次登录计算，活动不会延长此上限；会话有效期同时生效，取较短者。')}</small>}
    {['security.force_admin_2fa', 'security.force_user_2fa'].includes(entry.key) && <small className="text-xs text-muted">{t('对应身份的账号必须先绑定验证器才能使用业务功能，并且不能自行关闭两步验证。')}</small>}
    {entry.key === 'account.email_verification_required' && <small className="text-xs text-muted">{t('开启后需验证邮箱才能激活账号，须先配置并测试 SMTP；关闭后注册立即生效，无需 SMTP。')}</small>}
    {entry.key === 'account.email_domains' && <small className="text-xs text-muted">{t('每行一个邮箱域名，例如 example.com。白名单仅允许列出的后缀，黑名单拒绝列出的后缀；同时限制验证码发送。')}</small>}
    {['account.nickname_blacklist', 'account.username_blacklist'].includes(entry.key) && <small className="text-xs text-muted">{t('每行一条，不区分大小写，包含匹配。命中后禁止注册与资料修改。')}</small>}
    {entry.key === 'account.password_blacklist' && <small className="text-xs text-muted">{t('每行一条，不区分大小写，完整匹配。注册、修改与重置密码时拒绝这些密码。')}</small>}
    {entry.key === 'account.ip_blacklist' && <small className="text-xs text-muted">{t('每行一条，支持单个 IP、CIDR 与末尾通配符，例如 203.0.113.*。命中后禁止注册与登录。')}</small>}
    {entry.key === 'site.base_url' && <small className="text-xs text-muted">{t('用于生成邮件中的链接，填写完整的 HTTP 或 HTTPS 站点地址；留空沿用安装地址。')}</small>}
    {entry.key === 'site.admin_email' && <small className="text-xs text-muted">{t('接收系统告警和通知；留空则不设置默认收件人。')}</small>}
    {entry.key === 'site.footer_html' && <small className="text-xs text-muted">{t('支持段落、列表、强调和 HTTP/HTTPS 链接；不支持脚本、样式或嵌入内容。')}</small>}
    {entry.key === 'maintenance.enabled' && <small className="text-xs text-muted">{t('默认关闭。开启后暂停用户访问和 API 操作，管理员仍可登录后台关闭维护。')}</small>}
    {entry.key === 'site.home_enabled' && <small className="text-xs text-muted">{t('默认关闭。开启后未登录访问站点根路径会跳转到 /home 产品首页，已登录用户直接进入工作空间。')}</small>}
    {entry.key === 'site.icp_url' && <small className="text-xs text-muted">{t('HTTPS 查询链接；备案号留空时隐藏页脚备案信息。')}</small>}
    {entry.key === 'mail.from_name' && <small className="text-xs text-muted">{t('留空时使用邮件中的站点名称；修改别名不影响 SMTP 连通性验证。')}</small>}
    {entry.key === 'admin.path' && <small className="text-xs text-muted">{t('配置错误可用 APP_ADMIN_PATH 恢复；接口仍执行权限检查。')}</small>}
    {entry.key === 'logging.retention_days' && <small className="text-xs text-muted">{t('0 表示永久保留；超过保留天数或总量上限的轮转日志按天清理，保存后立即生效。需要部署侧已开启文件日志（APP_LOG_FILE）。')}</small>}
  </div>;
}

function MailTest({ web, canWrite, dirty, revision }: { web: WebClient; canWrite: boolean; dirty: boolean; revision: number }) {
  useLocale();
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const policy = useQuery({ queryKey: ['mail-policy', revision], queryFn: () => web.authPolicy() });
  const test = useMutation({
    mutationFn: (recipient: string) => web.testMail(recipient),
    onSuccess: () => { message.success(t('测试邮件已发送，可开启邮件账号流程。')); setOpen(false); void policy.refetch(); },
  });
  const form = useAppForm<{ recipient: string }>({
    schema: 'MailTestInput',
    defaultValues: { recipient: '' },
    onSubmit: values => test.mutate(values.recipient),
  });
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-alt px-3 py-2.5">
    <div>
      <strong className="text-sm text-ink">{policy.data?.mail_ready ? t('SMTP 配置已通过测试') : t('SMTP 配置尚未通过测试')}</strong>
      <p className="text-xs text-muted">{t('保存邮件配置后，发送一封测试邮件确认连接与模板正常。')}</p>
    </div>
    <Button variant="secondary" disabled={!canWrite || dirty} onClick={() => { test.reset(); form.reset({ recipient: '' }); setOpen(true); }}>{t('发送测试')}</Button>
    {dirty && <p className="w-full text-xs text-muted">{t('请先保存设置。')}</p>}
    {open && <Modal title={t('发送测试邮件')} pending={test.isPending} onClose={() => setOpen(false)}>
      <AppForm form={form} className="flex flex-col gap-3">
        <AppField name="recipient" label={t('测试收件邮箱')}>
          <Input type="email" required maxLength={254} />
        </AppField>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" disabled={test.isPending} onClick={() => setOpen(false)}>{t('关闭')}</Button>
          <Button type="submit" pending={test.isPending} disabled={test.isPending || dirty}>{test.isPending ? t('正在发送…') : t('发送测试邮件')}</Button>
        </div>
      </AppForm>
    </Modal>}
  </div>;
}

function OidcConnection({ web, dirty, revision }: { web: WebClient; dirty: boolean; revision: number }) {
  useLocale();
  const message = useMessage();
  const info = useQuery({ queryKey: ['oidc-settings', revision], queryFn: () => web.oidcInfo() });
  const [endpoints, setEndpoints] = useState<OIDCCheckInfo | null>(null);
  const check = useMutation({
    mutationFn: () => web.oidcCheck(),
    onSuccess: result => { setEndpoints(result); message.success(t('发现文档及端点检查通过，请继续验证实际登录。')); },
  });
  return <Card>
    <CardHeader>
      <CardTitle><Building2 size={18} className="text-accent" aria-hidden="true" />{t('企业身份服务检查')}</CardTitle>
      <CardDescription>{t('在身份服务中登记以下固定回调地址。')}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-2">
      {info.data && <code className="oidc-callback block overflow-x-auto rounded-md bg-surface-alt px-3 py-2 font-mono text-xs text-ink">{info.data.callback_url}</code>}
      {info.error && <p role="alert" className="text-sm text-danger">{t(info.error.message)}</p>}
      <p className="text-xs text-muted">{t('保存配置后检查发现文档与端点。此检查不验证 Client Secret；请完成一次实际登录以确认接入。始终保留本地管理员账号。')}</p>
      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={dirty || check.isPending} pending={check.isPending} onClick={() => check.mutate()}>{t('检查已保存的连接')}</Button>
        {dirty && <p className="text-xs text-muted">{t('请先保存设置。')}</p>}
      </div>
      {endpoints && <dl className="flex flex-col gap-1 rounded-md border border-line bg-surface-alt p-3 text-xs" aria-label={t('生效端点')}>
        {([[t('授权端点'), endpoints.authorization_url], [t('令牌端点'), endpoints.token_url], [t('userinfo 端点'), endpoints.userinfo_url], ['JWKS', endpoints.jwks_url]] as const).map(([name, value]) => (
          <div key={name} className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted">{name}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-ink">{value || '—'}</dd>
          </div>
        ))}
      </dl>}
    </CardContent>
  </Card>;
}
