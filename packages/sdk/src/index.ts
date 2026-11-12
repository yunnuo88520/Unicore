/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared UI client; pages know neither fetch nor Wails globals.
 */
import {fileFingerprint,retryDelay} from './upload';
import type { MultipartUploadInput, PersonalTokenInput, PersonalToken, PersonalTokenList, PersonalTokenCreated, TokenScopeList, ClientTokenPair, ClientTokenLogin, NotifyConfiguration, NotifyTemplate, NotifyPreview, NotifyTest, AccountProfile, ProfileInput, TOTPSetup, RecoveryCodes, LoginDevices, UploadPolicy, MultipartUpload, AnnouncementReadStatus, AnnouncementEntry, AnnouncementPublic, AnnouncementInput, AnnouncementUpdate, AnnouncementQuery, AnnouncementList, AnnouncementFeed, AnnouncementSelection, AuditLogQuery, AuditLogExport, MailTemplate, MailTemplateInput, MailTemplateTestInput, UpdateOverview, UpdateJob, UpdateApplyInput, UpdateOverviewResponse, UpdateJobResponse, NoteEntry, LogTailList, NoteInput, NoteUpdate, NoteQuery, NoteList, NoteResponse, NoteListResponse, NoteVersion, ActionResultResponse, StorageLocation, StorageLocationInput, StorageLocationList, FileEntry, FileList, FileAccess, FileListResponse, FileEntryResponse, UploadPolicyResponse, MultipartUploadResponse, Branding, BrandingInput, BrandingResponse, Bootstrap, BootstrapResponse, ExecuteInput, ExecuteOutput, ExecuteResponse, InstallStatus, InstallInput, InstallResult, DatabaseInput, DatabaseCheck, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, AdminPasswordResetInput, AdminPasswordReset, Settings, SettingsResponse, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleList, RoleOptions, PermissionDefinition, RoleSaveInput, MenuEntry, MenuList, MenuSaveInput, MenuRoleAssignmentInput, NavigationSection, NavigationNode, NavigationPage, NavigationRoleAssignment, Navigation, APIOperation, APIOperationList, Post, PostList, PostSaveInput, NoteCapabilities, FileCapabilities, DictionarySummary, DictionaryList, DictionaryItemEntry, DictionaryDetail, DictionaryCreateInput, DictionaryUpdateInput, DictionaryItemsInput, Department, DepartmentList, DepartmentSaveInput, OIDCInfo, OIDCStart, OIDCBindLoginInput, OIDCCheckInfo, AuditLogList, ChangePasswordInput, TaskList, TaskEntry, TaskUpdateInput, TaskTrigger, TaskCreateInput, TaskEditInput, TaskRunList, ActionResult, InboxList, FileUploadInput, FileUploadGrant, MonitorSnapshot, MonitorSnapshotResponse, MonitorEventList, MonitorEvent, MonitorEventListResponse, MonitorAlertRules, MonitorAlertRule, MonitorAlertRulesResponse } from '@unicore/contracts';
import { operations, type OperationId, type OperationInputs, type OperationData } from '@unicore/contracts/operations';
import { validate, type SchemaName } from '@unicore/contracts/validate';
export { validate, constraints, type SchemaName } from '@unicore/contracts/validate';
export { constraintsToZod, zodFieldErrors } from '@unicore/contracts/zod';
export { operations, type OperationId } from '@unicore/contracts/operations';

export type { PersonalTokenInput, PersonalToken, PersonalTokenList, PersonalTokenCreated, TokenScopeList, ClientTokenPair, ClientTokenLogin, NotifyConfiguration, NotifyTemplate, NotifyPreview, NotifyTest, AccountProfile, TOTPSetup, RecoveryCodes, LoginDevices, UploadPolicy, MultipartUpload, AnnouncementReadStatus, AnnouncementEntry, AnnouncementPublic, AnnouncementInput, AnnouncementUpdate, AnnouncementQuery, AnnouncementList, AnnouncementFeed, AnnouncementSelection, AuditLogQuery, AuditLogExport, MailTemplate, MailTemplateInput, MailTemplateTestInput, UpdateOverview, UpdateJob, UpdateApplyInput, UpdateRelease, NoteEntry, LogTailList, NoteInput, NoteUpdate, NoteQuery, NoteList, StorageLocation, StorageLocationInput, StorageLocationList, FileEntry, FileList, FileAccess, Branding, BrandingInput, Bootstrap, ExecuteInput, ExecuteOutput, Profile, InstallStatus, InstallInput, InstallResult, DatabaseInput, DatabaseCheck, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, AdminPasswordResetInput, AdminPasswordReset, Settings, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleList, RoleOptions, PermissionDefinition, DictionaryItemsInput, DictionaryUpdateInput, DictionaryCreateInput, DictionaryDetail, DictionaryItemEntry, DictionaryList, DictionarySummary, MenuSaveInput, MenuRoleAssignmentInput, MenuList, RoleSaveInput, MenuEntry, NavigationSection, NavigationNode, NavigationPage, NavigationRoleAssignment, Navigation, APIOperation, APIOperationList, Post, PostList, PostSaveInput, NoteCapabilities, FileCapabilities, Department, DepartmentList, DepartmentSaveInput, OIDCInfo, OIDCStart, OIDCBindLoginInput, OIDCCheckInfo, AuditLogList, ChangePasswordInput, TaskList, TaskEntry, TaskUpdateInput, TaskTrigger, TaskCreateInput, TaskEditInput, TaskRunList, ActionResult, InboxList, InboxEntry, FileUploadInput, FileUploadGrant, MonitorSnapshot, MonitorHttpService, MonitorDatabase, MonitorStorageService, MonitorTasksSummary, MonitorTaskHealth, MonitorEventList, MonitorEvent, MonitorAlertRules, MonitorAlertRule } from '@unicore/contracts';

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId = '', public readonly fields: Record<string, string> = {}) { super(message); this.name = 'AppError'; }
}

export type SessionEvent = 'authenticated' | 'password-changed' | 'signed-out' | 'expired' | 'external';
export type RequestOptions = { signal?: AbortSignal };
export type UploadStage='hashing'|'uploading'|'confirming';
export type UploadProgress={loaded:number;total:number;completedParts:number;totalParts:number};
export type UploadOptions = RequestOptions & { resumeId?:string; uploadPath?:string; onStage?: (stage: UploadStage) => void; onSession?:(session:MultipartUpload)=>void; onProgress?:(progress:UploadProgress)=>void; onHashProgress?:(loaded:number)=>void };
export type OperationOptions = RequestOptions & { timeoutMs?:number; params?: Record<string, string>; query?: Record<string, string | number | boolean>; headers?: Record<string, string> };

export interface UpdateClient {
 overview():Promise<UpdateOverview>;
 check():Promise<UpdateOverview>;
 apply(input:UpdateApplyInput):Promise<UpdateJob>;
}

export interface AppClient {
 updates?:UpdateClient;
  readonly transport: 'http' | 'wails';
  readonly sessionScope?: 'user' | 'administrator';
  bootstrap(options?: RequestOptions): Promise<Bootstrap>;
  execute(input: ExecuteInput, options?: RequestOptions): Promise<ExecuteOutput>;
  settings?(): Promise<Settings>;
  patchSettings?(input: SettingPatch): Promise<Settings>;
  monitorSnapshot?(): Promise<MonitorSnapshot>;
  monitorEvents?(): Promise<MonitorEventList>;
  alertRules?(): Promise<MonitorAlertRules>;
  updateAlertRules?(input: MonitorAlertRules): Promise<MonitorAlertRules>;
  probeStorage?(location: string): Promise<unknown>;
 branding?(): Promise<Branding>;
 updateBranding?(input: BrandingInput): Promise<Branding>;
  apiDocument?():Promise<Record<string,unknown>>;
  web?: WebClient;
 notes?: NoteClient;
 files?: FileClient;
 businessFiles?(scope:'notes'|'avatar'):FileClient;
 storage?: StorageClient;
  subscribeSession?(listener: (event: SessionEvent) => void): () => void;
  resetSession?(): void;
}

export interface NoteClient {
 listNotes(query:NoteQuery):Promise<NoteList>;
 createNote(input:NoteInput):Promise<NoteEntry>;
 updateNote(id:string,input:NoteUpdate):Promise<NoteEntry>;
 deleteNote(id:string,version:number):Promise<{success:boolean}>;
}

export interface FileClient {
 downloadFile?(id:string):Promise<void>;
 uploadPolicy():Promise<UploadPolicy>;
 uploadStatus(id:string):Promise<MultipartUpload>;
 listFiles(search:string,page:number):Promise<FileList>;
 uploadFile(file:File,options?:UploadOptions):Promise<FileEntry>;
 fileAccess(id:string,noteID?:string):Promise<FileAccess>;
 deleteFile(id:string):Promise<{success:boolean}>;
 migrateFile(id:string,locationID:string):Promise<FileEntry>;
}
export interface StorageClient {
 storageLocations():Promise<StorageLocationList>;
 saveStorage(input:StorageLocationInput,id?:string):Promise<StorageLocation>;
 removeStorage(id:string):Promise<{success:boolean}>;
 testStorage(id:string):Promise<{success:boolean}>;
 activateStorage(id:string):Promise<{success:boolean}>;
 storageBrowser(id:string,origin:string):Promise<{success:boolean}>;
 cleanupStorage():Promise<{success:boolean}>;
}

export interface WebClient {
 personalTokens():Promise<PersonalTokenList>;
 createPersonalToken(input:PersonalTokenInput):Promise<PersonalTokenCreated>;
 revokePersonalToken(id:string):Promise<ActionResult>;
 personalTokenScopes():Promise<TokenScopeList>;

 subscribeEvents(listener:(type:string)=>void):()=>void;
 subscribeLogEvents(afterSeq:number,onLine:(line:string,seq:number)=>void,onStatus?:(status:'connected'|'disconnected')=>void):()=>void;
 exportUsers(search?:string):Promise<Blob>;
 usersImportTemplate():Promise<Blob>;
 importUsers(file:File):Promise<{created:number;errors:string[]}>;
 exportFiles(search?:string):Promise<Blob>;
 accountProfile():Promise<AccountProfile>;
 saveAccountProfile(input:ProfileInput):Promise<AccountProfile>;
 beginTOTP(password:string):Promise<TOTPSetup>;
 pendingTOTP():Promise<TOTPSetup>;
 oidcTOTP():Promise<OIDCStart>;
 cancelTOTP():Promise<{success:boolean}>;
 enableTOTP(code:string):Promise<RecoveryCodes>;
 disableTOTP(code:string):Promise<{success:boolean}>;
 verifyMFA(code:string):Promise<Session>;
 cancelMFA():Promise<{success:boolean}>;
 accountSessions():Promise<LoginDevices>;
 revokeAccountSession(id:string):Promise<{success:boolean}>;
 revokeOtherSessions():Promise<{success:boolean}>;
 requestCurrentEmail():Promise<EmailChallenge>;
 verifyCurrentEmail(challenge_id:string,code:string):Promise<{success:boolean}>;
 requestNewEmail(current_challenge_id:string,email:string):Promise<EmailChallenge>;
 confirmNewEmail(challenge_id:string,code:string):Promise<AccountProfile>;

 adminAnnouncements(query:AnnouncementQuery):Promise<AnnouncementList>;
 createAnnouncement(input:AnnouncementInput):Promise<AnnouncementEntry>;
 updateAnnouncement(id:string,input:AnnouncementUpdate):Promise<AnnouncementEntry>;
 deleteAnnouncements(items:AnnouncementSelection[]):Promise<{success:boolean}>;
 saveAnnouncementSettings(enabled:boolean):Promise<{enabled:boolean}>;
 previewAnnouncement(input:AnnouncementInput):Promise<{content_html:string}>;
 announcements(page?:number,pageSize?:number,popupOnly?:boolean):Promise<AnnouncementFeed>;
 announcement(id:string):Promise<AnnouncementPublic>;
 markAnnouncementRead(id:string):Promise<{success:boolean}>;
 markAllAnnouncementsRead():Promise<{success:boolean}>;
 announcementReadStatus(id:string,page:number,pageSize:number,search:string):Promise<AnnouncementReadStatus>;

  oidcInfo(): Promise<OIDCInfo>;
  oidcAccount(): Promise<OIDCInfo>;
  oidcStart(): Promise<OIDCStart>;
  oidcLink(password: string): Promise<OIDCStart>;
  oidcUnlink(password: string): Promise<Session>;
  oidcCheck(): Promise<OIDCCheckInfo>;
  oidcBindLogin(input: OIDCBindLoginInput): Promise<Session>;
 registerCode(input:RegisterInput):Promise<EmailChallenge>;
 requestCode(purpose:"verify"|"reset"|"login",input:EmailRequest):Promise<EmailChallenge>;
 completeCode(purpose:"verify"|"reset"|"login",input:EmailCodeInput):Promise<Session|{success:boolean}>;
 notificationSettings():Promise<NotifyConfiguration>;
 saveNotificationSettings(input:NotifyConfiguration):Promise<NotifyConfiguration>;
 previewNotification(input:NotifyTemplate):Promise<NotifyPreview>;
 testNotification(input:NotifyTest):Promise<{success:boolean}>;
 mailTemplates():Promise<MailTemplateList>;
 saveMailTemplate(input:MailTemplateInput):Promise<MailTemplate>;
 previewMailTemplate(input:MailTemplateInput):Promise<MailTemplate>;
 resetMailTemplate(purpose:MailTemplateInput['purpose']):Promise<MailTemplate>;
 testMailTemplate(input:MailTemplateTestInput):Promise<{success:boolean}>;
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
  completeInstall(token: string, input: InstallInput): Promise<InstallResult>;
  captcha(): Promise<Captcha>;
  login(input: LoginInput): Promise<Session>;
  logout(): Promise<{ success: boolean }>;
  systemLogs(query?:AuditLogQuery): Promise<AuditLogList>;
  logTail(query?:{before_seq?:number;limit?:number}): Promise<LogTailList>;
 exportSystemLogs(query:AuditLogQuery):Promise<AuditLogExport>;
 changePassword(input:ChangePasswordInput):Promise<{success:boolean}>;
 administrators(search:string,page:number):Promise<UserList>;
 createAdministrator(input:UserCreate):Promise<User>;
 updateAdministrator(id:string,input:UserUpdate):Promise<User>;
  users(search: string, page: number, postId?: string): Promise<UserList>;
  listPosts(): Promise<PostList>;
  createPost(input: PostSaveInput): Promise<Post>;
  updatePost(id: string, input: PostSaveInput): Promise<Post>;
  deletePost(id: string): Promise<Post>;
  apiOperations(): Promise<APIOperationList>;
  createUser(input: UserCreate): Promise<User>;
  updateUser(id: string, input: UserUpdate): Promise<User>;
  resetUserPassword(id: string, input: AdminPasswordResetInput): Promise<AdminPasswordReset>;
  listDepartments(): Promise<DepartmentList>;
  createDepartment(input: DepartmentSaveInput): Promise<Department>;
  updateDepartment(id: string, input: DepartmentSaveInput): Promise<Department>;
  deleteDepartment(id: string): Promise<Department>;
  adminDashboard(): Promise<Dashboard>;
  roles(): Promise<RoleList>;
  createRole(input: RoleSaveInput): Promise<Role>;
  updateRole(id: string, input: RoleSaveInput): Promise<Role>;
  deleteRole(id: string): Promise<Role>;
  menuConfig(): Promise<MenuList>;
  saveMenuConfig(input: MenuSaveInput): Promise<MenuList>;
  assignMenuRoles(id: string, input: MenuRoleAssignmentInput): Promise<RoleList>;
  dictionaries(): Promise<DictionaryList>;
  dictionary(id: string): Promise<DictionaryDetail>;
  createDictionary(input: DictionaryCreateInput): Promise<DictionarySummary>;
  updateDictionary(id: string, input: DictionaryUpdateInput): Promise<DictionaryDetail>;
  deleteDictionary(id: string): Promise<DictionaryDetail>;
  replaceDictionaryItems(id: string, input: DictionaryItemsInput): Promise<DictionaryDetail>;
  dictionaryByCode(code: string): Promise<DictionaryDetail>;
  roleOptions(): Promise<RoleOptions>;
  adminRoleOptions(): Promise<RoleOptions>;

  inbox(): Promise<InboxList>;
  readInbox(id: string): Promise<InboxList>;
  readAllInbox(): Promise<InboxList>;
  listTasks(): Promise<TaskList>;
  createTask(input: TaskCreateInput): Promise<TaskEntry>;
  editTask(name: string, input: TaskEditInput): Promise<TaskEntry>;
  deleteTask(name: string): Promise<ActionResult>;
  listTaskRuns(name: string): Promise<TaskRunList>;
  updateTask(name: string, input: TaskUpdateInput): Promise<TaskEntry>;
  triggerTask(name: string): Promise<TaskTrigger>;
  createFileUpload(input: FileUploadInput): Promise<FileUploadGrant>;
  uploadFileContent(grant: FileUploadGrant, content: Blob): Promise<{ success: boolean }>;
  completeFileUpload(id: string): Promise<FileEntry>;
}

function unwrap<T>(response: { code: string; message?: string; data: T; request_id: string; fields?: Record<string, string> }): T {
  if (response.code !== 'OK') throw new AppError(response.code, response.message ?? response.code, response.request_id, response.fields);
  return response.data;
}

const administratorOperations: Partial<Record<OperationId, OperationId>> = {
 accountProfile:'adminAccountProfile',
 saveAccountProfile:'adminSaveAccountProfile',
 beginTOTP:'adminBeginTOTP',
 pendingTOTP:'adminPendingTOTP',
 oidcTOTP:'adminOidcTOTP',
 cancelTOTP:'adminCancelTOTP',
 enableTOTP:'adminEnableTOTP',
 disableTOTP:'adminDisableTOTP',
 verifyMFA:'adminVerifyMFA',
 cancelMFA:'adminCancelMFA',
 accountSessions:'adminAccountSessions',
 revokeAccountSession:'adminRevokeAccountSession',
 revokeOtherSessions:'adminRevokeOtherSessions',
 requestCurrentEmail:'adminRequestCurrentEmail',
 verifyCurrentEmail:'adminVerifyCurrentEmail',
 requestNewEmail:'adminRequestNewEmail',
 confirmNewEmail:'adminConfirmNewEmail',

 fileUploadPolicy:'adminFileUploadPolicy',createMultipartUpload:'adminCreateMultipartUpload',multipartUpload:'adminMultipartUpload',signUploadPart:'adminSignUploadPart',uploadLocalPart:'adminUploadLocalPart',completeMultipartUpload:'adminCompleteMultipartUpload',

 updateOverview:"adminUpdateOverview",checkUpdate:"adminCheckUpdate",applyUpdate:"adminApplyUpdate",
  "bootstrap": "adminBootstrap",
  "listNotes": "adminListNotes",
  "createNote": "adminCreateNote",
  "updateNote": "adminUpdateNote",
  "deleteNote": "adminDeleteNote",
  "execute": "adminExecute",
  "captcha": "adminCaptcha",
  "login": "adminLogin",
  "session": "adminSession",
  "logout": "adminLogout",
  "authPolicy": "adminAuthPolicy",
  "requestPasswordReset": "adminRequestPasswordReset",
  "resetPassword": "adminResetPassword",
  "requestEmailReset": "adminRequestEmailReset",
  "completeEmailReset": "adminCompleteEmailReset",
  "requestEmailLogin": "adminRequestEmailLogin",
  "completeEmailLogin": "adminCompleteEmailLogin",
  "oidcInfo": "adminOidcInfo",
  "oidcStart": "adminOidcStart",
  "oidcAccount": "adminOidcAccount",
  "oidcLink": "adminOidcLink",
  "oidcUnlink": "adminOidcUnlink",
  "oidcCallback": "administratorOIDCCallback",
  "changePassword": "adminChangePassword",
  "listFiles": "adminListFiles",
  "createFileUpload": "adminCreateFileUpload",
  "uploadLocalFile": "adminUploadLocalFile",
  "completeFileUpload": "adminCompleteFileUpload",
  "fileAccess": "adminFileAccess",
  "deleteFile": "adminDeleteFile",
  "monitorSnapshot": "adminMonitorSnapshot",
  "monitorEvents": "adminMonitorEvents"
};

export class HttpTransport implements AppClient, WebClient, FileClient, StorageClient {
  readonly transport = 'http' as const;
 readonly updates:UpdateClient={overview:()=>this.call('updateOverview'),check:()=>this.call('checkUpdate',undefined,{headers:{'Content-Type':'application/json'},timeoutMs:20000}),apply:input=>this.call('applyUpdate',input)};
  readonly notes:NoteClient=this;
  readonly web: WebClient = this;
 readonly files:FileClient=this;
 readonly storage:StorageClient=this;
  get sessionScope(): 'user'|'administrator' { return 'user'; }
  private csrf = '';
 private readonly administrator: boolean;
  private platform = false;
  private authenticated = false;
  private identity = '';
  private bootstrapped = false;
  private epoch = 0;
  private listeners = new Set<(event: SessionEvent) => void>();
  private inflightGets = new Map<string, Promise<unknown>>();
  subscribeSession(listener: (event: SessionEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private sessionChanged(event: SessionEvent) { this.epoch++; for (const listener of this.listeners) listener(event); }
  resetSession() { this.csrf = ''; this.identity = ''; this.authenticated = false; this.bootstrapped = false; this.sessionChanged('external'); }
  constructor(private readonly baseURL = '', private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis), realm: 'user'|'administrator' = 'user', private readonly bearerToken?:string) { this.administrator = realm === 'administrator'; }
  businessFiles(scope:'notes'|'avatar'):FileClient {
    const call=this.fileCalls(scope);
    return {
      uploadPolicy:()=>call('fileUploadPolicy'),
      uploadStatus:id=>call('multipartUpload',undefined,{params:{id}}),
      listFiles:(search,page)=>call('listFiles',undefined,{query:{search,page}}),
      uploadFile:(file,options)=>this.uploadFile(file,options,scope),
      fileAccess:(id:string,noteID?:string)=>call('fileAccess',undefined,{params:{id},...(noteID?{query:{note_id:noteID}}:{})}),
      deleteFile:id=>call('deleteFile',undefined,{params:{id}}),
      migrateFile:async()=>{throw new AppError('NOT_AVAILABLE','此运行形态不提供文件管理');},
    };
  }
  private fileCalls(scope?:'notes'|'avatar'):HttpTransport['call'] {
    // Business endpoints have the same generated DTOs as their generic peers.
    return ((id:OperationId,...args:unknown[])=> {
      const mapped=scope ? `${scope}${id[0].toUpperCase()}${id.slice(1)}` : id;
      return (this.call as (...args:unknown[])=>Promise<unknown>)(mapped,...args);
    }) as HttpTransport['call'];
  }
  private async request<T>(path: string, init?: RequestInit,timeoutMS=20000,binary=false): Promise<T> {
    const epoch = this.epoch;
    let response: Response;
    const headers = new Headers(init?.headers);
    if (this.bearerToken !== undefined) {
      if(this.bearerToken) headers.set('Authorization', `Bearer ${this.bearerToken}`);
    } else if (this.csrf) headers.set('X-CSRF-Token', this.csrf);
    const timeout = AbortSignal.timeout(timeoutMS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try { response = await this.fetcher(`${this.baseURL}/api/v1${path}`, { credentials: this.bearerToken === undefined ? 'same-origin' : 'omit', ...init, headers, signal }); }
    catch { throw new AppError(signal.aborted ? (timeout.aborted ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED') : 'NETWORK_ERROR', signal.aborted ? '请求已取消或超时' : '连接服务失败，请确认 Go 服务正在运行'); }
    if (binary && response.ok) {
      const result = await response.blob();
      if (epoch !== this.epoch) throw new AppError('SESSION_CHANGED', '会话已变化，请重新获取数据');
      return result as T;
    }
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
    const operation = operations[(this.administrator ? administratorOperations[id] : undefined) ?? id];
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
    const relative = path.replace(/^\/api\/v1/, '');
    const execute = (signal?: AbortSignal) => this.request<OperationData[K]>(relative, { method: operation.method, signal, headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...options?.headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) },options?.timeoutMs);
    if (operation.method.toUpperCase() !== 'GET') return execute(options?.signal);
    if (options?.signal?.aborted) return Promise.reject(new AppError('REQUEST_CANCELLED', '请求已取消或超时'));
    // Identical concurrent GETs share one request. The shared fetch carries
    // no caller signal: when the first caller's environment cancels its own
    // query (invalidation, unmount), the request must survive for the
    // siblings that joined it. Personal cancellation layers on via
    // ownAbort; the shared deadline comes from the first caller's options.
    const pending = this.inflightGets.get(path);
    const shared = (pending ?? execute(undefined).finally(() => { this.inflightGets.delete(path); })) as Promise<OperationData[K]>;
    if (!pending) this.inflightGets.set(path, shared);
    return this.ownAbort(shared, options?.signal);
  }

  private ownAbort<T>(shared: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return shared;
    if (signal.aborted) return Promise.reject(new AppError('REQUEST_CANCELLED', '请求已取消或超时'));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new AppError('REQUEST_CANCELLED', '请求已取消或超时'));
      signal.addEventListener('abort', onAbort, { once: true });
      shared.then(
        value => { signal.removeEventListener('abort', onAbort); resolve(value); },
        error => { signal.removeEventListener('abort', onAbort); reject(error); },
      );
    });
  }
  private workbook(id:'exportUsers'|'userImportTemplate'|'exportFiles',search?:string):Promise<Blob> {
    const operation=operations[id];
    const query=new URLSearchParams(search?{search}:{});
    return this.request(operation.path.replace(/^\/api\/v1/, '')+(query.size?`?${query}`:''),{method:operation.method},60000,true);
  }
  exportUsers(search?:string){return this.workbook('exportUsers',search);}
  usersImportTemplate(){return this.workbook('userImportTemplate');}
  exportFiles(search?:string){return this.workbook('exportFiles',search);}
  async importUsers(file:File):Promise<{created:number;errors:string[]}> {
    if(file.size>5*1024*1024||!file.name.toLowerCase().endsWith('.xlsx'))throw new AppError('INVALID_INPUT','请选择 5 MiB 以内的 XLSX 文件');
    const body=new FormData();body.append('file',file);
    const operation=operations.importUsers;
    const result=await this.request<OperationData['importUsers']>(operation.path.replace(/^\/api\/v1/,''),{method:operation.method,body},600000);
    return {created:result.created,errors:result.failed.map(item=>`${item.row}: ${item.error}`)};
  }
  async apiDocument():Promise<Record<string,unknown>> {
    const response=await this.fetcher(`${this.baseURL}/openapi.json`,{credentials:'same-origin',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new AppError('NOT_AVAILABLE','接口文档未启用');
    return response.json();
  }
  subscribeEvents(listener:(type:string)=>void):()=>void {
    if(this.administrator||typeof EventSource==='undefined')return ()=>{};
    const source=new EventSource(`${this.baseURL}${operations.events.path}`,{withCredentials:true});
    const notify=(event:Event)=>listener(event.type==='open'?'reconnect':event.type);
    for(const type of ['open','message','inbox.new'])source.addEventListener(type,notify);
    const unsubscribe=this.subscribeSession(()=>source.close());
    return ()=>{source.close();unsubscribe();};
  }
  // Live log lines for the administrator console; closing the returned thunk
  // closes the EventSource and disconnects the server-side stream. EventSource
  // reconnects on its own, so status only reports what the browser observes.
  subscribeLogEvents(afterSeq:number,onLine:(line:string,seq:number)=>void,onStatus?:(status:'connected'|'disconnected')=>void):()=>void {
    if(!this.administrator||typeof EventSource==='undefined')return ()=>{};
    const cursor=Number.isFinite(afterSeq)&&afterSeq>0?`?after_seq=${Math.floor(afterSeq)}`:'';
    const source=new EventSource(`${this.baseURL}${operations.logStream.path}${cursor}`,{withCredentials:true});
    source.onopen=()=>onStatus?.('connected');
    source.onerror=()=>onStatus?.('disconnected');
    source.addEventListener('message',(event:MessageEvent)=>{if(typeof event.data==='string')onLine(event.data,Number(event.lastEventId)||0);});
    const unsubscribe=this.subscribeSession(()=>source.close());
    return ()=>{source.close();unsubscribe();};
  }
  async bootstrap(options?: RequestOptions) {
    let data = await this.call('bootstrap', undefined, options);
    const nextIdentity = data.current_user?.id ?? '';
    const expired = this.authenticated && !data.current_user && !data.mfa_pending;
    const switched = this.bootstrapped && this.identity !== nextIdentity;
    this.csrf = data.csrf_token ?? '';
    this.platform = data.profile === 'web-platform';
    this.bootstrapped = true;
    this.authenticated = !!data.current_user;
    this.identity = nextIdentity;
    if (expired || switched) this.sessionChanged(expired ? 'expired' : 'external');
    return data;
  }
 accountProfile(){return this.call('accountProfile');}
 saveAccountProfile(input:ProfileInput){return this.call('saveAccountProfile',input);}
 beginTOTP(password:string){return this.call('beginTOTP',{password});}
 pendingTOTP(){return this.call('pendingTOTP');}
 oidcTOTP(){return this.call('oidcTOTP');}
 cancelTOTP(){return this.call('cancelTOTP');}
 enableTOTP(code:string){return this.call('enableTOTP',{code});}
 disableTOTP(code:string){return this.call('disableTOTP',{code});}
 async verifyMFA(code:string){const session=await this.call('verifyMFA',{code});this.csrf=session.csrf_token;this.identity=session.user.id;this.authenticated=true;this.sessionChanged('authenticated');return session;}
 async cancelMFA(){const result=await this.call('cancelMFA');this.resetSession();return result;}
 accountSessions(){return this.call('accountSessions');}
 revokeAccountSession(id:string){return this.call('revokeAccountSession',{id});}
 revokeOtherSessions(){return this.call('revokeOtherSessions');}
 requestCurrentEmail(){return this.call('requestCurrentEmail');}
 verifyCurrentEmail(challenge_id:string,code:string){return this.call('verifyCurrentEmail',{challenge_id,code});}
 requestNewEmail(current_challenge_id:string,email:string){return this.call('requestNewEmail',{current_challenge_id,email});}
 confirmNewEmail(challenge_id:string,code:string){return this.call('confirmNewEmail',{challenge_id,code});}
  execute(input: ExecuteInput, options?: RequestOptions) { return this.call('execute', input, options); }
  adminAnnouncements(query:AnnouncementQuery){return this.call('adminAnnouncements',undefined,{query:{...query}});}
 createAnnouncement(input:AnnouncementInput){return this.call('createAnnouncement',input);}
 updateAnnouncement(id:string,input:AnnouncementUpdate){return this.call('updateAnnouncement',input,{params:{id}});}
 deleteAnnouncements(items:AnnouncementSelection[]){return this.call('deleteAnnouncements',{items});}
 saveAnnouncementSettings(enabled:boolean){return this.call('saveAnnouncementSettings',{enabled});}
 previewAnnouncement(input:AnnouncementInput){return this.call('previewAnnouncement',input);}
 announcements(page=1,pageSize=10,popupOnly=false){return this.call('announcements',undefined,{query:{page,page_size:pageSize,popup_only:popupOnly}});}
 markAnnouncementRead(id:string){return this.call('markAnnouncementRead',undefined,{params:{id}});}
 markAllAnnouncementsRead(){return this.call('markAllAnnouncementsRead');}
 announcementReadStatus(id:string,page=1,pageSize=10,search=''){return this.call('announcementReadStatus',undefined,{params:{id},query:{page,page_size:pageSize,search}});}
 announcement(id:string){return this.call('announcement',undefined,{params:{id}});}
 oidcInfo() { return this.call('oidcInfo'); }
  oidcAccount() { return this.call('oidcAccount'); }
  oidcStart() { return this.call('oidcStart'); }
  oidcLink(password: string) { return this.call('oidcLink', {password}); }
  async oidcUnlink(password: string) { const result = await this.call('oidcUnlink', {password}); this.csrf = result.csrf_token; return result; }
  oidcCheck() { return this.call('oidcCheck'); }
  async oidcBindLogin(input: OIDCBindLoginInput) { const session = await this.call('oidcBindLogin', input); this.csrf = session.csrf_token; this.identity = session.mfa_pending ? '' : session.user.id; this.authenticated = !session.mfa_pending; this.sessionChanged('authenticated'); return session; }
  registerCode(input:RegisterInput){return this.call('registerEmailCode',input);}
 requestCode(purpose:'verify'|'reset'|'login',input:EmailRequest){return this.call(purpose==='login'?'requestEmailLogin':purpose==='reset'?'requestEmailReset':'requestEmailVerify',input);}
 async completeCode(purpose:'verify'|'reset'|'login',input:EmailCodeInput){const result=await this.call(purpose==='login'?'completeEmailLogin':purpose==='reset'?'completeEmailReset':'completeEmailVerify',input);if('csrf_token' in result){this.csrf=result.csrf_token;this.identity=result.mfa_pending?'':result.user.id;this.authenticated=!result.mfa_pending;this.sessionChanged('authenticated');}return result;}
 notificationSettings(){return this.call('notificationSettings');}
 saveNotificationSettings(input:NotifyConfiguration){return this.call('saveNotificationSettings',input);}
 previewNotification(input:NotifyTemplate){return this.call('previewNotification',input);}
 testNotification(input:NotifyTest){return this.call('testNotification',input);}
 mailTemplates(){return this.call('mailTemplates');}
 saveMailTemplate(input:MailTemplateInput){return this.call('saveMailTemplate',input);}
 previewMailTemplate(input:MailTemplateInput){return this.call('previewMailTemplate',input);}
 resetMailTemplate(purpose:MailTemplateInput['purpose']){return this.call('resetMailTemplate',{purpose});}
 testMailTemplate(input:MailTemplateTestInput){return this.call('testMailTemplate',input);}
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
  completeInstall(token: string, input: InstallInput) { return this.call('completeInstall', input, { headers: { 'X-Bootstrap-Token': token } }); }
  captcha() { return this.call('captcha'); }
  async login(input: LoginInput) { const session = await this.call('login', input); this.csrf = session.csrf_token; this.identity = session.mfa_pending ? '' : session.user.id; this.authenticated = !session.mfa_pending; this.sessionChanged('authenticated'); return session; }
  async logout() { const data = await this.call('logout'); this.csrf = ''; this.identity = ''; this.authenticated = false; this.sessionChanged('signed-out'); return data; }
  systemLogs(query?:AuditLogQuery){return this.call('systemLogs',undefined,{query:query?{...query}:undefined});}
  logTail(query?:{before_seq?:number;limit?:number}){return this.call('logTail',undefined,{query:query?{...query}:undefined});}
 exportSystemLogs(query:AuditLogQuery){return this.call('exportSystemLogs',undefined,{query:{...query}});}
 async changePassword(input:ChangePasswordInput){const result=await this.call('changePassword',input);this.csrf='';this.identity='';this.authenticated=false;this.sessionChanged('password-changed');return result;}
 administrators(search:string,page:number){return this.call('listAdministrators',undefined,{query:{search,page}});}
 createAdministrator(input:UserCreate){return this.call('createAdministrator',input);}
 updateAdministrator(id:string,input:UserUpdate){return this.call('updateAdministrator',input,{params:{id}});}
  users(search: string, page: number, postId?: string) { return this.call('listUsers', undefined, { query: { search, page, ...(postId ? { post_id: postId } : {}) } }); }
  listPosts() { return this.call('listPosts'); }
  createPost(input: PostSaveInput) { return this.call('createPost', input); }
  updatePost(id: string, input: PostSaveInput) { return this.call('updatePost', input, { params: { id } }); }
  deletePost(id: string) { return this.call('deletePost', undefined, { params: { id } }); }
  apiOperations() { return this.call('listAPIOperations'); }
  createUser(input: UserCreate) { return this.call('createUser', input); }
  updateUser(id: string, input: UserUpdate) { return this.call('updateUser', input, { params: { id } }); }
  resetUserPassword(id: string, input: AdminPasswordResetInput) { return this.call('resetUserPassword', input, { params: { id } }); }
  listDepartments() { return this.call('listDepartments'); }
  createDepartment(input: DepartmentSaveInput) { return this.call('createDepartment', input); }
  updateDepartment(id: string, input: DepartmentSaveInput) { return this.call('updateDepartment', input, { params: { id } }); }
  deleteDepartment(id: string) { return this.call('deleteDepartment', undefined, { params: { id } }); }
  adminDashboard() { return this.call('adminDashboard'); }
  roles() { return this.call('listRoles'); }
  createRole(input: RoleSaveInput) { return this.call('createRole', input); }
  updateRole(id: string, input: RoleSaveInput) { return this.call('updateRole', input, { params: { id } }); }
  deleteRole(id: string) { return this.call('deleteRole', undefined, { params: { id } }); }
  menuConfig() { return this.call('listMenus'); }
  saveMenuConfig(input: MenuSaveInput) { return this.call('saveMenus', input); }
  assignMenuRoles(id: string, input: MenuRoleAssignmentInput) { return this.call('assignMenuRoles', input, { params: { id } }); }
  dictionaries() { return this.call('listDictionaries'); }
  dictionary(id: string) { return this.call('getDictionary', undefined, { params: { id } }); }
  createDictionary(input: DictionaryCreateInput) { return this.call('createDictionary', input); }
  updateDictionary(id: string, input: DictionaryUpdateInput) { return this.call('updateDictionary', input, { params: { id } }); }
  deleteDictionary(id: string) { return this.call('deleteDictionary', undefined, { params: { id } }); }
  replaceDictionaryItems(id: string, input: DictionaryItemsInput) { return this.call('replaceDictionaryItems', input, { params: { id } }); }
  dictionaryByCode(code: string) { return this.call('dictionary', undefined, { params: { code } }); }
  roleOptions() { return this.call('roleOptions'); }
  adminRoleOptions() { return this.call('adminRoleOptions'); }
  inbox() { return this.call('inbox'); }
  readInbox(id: string) { return this.call('readInbox', undefined, { params: { id } }); }
  readAllInbox() { return this.call('readAllInbox'); }
  listTasks() { return this.call('listTasks'); }
  createTask(input: TaskCreateInput) { return this.call('createTask', input); }
  editTask(name: string, input: TaskEditInput) { return this.call('editTask', input, { params: { name } }); }
  deleteTask(name: string) { return this.call('deleteTask', undefined, { params: { name } }); }
  listTaskRuns(name: string) { return this.call('listTaskRuns', undefined, { params: { name } }); }
  updateTask(name: string, input: TaskUpdateInput) { return this.call('updateTask', input, { params: { name } }); }
  triggerTask(name: string) { return this.call('triggerTask', undefined, { params: { name } }); }
  createFileUpload(input: FileUploadInput) { return this.call('createFileUpload', input); }
  // Small uploads stream the raw bytes through the granted URL; direct grants go to object storage with omit credentials.
  async uploadFileContent(grant: FileUploadGrant, content: Blob) {
    if (grant.direct) {
      const response = await this.fetcher(grant.url, { method: grant.method, body: content, headers: grant.headers, credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new AppError('STORAGE_UPLOAD_FAILED', '文件上传失败，请重试');
      return { success: true };
    }
    return await this.request<{ success: boolean }>(grant.url.replace(/^\/api\/v1/, ''), { method: 'PUT', body: content, headers: { 'Content-Type': 'application/octet-stream', ...grant.headers } });
  }
  completeFileUpload(id: string) { return this.call('completeFileUpload', undefined, { params: { id } }); }
  branding() { return this.call('adminBranding'); }
  updateBranding(input: BrandingInput) { return this.call('adminUpdateBranding',input); }
  storageLocations(){return this.call('storageLocations');}
 saveStorage(input:StorageLocationInput,id?:string){return id?this.call('updateStorageLocation',input,{params:{id},timeoutMs:35000}):this.call('createStorageLocation',input);}
 removeStorage(id:string){return this.call('deleteStorageLocation',undefined,{params:{id}});}
 testStorage(id:string){return this.call('testStorageLocation',undefined,{params:{id},timeoutMs:35000});}
 activateStorage(id:string){return this.call('activateStorageLocation',undefined,{params:{id}});}
 storageBrowser(id:string,origin:string){return this.call('configureStorageBrowser',{origin},{params:{id},timeoutMs:35000});}
 cleanupStorage(){return this.call('cleanupFiles');}
 listFiles(search:string,page:number){return this.call('listFiles',undefined,{query:{search,page}});}
 fileAccess(id:string){return this.call('fileAccess',undefined,{params:{id}});}
 deleteFile(id:string){return this.call('deleteFile',undefined,{params:{id}});}
 migrateFile(id:string,locationID:string){return this.call('migrateFile',{location_id:locationID},{params:{id},timeoutMs:600000});}
 uploadPolicy(){return this.call('fileUploadPolicy');}
 uploadStatus(id:string){return this.call('multipartUpload',undefined,{params:{id}});}
 async uploadFile(file:File,options?:UploadOptions,scope?:'notes'|'avatar'):Promise<FileEntry>{
  const call=this.fileCalls(scope);
  const epoch=this.epoch;const stop=new AbortController();
  const signal=options?.signal?AbortSignal.any([options.signal,stop.signal]):stop.signal;
  const unsubscribe=this.subscribeSession(()=>stop.abort());
  try{
   const policy=await call('fileUploadPolicy',undefined,{signal});
   if(!options?.resumeId&&file.size>policy.max_size)throw new AppError('INVALID_INPUT','文件超过管理员设置的大小上限');
   options?.onStage?.('hashing');
   const fingerprint=await fileFingerprint(file,signal,options?.onHashProgress);
   const session=options?.resumeId?await call('multipartUpload',undefined,{params:{id:options.resumeId},signal}):await call('createMultipartUpload',{original_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size,fingerprint,...(options?.uploadPath ? {upload_path:options.uploadPath} : {})},{signal,timeoutMs:35000});
   if(session.fingerprint!==fingerprint||session.file.size!==file.size||session.file.original_name!==file.name||session.file.mime_type!==(file.type||'application/octet-stream'))throw new AppError('UPLOAD_FILE_MISMATCH','请选择原来上传的同一个文件，文件内容不一致');
   options?.onSession?.(session);
   if(session.file.state==='ready')return session.file;
   options?.onStage?.('uploading');
   let loaded=session.parts.reduce((sum,part)=>sum+part.size,0);let completed=session.parts.length;
   const progress=()=>options?.onProgress?.({loaded,total:file.size,completedParts:completed,totalParts:session.part_count});progress();
   const present=new Set(session.parts.map(p=>p.number));
   const missing=Array.from({length:session.part_count},(_,i)=>i+1).filter(n=>!present.has(n));let cursor=0;
   if(session.file.state==='pending'){
    const worker=async()=>{while(cursor<missing.length){const number=missing[cursor++];const start=(number-1)*session.part_size;const part=file.slice(start,start+session.part_size);
     for(let attempt=0;;attempt++){
      signal.throwIfAborted();if(epoch!==this.epoch)throw new AppError('SESSION_CHANGED','会话已变化，请重新登录');
      try{
       // A fresh grant on every retry also renews expired cloud signatures without discarding good parts.
       const grant=await call('signUploadPart',{number},{params:{id:session.file.file_id},signal,timeoutMs:35000});
       if(grant.direct){
        const response=await this.fetcher(grant.url,{method:'PUT',body:part,headers:grant.headers,credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(600000)])});
        if(!response.ok)throw new AppError('STORAGE_UPLOAD_FAILED','分片上传失败，已完成的分片会保留，可继续重试');
       }else await this.request(grant.url.replace(/^\/api\/v1/,''),{method:'PUT',body:part,headers:grant.headers,signal},600000);
       loaded+=part.size;completed++;progress();break;
      }catch(error){
       if(signal.aborted||attempt>=2||error instanceof AppError&&!['NETWORK_ERROR','REQUEST_TIMEOUT','STORAGE_UPLOAD_FAILED','STORAGE_UNAVAILABLE'].includes(error.code))throw error;
       await retryDelay(500*2**attempt,signal);
      }
     }
    }};
    let failure:unknown;
    await Promise.allSettled(Array.from({length:Math.min(policy.parallelism,missing.length)},()=>worker().catch(error=>{if(!failure)failure=error;stop.abort();throw error;})));
    if(failure)throw failure;
   }
   signal.throwIfAborted();if(epoch!==this.epoch)throw new AppError('SESSION_CHANGED','会话已变化，请重新登录');
   options?.onStage?.('confirming');
   return await call('completeMultipartUpload',undefined,{params:{id:session.file.file_id},signal,timeoutMs:7200000});
  }catch(error){
   if(epoch!==this.epoch)throw new AppError('SESSION_CHANGED','会话已变化，请重新登录');
   if(options?.signal?.aborted)throw new AppError('REQUEST_CANCELLED','上传已暂停，已完成的分片会保留');
   if(!(error instanceof AppError))throw new AppError('STORAGE_UPLOAD_FAILED','分片上传失败，已完成的分片会保留，可继续重试');
   throw error;
  }finally{unsubscribe();}
 }
  listNotes(query:NoteQuery) { return this.call('listNotes',undefined,{query:{...query}}); }
  createNote(input:NoteInput) { return this.call('createNote',input); }
  updateNote(id:string,input:NoteUpdate) { return this.call('updateNote',input,{params:{id}}); }
  deleteNote(id:string,version:number) { return this.call('deleteNote',{version},{params:{id}}); }
  settings() { return this.call(this.platform ? 'adminSettings' : 'localSettings'); }
  personalTokens(){return this.call('personalTokens');}
  createPersonalToken(input:PersonalTokenInput){return this.call('createPersonalToken',input);}
  revokePersonalToken(id:string){return this.call('revokePersonalToken',undefined,{params:{id}});}
  personalTokenScopes(){return this.call('personalTokenScopes');}
  patchSettings(input: SettingPatch) { return this.call(this.platform ? 'adminPatchSettings' : 'localPatchSettings', input); }
  monitorSnapshot() { return this.call(this.platform ? 'adminMonitorSnapshot' : 'monitorSnapshot'); }
  monitorEvents() { return this.call(this.platform ? 'adminMonitorEvents' : 'monitorEvents'); }
  alertRules() { return this.call('adminMonitorAlertRules'); }
  updateAlertRules(input: MonitorAlertRules) { return this.call('adminUpdateMonitorAlertRules', input); }
  probeStorage(location: string) { return this.call('adminMonitorStorageProbe', undefined, { params: { location } }); }
}

export interface DesktopBridge {
 FileUploadPolicy?():Promise<UploadPolicyResponse>;
 ListFiles?(search:string,page:number):Promise<FileListResponse>;
 BeginFileUpload?(input:MultipartUploadInput):Promise<MultipartUploadResponse>;
 FileUploadStatus?(id:string):Promise<MultipartUploadResponse>;
 ReceiveFilePart?(id:string,number:number,data:string):Promise<ActionResultResponse>;
 CompleteFileUpload?(id:string):Promise<FileEntryResponse>;
 DeleteFile?(id:string):Promise<ActionResultResponse>;
 SaveFile?(id:string):Promise<ActionResultResponse>;

 Updates?():Promise<UpdateOverviewResponse>;
 CheckUpdate?():Promise<UpdateOverviewResponse>;
 ApplyUpdate?(input:UpdateApplyInput):Promise<UpdateJobResponse>;
  ListNotes?(query:NoteQuery):Promise<NoteListResponse>;
  CreateNote?(input:NoteInput):Promise<NoteResponse>;
  UpdateNote?(id:string,input:NoteUpdate):Promise<NoteResponse>;
  DeleteNote?(id:string,input:NoteVersion):Promise<ActionResultResponse>;
  Bootstrap(): Promise<BootstrapResponse>;
  Execute(input: ExecuteInput): Promise<ExecuteResponse>;
  Settings?(): Promise<SettingsResponse>;
  PatchSettings?(input: SettingPatch): Promise<SettingsResponse>;
  MonitorSnapshot?(): Promise<MonitorSnapshotResponse>;
  MonitorEvents?(): Promise<MonitorEventListResponse>;
}

export class WailsTransport implements AppClient {
  readonly transport = 'wails' as const;
 readonly files:FileClient={
  uploadPolicy:async()=>unwrap(await this.fileBridge().FileUploadPolicy!()),
  uploadStatus:async id=>unwrap(await this.fileBridge().FileUploadStatus!(id)),
  listFiles:async(search,page)=>unwrap(await this.fileBridge().ListFiles!(search,page)),
  uploadFile:(file,options)=>this.uploadNative(file,options),
  fileAccess:async()=>{throw new AppError('NOT_AVAILABLE','此运行形态不提供文件管理');},
  deleteFile:async id=>unwrap(await this.fileBridge().DeleteFile!(id)),
  migrateFile:async()=>{throw new AppError('NOT_AVAILABLE','此运行形态不提供文件管理');},
  downloadFile:async id=>{unwrap(await this.fileBridge().SaveFile!(id));},
 };
 businessFiles(scope:'notes'|'avatar'):FileClient {
  if(scope!=='notes')throw new AppError('NOT_AVAILABLE','此运行形态不提供平台接口');
  return this.files;
 }
 private fileBridge():DesktopBridge {
  const bridge=this.bridge();
  if(!bridge.FileUploadPolicy||!bridge.BeginFileUpload||!bridge.FileUploadStatus||!bridge.ReceiveFilePart||!bridge.CompleteFileUpload||!bridge.ListFiles||!bridge.DeleteFile||!bridge.SaveFile)throw new AppError('NOT_AVAILABLE','文件服务尚未就绪');
  return bridge;
 }
 private async uploadNative(file:File,options?:UploadOptions):Promise<FileEntry>{
  const bridge=this.fileBridge(),signal=options?.signal??new AbortController().signal;
  const check=()=>{if(signal.aborted)throw new AppError('REQUEST_CANCELLED','上传已暂停，已完成的分片会保留');};
  try {
   check();const policy=unwrap(await bridge.FileUploadPolicy!());
   if(!options?.resumeId&&file.size>policy.max_size)throw new AppError('INVALID_INPUT','文件超过管理员设置的大小上限');
   options?.onStage?.('hashing');const fingerprint=await fileFingerprint(file,signal,options?.onHashProgress);check();
   const session=unwrap(options?.resumeId?await bridge.FileUploadStatus!(options.resumeId):await bridge.BeginFileUpload!({original_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size,fingerprint}));
   if(session.fingerprint!==fingerprint||session.file.size!==file.size||session.file.original_name!==file.name||session.file.mime_type!==(file.type||'application/octet-stream'))throw new AppError('UPLOAD_FILE_MISMATCH','请选择原来上传的同一个文件，文件内容不一致');
   options?.onSession?.(session);if(session.file.state==='ready')return session.file;
   options?.onStage?.('uploading');let loaded=session.parts.reduce((sum,part)=>sum+part.size,0),completed=session.parts.length;
   const progress=()=>options?.onProgress?.({loaded,total:file.size,completedParts:completed,totalParts:session.part_count});progress();
   const present=new Set(session.parts.map(part=>part.number));
   for(let number=1;number<=session.part_count;number++){
    if(present.has(number))continue;check();const part=file.slice((number-1)*session.part_size,number*session.part_size);
    const bytes=new Uint8Array(await part.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    check();unwrap(await bridge.ReceiveFilePart!(session.file.file_id,number,btoa(binary)));loaded+=part.size;completed++;progress();
   }
   check();options?.onStage?.('confirming');return unwrap(await bridge.CompleteFileUpload!(session.file.file_id));
  }catch(error){check();throw error;}
 }

 readonly updates:UpdateClient={
 overview:async()=>{const m=this.bridge().Updates;if(!m)throw new AppError('NOT_AVAILABLE','此版本未启用系统更新');return unwrap(await m());},
 check:async()=>{const m=this.bridge().CheckUpdate;if(!m)throw new AppError('NOT_AVAILABLE','此版本未启用系统更新');return unwrap(await m());},
 apply:async input=>{const m=this.bridge().ApplyUpdate;if(!m)throw new AppError('NOT_AVAILABLE','此版本未启用系统更新');return unwrap(await m(input));}
 };
  readonly notes:NoteClient=this;
  async listNotes(q:NoteQuery) { const method=this.bridge().ListNotes; if(!method)throw new AppError('NOT_AVAILABLE','笔记存储未初始化');return unwrap(await method(q)); }
  async createNote(input:NoteInput) { const method=this.bridge().CreateNote;if(!method)throw new AppError('NOT_AVAILABLE','笔记存储未初始化');return unwrap(await method(input)); }
  async updateNote(id:string,input:NoteUpdate) {const method=this.bridge().UpdateNote;if(!method)throw new AppError('NOT_AVAILABLE','笔记存储未初始化');return unwrap(await method(id,input));}
  async deleteNote(id:string,version:number) {const method=this.bridge().DeleteNote;if(!method)throw new AppError('NOT_AVAILABLE','笔记存储未初始化');return unwrap(await method(id,{version}));}
  constructor(private readonly bridge: () => DesktopBridge) {}
  async bootstrap() { return unwrap(await this.bridge().Bootstrap()); }
  async execute(input: ExecuteInput) { return unwrap(await this.bridge().Execute(input)); }
  async settings() { const method = this.bridge().Settings; if (!method) throw new AppError('NOT_AVAILABLE', '此版本不支持持久化设置'); return unwrap(await method()); }
  async patchSettings(input: SettingPatch) { const method = this.bridge().PatchSettings; if (!method) throw new AppError('NOT_AVAILABLE', '此版本不支持持久化设置'); return unwrap(await method(input)); }
  async monitorSnapshot() { const method = this.bridge().MonitorSnapshot; if (!method) throw new AppError('NOT_AVAILABLE', '此版本未提供运行监控'); return unwrap(await method()); }
  async monitorEvents() { const method = this.bridge().MonitorEvents; if (!method) throw new AppError('NOT_AVAILABLE', '此版本未提供运行监控'); return unwrap(await method()); }
}

// An immutable bearer credential belongs to one client identity. Construct a new
// transport after rotation; no credentials are persisted in browser storage.
export class BearerTransport extends HttpTransport {
 constructor(baseURL:string,token='',fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  super(baseURL,fetcher,'user',token);
 }
}

// Client-owned credentials remain in memory. Applications may persist pairs in
// their platform's secure storage; this SDK never writes localStorage/cookies.
export class ClientTokenSession {
  private pair?: ClientTokenPair;
  private client?: BearerTransport;
  private refreshing?: Promise<ClientTokenPair>;
  private readonly auth: BearerTransport;
  private generation = 0;
  constructor(private readonly baseURL:string,private readonly fetcher:typeof fetch=globalThis.fetch.bind(globalThis),private readonly onTokens?:(pair:ClientTokenPair|undefined)=>void){
    this.auth=new BearerTransport(baseURL,'',fetcher);
  }
  accept(pair:ClientTokenPair){
    this.generation++;
    this.pair=pair;this.client=new BearerTransport(this.baseURL,pair.access_token,this.fetcher);this.onTokens?.(pair);
  }
  captcha():Promise<Captcha>{return this.auth.captcha();}
  async login(input:LoginInput):Promise<ClientTokenLogin>{
    const epoch=++this.generation;this.pair=undefined;this.client=undefined;this.onTokens?.(undefined);
    const result=await this.auth.call('clientTokenLogin',input);
    if(epoch!==this.generation)throw new AppError('SESSION_CHANGED','会话已变化，请重新获取数据');
    if(result.tokens)this.accept(result.tokens);
    return result;
  }
  async completeMFA(challenge_token:string,code:string){
    const epoch=this.generation;
    const pair=await this.auth.call('clientTokenMFA',{challenge_token,code});
    if(epoch!==this.generation)throw new AppError('SESSION_CHANGED','会话已变化，请重新获取数据');
    this.accept(pair);return pair;
  }
  refresh():Promise<ClientTokenPair>{
    if(this.refreshing)return this.refreshing;
    if(!this.pair)return Promise.reject(new AppError('AUTH_REQUIRED','请重新登录'));
    const refresh_token=this.pair.refresh_token, epoch=this.generation;
    const pending=this.auth.call('refreshClientToken',{refresh_token}).then(pair=>{
      if(epoch!==this.generation)throw new AppError('SESSION_CHANGED','会话已变化，请重新获取数据');
      this.accept(pair);return pair;
    }).catch(error=>{
      if(epoch===this.generation){this.generation++;this.pair=undefined;this.client=undefined;this.onTokens?.(undefined);}
      throw error;
    }).finally(()=>{if(this.refreshing===pending)this.refreshing=undefined;});
    this.refreshing=pending;return pending;
  }
  async call<K extends OperationId>(id:K,...args:OperationInputs[K] extends undefined?[input?:undefined,options?:OperationOptions]:[input:OperationInputs[K],options?:OperationOptions]):Promise<OperationData[K]>{
    if(!this.client)throw new AppError('AUTH_REQUIRED','请重新登录');
    const before=this.client, owner=this.pair?.user.id;
    try{
      const result=await before.call(id,...args);
      if(this.pair?.user.id!==owner)throw new AppError('SESSION_CHANGED','会话已变化，请重新获取数据');
      return result;
    }catch(error){
      if(this.pair?.user.id!==owner)throw new AppError('SESSION_CHANGED','会话已变化，请重新获取数据');
      if(!(error instanceof AppError)||!['AUTH_REQUIRED','INVALID_CREDENTIALS'].includes(error.code))throw error;
      // An older in-flight request must not rotate an already replaced pair.
      if(this.client===before)await this.refresh();
      if(!this.client)throw error;
      return this.client.call(id,...args);
    }
  }
  async logout(){
    const refresh_token=this.pair?.refresh_token;
    this.generation++;this.pair=undefined;this.client=undefined;this.onTokens?.(undefined);
    if(refresh_token)await this.auth.call('revokeClientToken',{refresh_token});
  }
}
