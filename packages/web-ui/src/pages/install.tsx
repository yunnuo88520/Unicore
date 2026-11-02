// Author: yunnuo <ymz@ebox.vip>
// Description: First-run installation wizard on the shared form layer: environment, profile, database and administrator.
import { t, useLocale, defineMessages } from '../i18n';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { Bootstrap, DatabaseCheck, DatabaseInput, InstallInput, InstallResult, WebClient } from '@unicore/sdk';
import type { PageProps } from '../router';
import { BrandLockup } from '../brand';
import { productName, productSlug } from '../product.gen';
import { AppForm, useAppForm } from '../lib/form';
import { Button, Checkbox, Input, SimpleSelect } from '../ui';
import { cn } from '../lib/cn';

type Profile = Bootstrap['profile'];
type WizardDatabase = { driver: DatabaseInput['driver']; dsn: string; host: string; port: number; name: string; username: string; password: string; tls: boolean };
type WizardValues = {
  profile: Profile;
  database: WizardDatabase;
  site_name: string;
  base_url: string;
  admin_username: string;
  admin_email: string;
  admin_password: string;
  reset_database: boolean;
  database_confirmation: string;
};
type StepKey = 'credentials' | 'profile' | 'database' | 'admin' | 'confirm';

// Validation messages reuse contract wording so the catalog stays the single source.
const MESSAGES = defineMessages({
  required: '此项为必填',
  pattern: '格式不正确',
  email: '请输入有效邮箱',
  atLeast12: '至少 12 个字符',
  atLeast32: '至少 32 个字符',
});
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/;
const ACCOUNT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_MIN = 32;
const TOKEN_MAX = 256;

function defaults(driver: WizardDatabase['driver']): WizardDatabase {
  return driver === 'sqlite'
    ? { driver, dsn: '', host: '', port: 3306, name: '', username: '', password: '', tls: false }
    : { driver, dsn: '', host: '127.0.0.1', port: driver === 'mysql' ? 3306 : 5432, name: productSlug, username: driver === 'mysql' ? 'root' : 'postgres', password: '', tls: false };
}

/** The wizard keeps every field defined for the form layer; SQLite payloads stay minimal like the contract expects. */
function payloadDatabase(database: WizardDatabase): DatabaseInput {
  return database.driver === 'sqlite'
    ? { driver: 'sqlite', dsn: '' }
    : { driver: database.driver, dsn: '', host: database.host, port: database.port, name: database.name, username: database.username, password: database.password, tls: database.tls };
}

function stepListFor(profile: Profile): StepKey[] {
  return profile === 'web-platform' ? ['credentials', 'profile', 'database', 'admin', 'confirm'] : ['credentials', 'profile', 'database', 'confirm'];
}

export function InstallPage({ client, metadata, refresh }: PageProps) {
  const router = useRouter();
  if (!client.web) return null;
  return <InstallWizard web={client.web} initialProfile={metadata.profile} onDone={result => {
    if (result.profile === 'web-platform') { window.location.assign(result.admin_url); return; }
    window.history.replaceState({}, '', '/');
    void router.navigate({ to: '/' });
    refresh();
  }} />;
}

function InstallWizard({ web, initialProfile, onDone }: { web: WebClient; initialProfile: Bootstrap['profile']; onDone: (result: InstallResult) => void }) {
  useLocale();
  const status = useQuery({ queryKey: ['install-status'], queryFn: () => web.installStatus() });
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [result, setResult] = useState<InstallResult>();
  const complete = useMutation({ mutationFn: (input: InstallInput) => web.completeInstall(token, input) });
  const verify = useMutation({ mutationFn: (value: { token: string; database: DatabaseInput }) => web.verifyDatabase(value.token, value.database) });
  // The form layer binds onSubmit once; mirrors keep the handler in sync with wizard control state.
  const mirrors = useRef({ step: 0, token: '', canContinue: false });
  const validateRef = useRef<(target: number) => Promise<boolean>>(async () => true);
  const form = useAppForm<WizardValues>({
    schema: 'InstallInput',
    defaultValues: {
      profile: initialProfile === 'web-platform' ? 'web-platform' : 'web-standalone',
      database: defaults('mysql'),
      site_name: productName,
      base_url: window.location.origin,
      admin_username: '',
      admin_email: '',
      admin_password: '',
      reset_database: false,
      database_confirmation: '',
    },
    onSubmit: async values => {
      const { step: currentStep } = mirrors.current;
      const list = stepListFor(values.profile);
      if (currentStep < list.length - 1) {
        if (await validateRef.current(currentStep)) setStep(value => value + 1);
        return;
      }
      const saved = await complete.mutateAsync({
        profile: values.profile,
        database: payloadDatabase(values.database),
        site_name: values.site_name,
        base_url: values.base_url,
        admin_username: values.admin_username,
        admin_email: values.admin_email,
        admin_password: values.admin_password,
        reset_database: values.reset_database,
        database_confirmation: values.database_confirmation,
      }).catch(error => { form.applyServerError(error); return null; });
      if (saved) {
        setResult(saved);
        setToken('');
        form.setValue('database', { ...values.database, dsn: '', password: '' });
        form.setValue('admin_password', '');
      }
    },
  });
  const input = form.watch();
  const stepList = stepListFor(input.profile);
  const current = stepList[step];
  const titles: Record<StepKey, string> = { credentials: t('环境与凭据'), profile: t('运行形态'), database: t('数据库'), admin: t('管理员'), confirm: t('确认安装') };
  const last = step === stepList.length - 1;
  const check: DatabaseCheck | undefined = verify.isSuccess && verify.variables.token === token
    && JSON.stringify(verify.variables.database) === JSON.stringify(payloadDatabase(input.database)) ? verify.data : undefined;
  const occupied = !!check && check.table_count > 0;
  const resetAllowed = !!check && (check.reset_allowed ?? !check.initialized);
  const canContinue = !!check && resetAllowed && (!occupied || (input.reset_database && input.database_confirmation === check.database_name));
  mirrors.current = { step, token, canContinue };
  function dbError(field: keyof WizardDatabase): string | undefined {
    const message = form.formState.errors.database?.[field]?.message;
    return typeof message === 'string' ? t(message) : undefined;
  }
  function topError(field: 'site_name' | 'admin_username' | 'admin_email' | 'admin_password'): string | undefined {
    const message = form.formState.errors[field]?.message;
    return typeof message === 'string' ? t(message) : undefined;
  }
  function updateDatabase(patch: Partial<WizardDatabase>) {
    form.setValue('database', { ...form.getValues('database'), ...patch });
    form.setValue('reset_database', false);
    form.setValue('database_confirmation', '');
    verify.reset();
    complete.reset();
  }
  async function validateStep(target: number): Promise<boolean> {
    const key = stepListFor(form.getValues('profile'))[target];
    if (key === 'credentials') {
      const ok = token.length >= TOKEN_MIN && token.length <= TOKEN_MAX;
      setTokenError(ok ? '' : token.length < TOKEN_MIN ? t(MESSAGES.atLeast32) : t('最多 {{count}} 个字符', { count: TOKEN_MAX }));
      return ok;
    }
    if (key === 'database') {
      if (!canContinue) return false;
      if (form.getValues('database').driver === 'sqlite') return true;
      if (!(await form.trigger(['database.host', 'database.port', 'database.name', 'database.username', 'database.password']))) return false;
      const database = form.getValues('database');
      let ok = true;
      if (!database.host.trim()) { form.setError('database.host', { type: 'manual', message: MESSAGES.required }); ok = false; }
      if (!database.name.trim()) { form.setError('database.name', { type: 'manual', message: MESSAGES.required }); ok = false; }
      else if (!DATABASE_NAME_PATTERN.test(database.name)) { form.setError('database.name', { type: 'manual', message: MESSAGES.pattern }); ok = false; }
      if (!database.username.trim()) { form.setError('database.username', { type: 'manual', message: MESSAGES.required }); ok = false; }
      return ok;
    }
    if (key === 'admin') {
      const values = form.getValues();
      let ok = true;
      if (!values.site_name.trim()) { form.setError('site_name', { type: 'manual', message: MESSAGES.required }); ok = false; }
      if (!values.admin_username.trim()) { form.setError('admin_username', { type: 'manual', message: MESSAGES.required }); ok = false; }
      else if (!ACCOUNT_PATTERN.test(values.admin_username)) { form.setError('admin_username', { type: 'manual', message: MESSAGES.pattern }); ok = false; }
      if (!values.admin_email.trim()) { form.setError('admin_email', { type: 'manual', message: MESSAGES.required }); ok = false; }
      else if (!EMAIL_PATTERN.test(values.admin_email)) { form.setError('admin_email', { type: 'manual', message: MESSAGES.email }); ok = false; }
      if (values.admin_password.length < 12) { form.setError('admin_password', { type: 'manual', message: MESSAGES.atLeast12 }); ok = false; }
      return ok;
    }
    return true;
  }
  validateRef.current = validateStep;
  async function advance() {
    if (await validateStep(step)) setStep(value => value + 1);
  }
  function testConnection() {
    // The connection probe must stay runnable before any check exists; consent only gates the next step.
    verify.mutate({ token, database: payloadDatabase(form.getValues('database')) });
  }
  return <main className="flex min-h-dvh w-full flex-1 flex-col items-center px-4 py-10 sm:px-6">
    <div className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-ink [&_.brand-dot]:text-primary max-sm:me-20"><BrandLockup /></div>
    <div className="mt-7 w-full max-w-4xl rounded-xl border border-line bg-surface p-5 shadow-card sm:p-10">
      <header className="flex flex-col gap-1.5">
        <p className="text-2xs font-medium tracking-[2px] text-muted">WELCOME TO {productName.toUpperCase()}</p>
        <h1 className="text-2xl font-semibold text-ink">{result ? t('一切就绪，开始构建') : t('为你的产品，准备一个起点')}</h1>
        <p className="text-sm text-muted">{result ? t('安装信息已持久化并生成 install.lock；一次性安装凭据已失效。') : t('只需几步，完成这个实例的安装配置。')}</p>
      </header>
      {result ? <div className="mt-6 flex flex-col items-start gap-3">
        <CheckCircle2 size={44} className="text-success" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{t('安装完成')}</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-sm">
          <dt className="text-muted">{t('运行形态')}</dt><dd className="text-ink">{result.profile === 'web-platform' ? t('Web 多用户平台') : t('Web 单机')}</dd>
          <dt className="text-muted">{t('用户入口')}</dt><dd className="break-all text-ink"><a className="text-accent underline underline-offset-4" href={result.site_url}>{result.site_url}</a></dd>
          {result.admin_url ? <><dt className="text-muted">{t('管理后台')}</dt><dd className="break-all text-ink"><a className="text-accent underline underline-offset-4" href={result.admin_url}>{result.admin_url}</a></dd></>
            : <><dt className="text-muted">{t('设置入口')}</dt><dd className="break-all text-ink"><a className="text-accent underline underline-offset-4" href={result.settings_url}>{result.settings_url}</a></dd></>}
        </dl>
        <Button onClick={() => onDone(result)}>{t('进入工作空间')}<ArrowRight size={15} aria-hidden="true" /></Button>
      </div> : <>
        <ol className="mt-7 grid grid-cols-1 gap-3 border-b border-line pb-6 sm:grid-cols-5">
          {stepList.map((key, index) => <li key={key} aria-current={index === step ? 'step' : undefined} className={cn('flex min-w-0 items-center gap-2.5 text-sm', index <= step ? 'text-ink' : 'text-muted')}>
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
              index < step ? 'bg-primary text-on-primary' : index === step ? 'border border-primary text-primary' : 'bg-surface-alt text-muted')}>
              {index < step ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}
            </span>
            <span className="font-medium">{titles[key]}</span>
          </li>)}
        </ol>
        <AppForm form={form} className="mt-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">{titles[current]}</h2>
          {current === 'credentials' && <>
            <div className="flex flex-col gap-2.5 rounded-lg bg-surface-alt px-3.5 py-3">
              {status.isPending ? <p role="status" className="text-sm text-muted">{t('正在检查环境…')}</p>
                : status.isError ? <p role="alert" className="text-sm text-danger">{t(status.error.message)}</p>
                : status.data.checks.map(item => <div key={item.name} className="flex items-start gap-2">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    <span className="flex flex-col">
                      <strong className="text-sm font-medium text-ink">{t(item.name)}</strong>
                      <small className="text-xs text-muted">{t(item.detail)}</small>
                    </span>
                  </div>)}
            </div>
            {status.data?.status === 'INSTALL_FAILED' && <p className="text-sm text-muted">{t('上次安装未完成。修正配置后可持原凭据重试；已完成的实例不会再次安装。')}</p>}
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              {t('一次性安装凭据')}
              <Input name="bootstrap_token" type="password" autoComplete="off" maxLength={TOKEN_MAX} aria-invalid={tokenError ? true : undefined} value={token} onChange={event => { setToken(event.target.value); setTokenError(''); verify.reset(); }} />
            </label>
            {tokenError && <p role="alert" className="text-xs text-danger">{tokenError}</p>}
            <p className="text-sm leading-relaxed text-muted">{t('用于确认你拥有服务器，防止他人抢先创建管理员。服务器首次启动已自动生成，请从私有数据目录的 bootstrap.token 文件读取；它与加密密钥不同，也不会存入浏览器。凭据失效时，删除数据目录中的 bootstrap.token 并重启服务即可重新生成。')}</p>
          </>}
          {current === 'profile' && <>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('运行形态')}>
              {(['web-platform', 'web-standalone'] as const).map(profile => <label key={profile}
                className={cn('flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors', input.profile === profile ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-alt')}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="profile" className="size-4 accent-primary" checked={input.profile === profile}
                    onChange={() => { form.setValue('profile', profile); form.setValue('site_name', productName); }} />
                  <strong className="text-sm text-ink">{profile === 'web-platform' ? t('多用户平台') : t('单机模式')}</strong>
                </span>
                <small className="text-xs text-muted">{profile === 'web-platform' ? t('独立账号、角色权限与管理后台') : t('个人工作空间，无用户和登录流程')}</small>
              </label>)}
            </div>
            <p className="text-sm text-muted">{t('安装完成后固定运行形态，更改模式需要独立部署与数据迁移。')}</p>
          </>}
          {current === 'database' && <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{t('数据库类型')}</span>
              <SimpleSelect label={t('数据库类型')} value={input.database.driver} onChange={value => updateDatabase(defaults(value as WizardDatabase['driver']))}
                options={[{ value: 'mysql', label: t('MySQL · 在线部署推荐') }, { value: 'postgres', label: t('PostgreSQL · 在线部署推荐') }, { value: 'sqlite', label: t('SQLite · 本机或小型测试') }]} />
            </div>
            {input.database.driver === 'sqlite' ? <p className="text-sm text-muted">{t('文件固定保存在服务器私有数据目录 unicore.db，支持测试连接。在线多用户部署推荐 MySQL 或 PostgreSQL。')}</p> : <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow label={t('数据库地址')} error={dbError('host')}>
                  <Input value={input.database.host ?? ''} maxLength={253} onChange={event => updateDatabase({ host: event.target.value })} />
                </FieldRow>
                <FieldRow label={t('数据库端口')} error={dbError('port')}>
                  <Input type="number" min={1} max={65535} value={input.database.port || ''} onChange={event => updateDatabase({ port: event.target.valueAsNumber || 0 })} />
                </FieldRow>
                <FieldRow label={t('数据库名')} error={dbError('name')}>
                  <Input value={input.database.name ?? ''} maxLength={63} onChange={event => updateDatabase({ name: event.target.value })} />
                </FieldRow>
                <FieldRow label={t('数据库用户名')} error={dbError('username')}>
                  <Input value={input.database.username ?? ''} maxLength={128} autoComplete="off" onChange={event => updateDatabase({ username: event.target.value })} />
                </FieldRow>
                <FieldRow label={t('数据库密码')} error={dbError('password')}>
                  <Input type="password" maxLength={1024} autoComplete="new-password" value={input.database.password ?? ''} onChange={event => updateDatabase({ password: event.target.value })} />
                </FieldRow>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">{t('数据库 TLS')}</span>
                  <SimpleSelect label={t('数据库 TLS')} value={input.database.tls ? 'on' : 'off'} onChange={value => updateDatabase({ tls: value === 'on' })}
                    options={[{ value: 'off', label: t('关闭 · 本机或内网直连') }, { value: 'on', label: t('开启 · 加密连接，不校验证书') }]} />
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted">{t('请先创建当前实例独占的数据库并授权。安装会初始化目标库；已有表和视图的数据会在明确确认后清空，请提前备份。连接信息加密保存。目标库未启用 TLS 时保持默认关闭；开启后仅加密传输，不校验服务器证书，内网自签名证书可直接使用。')}{input.database.driver === 'postgres' && t(' PostgreSQL 使用独占的 public schema。')}</p>
            </>}
            <div>
              <Button type="button" variant="secondary" pending={verify.isPending} onClick={() => void testConnection()}>{t('测试连接')}</Button>
            </div>
            {verify.isError && <p role="alert" className="text-sm text-danger">{t(verify.error.message)}</p>}
            {check && <>
              <p role="status" className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 size={16} aria-hidden="true" />{t('连接测试成功')}</p>
              {!resetAllowed ? <p role="alert" className="text-sm text-danger">{t('此数据库属于其他实例或无法确认归属，禁止覆盖。请使用新的空数据库，或恢复原实例配置。')}</p>
                : occupied ? <div className="flex flex-col gap-2 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3">
                    {check.initialized && <p className="text-sm text-danger">{t('已识别为本站原数据库。重新安装会删除原账号、设置和业务数据，不会保留原站内容。')}</p>}
                    <strong className="text-sm text-danger">{t('将清空数据库 {{name}}', { name: check.database_name })}</strong>
                    <p className="text-sm text-danger">{t('检测到 {{count}} 个表或视图。完成安装将删除这些对象及其数据，此操作无法撤销；请先备份。', { count: check.table_count })}</p>
                    <Checkbox checked={input.reset_database} onChange={value => form.setValue('reset_database', value)}>{t('我已备份，确认清空目标数据库并初始化')}</Checkbox>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                      {t('输入数据库名确认')}
                      <Input value={input.database_confirmation ?? ''} autoComplete="off" onChange={event => form.setValue('database_confirmation', event.target.value)} />
                    </label>
                  </div>
                : <p className="text-sm text-muted">{t('目标数据库为空，安装将创建所选形态需要的表和初始配置。')}</p>}
            </>}
          </>}
          {current === 'admin' && <>
            <FieldRow label={t('站点名称')} error={topError('site_name')}>
              <Input value={input.site_name} maxLength={64} onChange={event => form.setValue('site_name', event.target.value)} />
            </FieldRow>
            <FieldRow label={t('管理员账号')} error={topError('admin_username')}>
              <Input value={input.admin_username} maxLength={64} autoComplete="username" onChange={event => form.setValue('admin_username', event.target.value)} />
            </FieldRow>
            <FieldRow label={t('管理员邮箱')} error={topError('admin_email')}>
              <Input type="email" value={input.admin_email} autoComplete="email" onChange={event => form.setValue('admin_email', event.target.value)} />
            </FieldRow>
            <FieldRow label={t('管理员密码')} error={topError('admin_password')}>
              <Input type="password" maxLength={128} autoComplete="new-password" value={input.admin_password} onChange={event => form.setValue('admin_password', event.target.value)} />
            </FieldRow>
            <p className="text-sm text-muted">{t('至少 12 字节，最多 128 字节，使用 Argon2id，不保存明文。')}</p>
          </>}
          {current === 'confirm' && <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 rounded-lg bg-surface-alt px-3.5 py-3 text-sm">
              <dt className="text-muted">{t('站点')}</dt><dd className="text-ink">{input.site_name}</dd>
              <dt className="text-muted">{t('形态')}</dt><dd className="text-ink">{input.profile === 'web-platform' ? t('多用户平台') : t('单机模式')}</dd>
              <dt className="text-muted">{t('数据库')}</dt><dd className="text-ink">{input.database.driver}{check && ` · ${check.database_name}`}</dd>
              {input.profile === 'web-platform' && <><dt className="text-muted">{t('管理员')}</dt><dd className="text-ink">{input.admin_username}</dd></>}
            </dl>
            {input.reset_database && <p role="alert" className="text-sm text-danger">{t('你已确认清空 {{name}} 中的现有表、视图及数据，再初始化安装。', { name: input.database_confirmation })}</p>}
            <p className="text-sm leading-relaxed text-muted">{t('安装记录、连接配置和密钥保存在服务器私有数据目录。重启、更新或替换容器时保留此目录，即可自动恢复。仅服务器管理员停服删除 install.lock 并重启后，才能重新进入安装向导。')}</p>
          </>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {step > 0 ? <Button type="button" variant="secondary" disabled={complete.isPending} onClick={() => { setStep(value => value - 1); complete.reset(); }}>{t('上一步')}</Button> : <span />}
            {last
              ? <Button key="install-finish" type="submit" disabled={complete.isPending}>
                  {complete.isPending && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}{t('完成安装')}<ArrowRight size={14} aria-hidden="true" />
                </Button>
              : <Button key="install-next" type="button" disabled={complete.isPending || (step === 0 && (status.isError || status.isPending)) || (current === 'database' && !canContinue)} onClick={() => void advance()}>
                  {t('下一步')}<ArrowRight size={14} aria-hidden="true" />
                </Button>}
          </div>
        </AppForm>
      </>}
    </div>
    <p className="mt-6 text-xs text-muted">{productName}{t('· yunnuo · 首次安装后自动恢复实例')}</p>
  </main>;
}

function FieldRow({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
    {label}
    {children}
    {error && <span role="alert" className="text-xs font-normal text-danger">{error}</span>}
  </label>;
}
