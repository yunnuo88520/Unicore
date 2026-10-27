/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared UI client; pages know neither fetch nor Wails globals.
 */
import type { Branding, BrandingInput, BrandingResponse, Bootstrap, BootstrapResponse, ExecuteInput, ExecuteOutput, ExecuteResponse, InstallStatus, InstallInput, InstallResult, DatabaseInput, DatabaseCheck, InstallToken, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, Settings, SettingsResponse, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleList, RoleOptions, PermissionDefinition, OIDCInfo, OIDCStart } from '@unicore/contracts';
import { operations, type OperationId, type OperationInputs, type OperationData } from '@unicore/contracts/operations';
import { validate, type SchemaName } from '@unicore/contracts/validate';
export { validate, type SchemaName } from '@unicore/contracts/validate';
export { operations, type OperationId } from '@unicore/contracts/operations';

export type { Branding, BrandingInput, Bootstrap, ExecuteInput, ExecuteOutput, Profile, InstallStatus, InstallInput, InstallResult, DatabaseInput, DatabaseCheck, InstallToken, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, Settings, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleList, RoleOptions, PermissionDefinition, OIDCInfo, OIDCStart } from '@unicore/contracts';

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId = '', public readonly fields: Record<string, string> = {}) { super(message); this.name = 'AppError'; }
}

export type SessionEvent = 'authenticated' | 'signed-out' | 'expired' | 'external';
export type RequestOptions = { signal?: AbortSignal };
export type OperationOptions = RequestOptions & { params?: Record<string, string>; query?: Record<string, string | number>; headers?: Record<string, string> };

export interface AppClient {
  readonly transport: 'http' | 'wails';
  bootstrap(options?: RequestOptions): Promise<Bootstrap>;
  execute(input: ExecuteInput, options?: RequestOptions): Promise<ExecuteOutput>;
  settings?(): Promise<Settings>;
  patchSettings?(input: SettingPatch): Promise<Settings>;
 branding?(): Promise<Branding>;
 updateBranding?(input: BrandingInput): Promise<Branding>;
  web?: WebClient;
  subscribeSession?(listener: (event: SessionEvent) => void): () => void;
  resetSession?(): void;
}

export interface WebClient {
  oidcInfo(): Promise<OIDCInfo>;
  oidcAccount(): Promise<OIDCInfo>;
  oidcStart(): Promise<OIDCStart>;
  oidcLink(password: string): Promise<OIDCStart>;
  oidcUnlink(password: string): Promise<Session>;
  oidcCheck(): Promise<{success: boolean}>;
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
  verifyDatabase(token: string, input: DatabaseInput): Promise<DatabaseCheck>;
  rotateInstallToken(token: string): Promise<InstallToken>;
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
}

function unwrap<T>(response: { code: string; message: string; data: T; request_id: string; fields?: Record<string, string> }): T {
  if (response.code !== 'OK') throw new AppError(response.code, response.message, response.request_id, response.fields);
  return response.data;
}

export class HttpTransport implements AppClient, WebClient {
  readonly transport = 'http' as const;
  readonly web: WebClient = this;
  private csrf = '';
  private platform = false;
  private authenticated = false;
  private identity = '';
  private bootstrapped = false;
  private epoch = 0;
  private listeners = new Set<(event: SessionEvent) => void>();
  subscribeSession(listener: (event: SessionEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private sessionChanged(event: SessionEvent) { this.epoch++; for (const listener of this.listeners) listener(event); }
  resetSession() { this.csrf = ''; this.identity = ''; this.authenticated = false; this.bootstrapped = false; this.sessionChanged('external'); }
  constructor(private readonly baseURL = '', private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const epoch = this.epoch;
    let response: Response;
    const headers = new Headers(init?.headers);
    if (this.csrf) headers.set('X-CSRF-Token', this.csrf);
    const timeout = AbortSignal.timeout(20000);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try { response = await this.fetcher(`${this.baseURL}/api/v1${path}`, { credentials: 'same-origin', ...init, headers, signal }); }
    catch { throw new AppError(signal.aborted ? (timeout.aborted ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED') : 'NETWORK_ERROR', signal.aborted ? '请求已取消或超时' : '连接服务失败，请确认 Go 服务正在运行'); }
    let envelope: { code: string; message: string; data: T; request_id: string; fields?: Record<string, string> };
    try { envelope = await response.json(); }
    catch { throw new AppError('INVALID_RESPONSE', '服务返回了无法识别的响应'); }
    if (epoch !== this.epoch) throw new AppError('SESSION_CHANGED', '会话已变化，请重新获取数据');
    if (!envelope || typeof envelope.code !== 'string' || typeof envelope.request_id !== 'string') throw new AppError('INVALID_RESPONSE', '服务返回了无法识别的响应');
    if (response.status === 401 && envelope.code === 'AUTH_REQUIRED' && this.authenticated && path !== '/auth/login') {
      this.csrf = ''; this.identity = ''; this.authenticated = false; this.sessionChanged('expired');
    }
    if (!response.ok && envelope.code === 'OK') throw new AppError('HTTP_ERROR', `服务请求失败 (${response.status})`);
    return unwrap(envelope);
  }
  call<K extends OperationId>(id: K, ...args: OperationInputs[K] extends undefined ? [input?: undefined, options?: OperationOptions] : [input: OperationInputs[K], options?: OperationOptions]): Promise<OperationData[K]> {
    const [input, options] = args;
    const operation = operations[id];
    if (!operation.responseSchema) return Promise.reject(new AppError('NOT_AVAILABLE', '此接口通过浏览器跳转完成'));
    if (operation.requestSchema) {
      const fields = validate(operation.requestSchema as SchemaName, input);
      if (Object.keys(fields).length) return Promise.reject(new AppError('INVALID_INPUT', '请检查输入类型、范围及当前形态是否支持', '', fields));
    }
    let path: string = operation.path;
    path = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
      if (!options?.params?.[name]) throw new AppError('INVALID_INPUT', '缺少接口路径参数');
      return encodeURIComponent(options.params[name]);
    });
    const query = new URLSearchParams(Object.entries(options?.query ?? {}).map(([key, value]) => [key, String(value)]));
    if (query.size) path += `?${query}`;
    return this.request<OperationData[K]>(path.replace(/^\/api\/v1/, ''), { method: operation.method, signal: options?.signal, headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...options?.headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  }
  async bootstrap(options?: RequestOptions) {
    const data = await this.call('bootstrap', undefined, options);
    const nextIdentity = data.current_user?.id ?? '';
    const expired = this.authenticated && !data.current_user;
    const switched = this.bootstrapped && this.identity !== nextIdentity;
    this.csrf = data.csrf_token ?? '';
    this.platform = data.profile === 'web-platform';
    this.bootstrapped = true;
    this.authenticated = !!data.current_user;
    this.identity = nextIdentity;
    if (expired || switched) this.sessionChanged(expired ? 'expired' : 'external');
    return data;
  }
  execute(input: ExecuteInput, options?: RequestOptions) { return this.call('execute', input, options); }
  oidcInfo() { return this.call('oidcInfo'); }
  oidcAccount() { return this.call('oidcAccount'); }
  oidcStart() { return this.call('oidcStart'); }
  oidcLink(password: string) { return this.call('oidcLink', {password}); }
  async oidcUnlink(password: string) { const result = await this.call('oidcUnlink', {password}); this.csrf = result.csrf_token; return result; }
  oidcCheck() { return this.call('oidcCheck'); }
  registerCode(input:RegisterInput){return this.call('registerEmailCode',input);}
 requestCode(purpose:'verify'|'reset'|'login',input:EmailRequest){return this.call(purpose==='login'?'requestEmailLogin':purpose==='reset'?'requestEmailReset':'requestEmailVerify',input);}
 async completeCode(purpose:'verify'|'reset'|'login',input:EmailCodeInput){const result=await this.call(purpose==='login'?'completeEmailLogin':purpose==='reset'?'completeEmailReset':'completeEmailVerify',input);if('csrf_token' in result){this.csrf=result.csrf_token;this.identity=result.user.id;this.authenticated=true;this.sessionChanged('authenticated');}return result;}
 mailTemplates(){return this.call('mailTemplates');}
 authPolicy(){return this.call('authPolicy');}
 register(input:RegisterInput){return this.call('register',input);}
 requestVerification(input:EmailRequest){return this.call('requestVerification',input);}
 verifyEmail(token:string){return this.call('verifyEmail',{token});}
 requestPasswordReset(input:EmailRequest){return this.call('requestPasswordReset',input);}
 resetPassword(input:ResetInput){return this.call('resetPassword',input);}
 testMail(recipient:string){return this.call('testMail',{recipient});}
 mailJobs(){return this.call('mailJobs');}
  installStatus() { return this.call('installStatus'); }
  verifyDatabase(token: string, input: DatabaseInput) { return this.call('verifyDatabase', input, { headers: { 'X-Bootstrap-Token': token } }); }
  rotateInstallToken(token: string) { return this.call('rotateInstallToken', {}, { headers: { 'X-Bootstrap-Token': token } }); }
  completeInstall(token: string, input: InstallInput) { return this.call('completeInstall', input, { headers: { 'X-Bootstrap-Token': token } }); }
  captcha() { return this.call('captcha'); }
  async login(input: LoginInput) { const session = await this.call('login', input); this.csrf = session.csrf_token; this.identity = session.user.id; this.authenticated = true; this.sessionChanged('authenticated'); return session; }
  async logout() { const data = await this.call('logout'); this.csrf = ''; this.identity = ''; this.authenticated = false; this.sessionChanged('signed-out'); return data; }
  dashboard() { return this.call('dashboard'); }
  users(search: string, page: number) { return this.call('listUsers', undefined, { query: { search, page } }); }
  createUser(input: UserCreate) { return this.call('createUser', input); }
  updateUser(id: string, input: UserUpdate) { return this.call('updateUser', input, { params: { id } }); }
  roles() { return this.call('listRoles'); }
  roleOptions() { return this.call('roleOptions'); }
  branding() { return this.call(this.platform ? 'adminBranding' : 'localBranding'); }
  updateBranding(input: BrandingInput) { return this.call(this.platform ? 'adminUpdateBranding' : 'localUpdateBranding',input); }
  settings() { return this.call(this.platform ? 'adminSettings' : 'localSettings'); }
  patchSettings(input: SettingPatch) { return this.call(this.platform ? 'adminPatchSettings' : 'localPatchSettings', input); }
}

export interface DesktopBridge {
  Branding?(): Promise<BrandingResponse>;
  UpdateBranding?(input: BrandingInput): Promise<BrandingResponse>;
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
  async branding() { const method=this.bridge().Branding;if(!method)throw new AppError('NOT_AVAILABLE','品牌存储未初始化');return unwrap(await method()); }
  async updateBranding(input: BrandingInput) { const method=this.bridge().UpdateBranding;if(!method)throw new AppError('NOT_AVAILABLE','品牌存储未初始化');return unwrap(await method(input)); }
  async settings() { const method = this.bridge().Settings; if (!method) throw new AppError('NOT_AVAILABLE', '此版本不支持持久化设置'); return unwrap(await method()); }
  async patchSettings(input: SettingPatch) { const method = this.bridge().PatchSettings; if (!method) throw new AppError('NOT_AVAILABLE', '此版本不支持持久化设置'); return unwrap(await method(input)); }
}
