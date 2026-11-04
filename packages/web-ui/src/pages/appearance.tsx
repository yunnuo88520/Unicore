// Author: yunnuo <ymz@ebox.vip>
// Description: Device appearance settings for users, plus the administrator settings sections (base tabs and mail).
import { defineMessages, t, useLocale } from '../i18n';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Building2, CheckCircle2, Monitor, Moon, Save, Sun, type LucideIcon } from 'lucide-react';
import { invalidateAfter } from '../queries';
import { AppearanceDrawer } from '../appearance-drawer';
import { BrandingPanel } from '../branding-panel';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Modal, NativeSelect, Switch, Tabs, Textarea, useMessage } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { AppField, AppForm, useAppForm } from '../lib/form';
import { useRouteSearch, type PageProps } from '../router';
import type { AppClient, Bootstrap, SettingPatch, WebClient } from '@unicore/sdk';
import type { Theme } from '@unicore/theme';

/** Shape of one settings registry row as delivered by client.settings(). */
type SettingEntry = { key: string; value: string; value_type: string; group: string; label: string; sensitive: boolean; configured?: boolean };

const groupNames: Record<string, string> = defineMessages({ site: '站点信息', maintenance: '维护模式', registration: '注册设置', appearance: '默认外观', admin: '后台入口', security: '安全', account: '账号流程', mail: '邮件服务', oidc: '企业登录（OIDC）' });
const baseSections = defineMessages([
  { id: 'site', label: '基础信息', groups: ['site'] },
  { id: 'branding', label: '品牌图片', groups: [] },
  { id: 'appearance', label: '外观设置', groups: ['appearance'] },
  { id: 'security', label: '安全与控制', groups: ['admin'] },
  { id: 'registration', label: '注册设置', groups: ['registration'] },
  { id: 'maintenance', label: '维护模式', groups: ['maintenance'] },
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
  return <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={t('界面主题')}>
    {themeChoices.map(({ id, title, detail, icon: Icon }) => {
      const selected = theme === id;
      return <button key={id} type="button" disabled={disabled} aria-pressed={selected} onClick={() => onChange(id)}
        className={cn('flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55',
          selected ? 'border-primary-line bg-primary-soft' : 'border-line bg-surface hover:border-primary-line')}>
        <ThemePreview variant={id} />
        <strong className="flex items-center gap-1.5 text-sm font-medium text-ink"><Icon size={16} aria-hidden="true" />{t(title)}{selected && <CheckCircle2 size={16} className="text-success" aria-hidden="true" />}</strong>
        <small className="text-2xs text-muted">{t(detail)}</small>
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
  return <span aria-hidden="true" className="flex h-14 w-full gap-1 rounded-md border border-line p-1.5" style={{ background }}>
    <span className="flex w-1/4 flex-col gap-1 rounded-xs p-1" style={{ background: track }}>
      <i className="h-1 w-full rounded-full" style={{ background: line }} />
      <i className="h-1 w-2/3 rounded-full" style={{ background: line }} />
    </span>
    <span className="flex flex-1 flex-col gap-1 pt-1">
      <i className="h-1.5 w-1/2 rounded-full" style={{ background: line }} />
      <i className="h-1 w-full rounded-full" style={{ background: track }} />
      <i className="h-1 w-3/4 rounded-full" style={{ background: track }} />
      <i className="h-3 w-full rounded-xs" style={{ background: track }} />
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
    },
  });
  if (query.isPending) return <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取设置…')}</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
    <p className="text-sm text-muted">{t(query.error.message)}</p>
    <Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button>
  </CardContent></Card>;
  const localAppearance = metadata.profile === 'web-platform';
  const candidates = section === 'security' ? [{id:'security',label:t('账户安全'),groups:['security']}] : section === 'mail' ? [{ id: 'mail', label: t('邮件设置'), groups: ['mail', 'account'] }] : baseSections;
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
          {group === 'account' && <p className="text-xs text-muted">{t('先保存 SMTP 配置并发送测试，成功后再开启账号邮件流程。')}</p>}
          {group === 'mail' && <p className="text-xs text-muted">{t('建议 STARTTLS（587）或 TLS（465）；明文仅允许本机测试。保存后点击下方“发送测试”验证连接。')}</p>}
          {group === 'oidc' && <p className="text-xs text-muted">{t('支持授权码 + PKCE；保存后在本页检查连接，再完成一次实际登录。')}</p>}
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            {query.data.items.filter(item => item.group === group).map(entry => <SettingField key={entry.key} entry={entry} draft={draft} cleared={cleared}
              onValue={(key, value) => {
                setDraft(current => ({ ...current, [key]: value }));
                setCleared(current => current.filter(item => item !== key));
              }}
              onClear={key => {
                setDraft(current => ({ ...current, [key]: '' }));
                setCleared(current => current.includes(key) ? current : [...current, key]);
              }} />)}
          </div>
        </fieldset>)}
      </CardContent>
    </Card>}
    {client.web && section === 'mail' && <MailTest web={client.web} canWrite dirty={dirty('mail') || dirty('account')} revision={query.dataUpdatedAt} />}
    {client.web && active.id === 'oidc' && <OidcConnection key={query.dataUpdatedAt} web={client.web} dirty={dirty('oidc')} revision={query.dataUpdatedAt} />}
  </div>;
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
              ? [['starttls', 'STARTTLS'], ['tls', 'TLS'], ['plain', t('明文（仅本机）')]]
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
    {entry.key === 'site.icp_url' && <small className="text-xs text-muted">{t('HTTPS 查询链接；备案号留空时隐藏页脚备案信息。')}</small>}
    {entry.key === 'mail.from_name' && <small className="text-xs text-muted">{t('留空时使用邮件中的站点名称；修改别名不影响 SMTP 连通性验证。')}</small>}
    {entry.key === 'admin.path' && <small className="text-xs text-muted">{t('配置错误可用 APP_ADMIN_PATH 恢复；接口仍执行权限检查。')}</small>}
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
  const check = useMutation({
    mutationFn: () => web.oidcCheck(),
    onSuccess: () => message.success(t('发现文档及端点检查通过，请继续验证实际登录。')),
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
    </CardContent>
  </Card>;
}
