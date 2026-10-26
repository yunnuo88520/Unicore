/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared UI client; pages know neither fetch nor Wails globals.
 */
import type { Bootstrap, BootstrapResponse, ExecuteInput, ExecuteOutput, ExecuteResponse, InstallStatus, InstallInput, InstallResult, DatabaseInput, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, Settings, SettingsResponse, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleInput, RoleList, RoleOptions, PermissionDefinition } from '@unicore/contracts';

export type { Bootstrap, ExecuteInput, ExecuteOutput, Profile, InstallStatus, InstallInput, InstallResult, DatabaseInput, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, Settings, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleInput, RoleList, RoleOptions, PermissionDefinition } from '@unicore/contracts';

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId = '') { super(message); this.name = 'AppError'; }
}

export interface AppClient {
  readonly transport: 'http' | 'wails';
  bootstrap(): Promise<Bootstrap>;
  execute(input: ExecuteInput): Promise<ExecuteOutput>;
  settings?(): Promise<Settings>;
  patchSettings?(input: SettingPatch): Promise<Settings>;
  web?: WebClient;
}

export interface WebClient {
 registerCode(input:RegisterInput):Promise<EmailChallenge>;
 requestCode(purpose:"verify"|"reset"|"login",input:EmailRequest):Promise<EmailChallenge>;
 completeCode(purpose:"verify"|"reset"|"login",input:EmailCodeInput):Promise<Session|{success:boolean}>;
 mailTemplates():Promise<MailTemplateList>;
 authPolicy(): Promise<AuthPolicy>;
 register(input:RegisterInput):Promise<{success:boolean}>;
 requestVerification(input:EmailRequest):Promise<{success:boolean}>;
 verifyEmail(token:string):Promise<{success:boolean}>;
 requestPasswordReset(input:EmailRequest):Promise<{success:boolean}>;
 resetPassword(input:ResetInput):Promise<{success:boolean}>;
 testMail(recipient:string):Promise<{success:boolean}>;
 mailJobs():Promise<MailJobList>;
  installStatus(): Promise<InstallStatus>;
  verifyDatabase(token: string, input: DatabaseInput): Promise<{ success: boolean }>;
  completeInstall(token: string, input: InstallInput): Promise<InstallResult>;
  captcha(): Promise<Captcha>;
  login(input: LoginInput): Promise<Session>;
  logout(): Promise<{ success: boolean }>;
  dashboard(): Promise<Dashboard>;
  users(search: string, page: number): Promise<UserList>;
  createUser(input: UserCreate): Promise<User>;
  updateUser(id: string, input: UserUpdate): Promise<User>;
  roles(): Promise<RoleList>;
  roleOptions(): Promise<RoleOptions>;
  createRole(input: RoleInput): Promise<Role>;
  updateRole(id: string, input: RoleInput): Promise<Role>;
  deleteRole(id: string): Promise<{ success: boolean }>;
}

function unwrap<T>(response: { code: string; message: string; data: T; request_id: string }): T {
  if (response.code !== 'OK') throw new AppError(response.code, response.message, response.request_id);
  return response.data;
}

export class HttpTransport implements AppClient, WebClient {
  readonly transport = 'http' as const;
  readonly web: WebClient = this;
  private csrf = '';
  private platform = false;
  constructor(private readonly baseURL = '', private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    const headers = new Headers(init?.headers);
    if (this.csrf) headers.set('X-CSRF-Token', this.csrf);
    try { response = await this.fetcher(`${this.baseURL}/api/v1${path}`, { credentials: 'same-origin', ...init, headers, signal: AbortSignal.timeout(20000) }); }
    catch { throw new AppError('NETWORK_ERROR', '连接服务失败，请确认 Go 服务正在运行'); }
    let envelope: { code: string; message: string; data: T; request_id: string };
    try { envelope = await response.json(); }
    catch { throw new AppError('INVALID_RESPONSE', '服务返回了无法识别的响应'); }
    if (!response.ok && envelope.code === 'OK') throw new AppError('HTTP_ERROR', `服务请求失败 (${response.status})`);
    return unwrap(envelope);
  }
  async bootstrap() { const data = await this.request<Bootstrap>('/bootstrap'); this.csrf = data.csrf_token ?? ''; this.platform = data.profile === 'web-platform'; return data; }
  execute(input: ExecuteInput) { return this.request<ExecuteOutput>('/core/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  private send<T>(path: string, input: unknown, method = 'POST', headers: Record<string, string> = {}) { return this.request<T>(path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) }); }
  registerCode(input:RegisterInput){return this.send<EmailChallenge>('/auth/email/register',input);}
 requestCode(purpose:'verify'|'reset'|'login',input:EmailRequest){return this.send<EmailChallenge>(`/auth/email/${purpose}/request`,input);}
 async completeCode(purpose:'verify'|'reset'|'login',input:EmailCodeInput){const result=await this.send<Session|{success:boolean}>(`/auth/email/${purpose}/complete`,input);if('csrf_token' in result)this.csrf=result.csrf_token;return result;}
 mailTemplates(){return this.request<MailTemplateList>('/admin/settings/mail/templates');}
 authPolicy(){return this.request<AuthPolicy>('/auth/policy');}
 register(input:RegisterInput){return this.send<{success:boolean}>('/auth/register',input);}
 requestVerification(input:EmailRequest){return this.send<{success:boolean}>('/auth/verification/request',input);}
 verifyEmail(token:string){return this.send<{success:boolean}>('/auth/verification/complete',{token});}
 requestPasswordReset(input:EmailRequest){return this.send<{success:boolean}>('/auth/password/request',input);}
 resetPassword(input:ResetInput){return this.send<{success:boolean}>('/auth/password/reset',input);}
 testMail(recipient:string){return this.send<{success:boolean}>('/admin/settings/mail/test',{recipient});}
 mailJobs(){return this.request<MailJobList>('/admin/settings/mail/jobs');}
  installStatus() { return this.request<InstallStatus>('/install/status'); }
  verifyDatabase(token: string, input: DatabaseInput) { return this.send<{ success: boolean }>('/install/verify-db', input, 'POST', { 'X-Bootstrap-Token': token }); }
  completeInstall(token: string, input: InstallInput) { return this.send<InstallResult>('/install/complete', input, 'POST', { 'X-Bootstrap-Token': token }); }
  captcha() { return this.request<Captcha>('/auth/captcha'); }
  async login(input: LoginInput) { const session = await this.send<Session>('/auth/login', input); this.csrf = session.csrf_token; return session; }
  async logout() { const data = await this.send<{ success: boolean }>('/auth/logout', {}); this.csrf = ''; return data; }
  dashboard() { return this.request<Dashboard>('/admin/dashboard'); }
  users(search: string, page: number) { return this.request<UserList>(`/admin/users?search=${encodeURIComponent(search)}&page=${page}`); }
  createUser(input: UserCreate) { return this.send<User>('/admin/users', input); }
  updateUser(id: string, input: UserUpdate) { return this.send<User>(`/admin/users/${encodeURIComponent(id)}`, input, 'PATCH'); }
  roles() { return this.request<RoleList>('/admin/roles'); }
  roleOptions() { return this.request<RoleOptions>('/admin/users/role-options'); }
  createRole(input: RoleInput) { return this.send<Role>('/admin/roles', input); }
  updateRole(id: string, input: RoleInput) { return this.send<Role>(`/admin/roles/${encodeURIComponent(id)}`, input, 'PATCH'); }
  deleteRole(id: string) { return this.request<{ success: boolean }>(`/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  settings() { return this.request<Settings>(this.platform ? '/admin/settings' : '/settings'); }
  patchSettings(input: SettingPatch) { return this.send<Settings>(this.platform ? '/admin/settings' : '/settings', input, 'PATCH'); }
}

export interface DesktopBridge {
  Bootstrap(): Promise<BootstrapResponse>;
  Execute(input: ExecuteInput): Promise<ExecuteResponse>;
  Settings?(): Promise<SettingsResponse>;
  PatchSettings?(input: SettingPatch): Promise<SettingsResponse>;
}

export class WailsTransport implements AppClient {
  readonly transport = 'wails' as const;
  constructor(private readonly bridge: () => DesktopBridge) {}
  async bootstrap() { return unwrap(await this.bridge().Bootstrap()); }
  async execute(input: ExecuteInput) { return unwrap(await this.bridge().Execute(input)); }
  async settings() { const method = this.bridge().Settings; if (!method) throw new AppError('NOT_AVAILABLE', '此版本不支持持久化设置'); return unwrap(await method()); }
  async patchSettings(input: SettingPatch) { const method = this.bridge().PatchSettings; if (!method) throw new AppError('NOT_AVAILABLE', '此版本不支持持久化设置'); return unwrap(await method(input)); }
}
