/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared UI client; pages know neither fetch nor Wails globals.
 */
import {fileFingerprint,retryDelay} from './upload';
import type { UploadPolicy, MultipartUpload, AnnouncementEntry, AnnouncementPublic, AnnouncementInput, AnnouncementUpdate, AnnouncementQuery, AnnouncementList, AnnouncementFeed, AnnouncementSelection, AuditLogQuery, AuditLogExport, MailTemplate, MailTemplateInput, MailTemplateTestInput, UpdateOverview, UpdateJob, UpdateApplyInput, UpdateOverviewResponse, UpdateJobResponse, NoteEntry, NoteInput, NoteUpdate, NoteQuery, NoteList, NoteResponse, NoteListResponse, NoteVersion, ActionResultResponse, StorageLocation, StorageLocationInput, StorageLocationList, FileEntry, FileList, FileAccess, Branding, BrandingInput, BrandingResponse, Bootstrap, BootstrapResponse, ExecuteInput, ExecuteOutput, ExecuteResponse, InstallStatus, InstallInput, InstallResult, DatabaseInput, DatabaseCheck, InstallToken, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, Settings, SettingsResponse, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleList, RoleOptions, PermissionDefinition, OIDCInfo, OIDCStart, AuditLogList, ChangePasswordInput } from '@unicore/contracts';
import { operations, type OperationId, type OperationInputs, type OperationData } from '@unicore/contracts/operations';
import { validate, type SchemaName } from '@unicore/contracts/validate';
export { validate, type SchemaName } from '@unicore/contracts/validate';
export { operations, type OperationId } from '@unicore/contracts/operations';

export type { UploadPolicy, MultipartUpload, AnnouncementEntry, AnnouncementPublic, AnnouncementInput, AnnouncementUpdate, AnnouncementQuery, AnnouncementList, AnnouncementFeed, AnnouncementSelection, AuditLogQuery, AuditLogExport, MailTemplate, MailTemplateInput, MailTemplateTestInput, UpdateOverview, UpdateJob, UpdateApplyInput, UpdateRelease, NoteEntry, NoteInput, NoteUpdate, NoteQuery, NoteList, StorageLocation, StorageLocationInput, StorageLocationList, FileEntry, FileList, FileAccess, Branding, BrandingInput, Bootstrap, ExecuteInput, ExecuteOutput, Profile, InstallStatus, InstallInput, InstallResult, DatabaseInput, DatabaseCheck, InstallToken, LoginInput, Session, Captcha, Dashboard, User, UserList, UserCreate, UserUpdate, Settings, SettingPatch, AuthPolicy, RegisterInput, EmailRequest, ResetInput, MailJobList, EmailChallenge, EmailCodeInput, MailTemplateList, Role, RoleList, RoleOptions, PermissionDefinition, OIDCInfo, OIDCStart, AuditLogList, ChangePasswordInput } from '@unicore/contracts';

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId = '', public readonly fields: Record<string, string> = {}) { super(message); this.name = 'AppError'; }
}

export type SessionEvent = 'authenticated' | 'password-changed' | 'signed-out' | 'expired' | 'external';
export type RequestOptions = { signal?: AbortSignal };
export type UploadStage='hashing'|'uploading'|'confirming';
export type UploadProgress={loaded:number;total:number;completedParts:number;totalParts:number};
export type UploadOptions = RequestOptions & { resumeId?:string; onStage?: (stage: UploadStage) => void; onSession?:(session:MultipartUpload)=>void; onProgress?:(progress:UploadProgress)=>void; onHashProgress?:(loaded:number)=>void };
export type OperationOptions = RequestOptions & { timeoutMs?:number; params?: Record<string, string>; query?: Record<string, string | number>; headers?: Record<string, string> };

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
 branding?(): Promise<Branding>;
 updateBranding?(input: BrandingInput): Promise<Branding>;
  web?: WebClient;
 notes?: NoteClient;
 files?: FileClient;
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
 uploadPolicy():Promise<UploadPolicy>;
 uploadStatus(id:string):Promise<MultipartUpload>;
 listFiles(search:string,page:number):Promise<FileList>;
 uploadFile(file:File,options?:UploadOptions):Promise<FileEntry>;
 fileAccess(id:string):Promise<FileAccess>;
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
 adminAnnouncements(query:AnnouncementQuery):Promise<AnnouncementList>;
 createAnnouncement(input:AnnouncementInput):Promise<AnnouncementEntry>;
 updateAnnouncement(id:string,input:AnnouncementUpdate):Promise<AnnouncementEntry>;
 deleteAnnouncements(items:AnnouncementSelection[]):Promise<{success:boolean}>;
 saveAnnouncementSettings(enabled:boolean):Promise<{enabled:boolean}>;
 previewAnnouncement(input:AnnouncementInput):Promise<{content_html:string}>;
 announcements(page?:number,pageSize?:number):Promise<AnnouncementFeed>;
 announcement(id:string):Promise<AnnouncementPublic>;

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
  rotateInstallToken(token: string): Promise<InstallToken>;
  completeInstall(token: string, input: InstallInput): Promise<InstallResult>;
  captcha(): Promise<Captcha>;
  login(input: LoginInput): Promise<Session>;
  logout(): Promise<{ success: boolean }>;
  systemLogs(query?:AuditLogQuery): Promise<AuditLogList>;
 exportSystemLogs(query:AuditLogQuery):Promise<AuditLogExport>;
 changePassword(input:ChangePasswordInput):Promise<{success:boolean}>;
 administrators(search:string,page:number):Promise<UserList>;
 createAdministrator(input:UserCreate):Promise<User>;
 updateAdministrator(id:string,input:UserUpdate):Promise<User>;
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

const administratorOperations: Partial<Record<OperationId, OperationId>> = {
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
  "deleteFile": "adminDeleteFile"
};

export class HttpTransport implements AppClient, WebClient, FileClient, StorageClient {
  readonly transport = 'http' as const;
 readonly updates:UpdateClient={overview:()=>this.call('updateOverview'),check:()=>this.call('checkUpdate',undefined,{headers:{'Content-Type':'application/json'},timeoutMs:20000}),apply:input=>this.call('applyUpdate',input)};
  readonly notes:NoteClient=this;
  readonly web: WebClient = this;
 readonly files:FileClient=this;
 readonly storage:StorageClient=this;
  get sessionScope(): 'user'|'administrator' { return this.administrator?'administrator':'user'; }
  private csrf = '';
 private readonly administrator: boolean;
  private platform = false;
  private authenticated = false;
  private identity = '';
  private bootstrapped = false;
  private epoch = 0;
  private listeners = new Set<(event: SessionEvent) => void>();
  subscribeSession(listener: (event: SessionEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private sessionChanged(event: SessionEvent) { this.epoch++; for (const listener of this.listeners) listener(event); }
  resetSession() { this.csrf = ''; this.identity = ''; this.authenticated = false; this.bootstrapped = false; this.sessionChanged('external'); }
  constructor(private readonly baseURL = '', private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis), realm: 'user'|'administrator' = 'user') { this.administrator = realm === 'administrator'; }
  private async request<T>(path: string, init?: RequestInit,timeoutMS=20000): Promise<T> {
    const epoch = this.epoch;
    let response: Response;
    const headers = new Headers(init?.headers);
    if (this.csrf) headers.set('X-CSRF-Token', this.csrf);
    const timeout = AbortSignal.timeout(timeoutMS);
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
    return this.request<OperationData[K]>(path.replace(/^\/api\/v1/, ''), { method: operation.method, signal: options?.signal, headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...options?.headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) },options?.timeoutMs);
  }
  async bootstrap(options?: RequestOptions) {
    let data = await this.call('bootstrap', undefined, options);
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
  adminAnnouncements(query:AnnouncementQuery){return this.call('adminAnnouncements',undefined,{query:{...query}});}
 createAnnouncement(input:AnnouncementInput){return this.call('createAnnouncement',input);}
 updateAnnouncement(id:string,input:AnnouncementUpdate){return this.call('updateAnnouncement',input,{params:{id}});}
 deleteAnnouncements(items:AnnouncementSelection[]){return this.call('deleteAnnouncements',{items});}
 saveAnnouncementSettings(enabled:boolean){return this.call('saveAnnouncementSettings',{enabled});}
 previewAnnouncement(input:AnnouncementInput){return this.call('previewAnnouncement',input);}
 announcements(page=1,pageSize=5){return this.call('announcements',undefined,{query:{page,page_size:pageSize}});}
 announcement(id:string){return this.call('announcement',undefined,{params:{id}});}
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
  rotateInstallToken(token: string) { return this.call('rotateInstallToken', {}, { headers: { 'X-Bootstrap-Token': token } }); }
  completeInstall(token: string, input: InstallInput) { return this.call('completeInstall', input, { headers: { 'X-Bootstrap-Token': token } }); }
  captcha() { return this.call('captcha'); }
  async login(input: LoginInput) { const session = await this.call('login', input); this.csrf = session.csrf_token; this.identity = session.user.id; this.authenticated = true; this.sessionChanged('authenticated'); return session; }
  async logout() { const data = await this.call('logout'); this.csrf = ''; this.identity = ''; this.authenticated = false; this.sessionChanged('signed-out'); return data; }
  systemLogs(query?:AuditLogQuery){return this.call('systemLogs',undefined,{query:query?{...query}:undefined});}
 exportSystemLogs(query:AuditLogQuery){return this.call('exportSystemLogs',undefined,{query:{...query}});}
 async changePassword(input:ChangePasswordInput){const result=await this.call('changePassword',input);this.csrf='';this.identity='';this.authenticated=false;this.sessionChanged('password-changed');return result;}
 administrators(search:string,page:number){return this.call('listAdministrators',undefined,{query:{search,page}});}
 createAdministrator(input:UserCreate){return this.call('createAdministrator',input);}
 updateAdministrator(id:string,input:UserUpdate){return this.call('updateAdministrator',input,{params:{id}});}
  users(search: string, page: number) { return this.call('listUsers', undefined, { query: { search, page } }); }
  createUser(input: UserCreate) { return this.call('createUser', input); }
  updateUser(id: string, input: UserUpdate) { return this.call('updateUser', input, { params: { id } }); }
  roles() { return this.call('listRoles'); }
  roleOptions() { return this.call('roleOptions'); }
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
 async uploadFile(file:File,options?:UploadOptions):Promise<FileEntry>{
  const epoch=this.epoch;const stop=new AbortController();
  const signal=options?.signal?AbortSignal.any([options.signal,stop.signal]):stop.signal;
  const unsubscribe=this.subscribeSession(()=>stop.abort());
  try{
   const policy=await this.call('fileUploadPolicy',undefined,{signal});
   if(!options?.resumeId&&file.size>policy.max_size)throw new AppError('INVALID_INPUT','文件超过管理员设置的大小上限');
   options?.onStage?.('hashing');
   const fingerprint=await fileFingerprint(file,signal,options?.onHashProgress);
   const session=options?.resumeId?await this.call('multipartUpload',undefined,{params:{id:options.resumeId},signal}):await this.call('createMultipartUpload',{original_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size,fingerprint},{signal,timeoutMs:35000});
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
       const grant=await this.call('signUploadPart',{number},{params:{id:session.file.file_id},signal,timeoutMs:35000});
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
   return await this.call('completeMultipartUpload',undefined,{params:{id:session.file.file_id},signal,timeoutMs:7200000});
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
  patchSettings(input: SettingPatch) { return this.call(this.platform ? 'adminPatchSettings' : 'localPatchSettings', input); }
}

export interface DesktopBridge {
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
}

export class WailsTransport implements AppClient {
  readonly transport = 'wails' as const;
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
}
