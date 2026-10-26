/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared UI client; pages know neither fetch nor Wails globals.
 */
import type { Bootstrap, BootstrapResponse, ExecuteInput, ExecuteOutput, ExecuteResponse } from '@unicore/contracts';

export type { Bootstrap, ExecuteInput, ExecuteOutput, Profile } from '@unicore/contracts';

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId = '') { super(message); this.name = 'AppError'; }
}

export interface AppClient {
  readonly transport: 'http' | 'wails';
  bootstrap(): Promise<Bootstrap>;
  execute(input: ExecuteInput): Promise<ExecuteOutput>;
}

function unwrap<T>(response: { code: string; message: string; data: T; request_id: string }): T {
  if (response.code !== 'OK') throw new AppError(response.code, response.message, response.request_id);
  return response.data;
}

export class HttpTransport implements AppClient {
  readonly transport = 'http' as const;
  constructor(private readonly baseURL = '', private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try { response = await this.fetcher(`${this.baseURL}/api/v1${path}`, { credentials: 'same-origin', ...init, signal: AbortSignal.timeout(15000) }); }
    catch { throw new AppError('NETWORK_ERROR', '连接服务失败，请确认 Go 服务正在运行'); }
    let envelope: { code: string; message: string; data: T; request_id: string };
    try { envelope = await response.json(); }
    catch { throw new AppError('INVALID_RESPONSE', '服务返回了无法识别的响应'); }
    if (!response.ok && envelope.code === 'OK') throw new AppError('HTTP_ERROR', `服务请求失败 (${response.status})`);
    return unwrap(envelope);
  }
  bootstrap() { return this.request<Bootstrap>('/bootstrap'); }
  execute(input: ExecuteInput) { return this.request<ExecuteOutput>('/core/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
}

export interface DesktopBridge {
  Bootstrap(): Promise<BootstrapResponse>;
  Execute(input: ExecuteInput): Promise<ExecuteResponse>;
}

export class WailsTransport implements AppClient {
  readonly transport = 'wails' as const;
  constructor(private readonly bridge: () => DesktopBridge) {}
  async bootstrap() { return unwrap(await this.bridge().Bootstrap()); }
  async execute(input: ExecuteInput) { return unwrap(await this.bridge().Execute(input)); }
}
