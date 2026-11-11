// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit credentials, refresh single-flight and identity changes across pending API calls.
import { describe, expect, it, vi } from 'vitest';
import { BearerTransport, ClientTokenSession, type ClientTokenPair } from './index';

const user = { id: 'member', username: 'member', email: 'member@example.test', roles: ['user'], permissions: [], status: 'active', created_at: 1, last_login_at: 1, totp_enabled:false };
const pair = (access: string, refresh: string): ClientTokenPair => ({ access_token: access, refresh_token: refresh.padEnd(43, 'x'), token_type: 'Bearer', expires_in: 900, refresh_expires_at: 9999999999, user });
function response(data: unknown, code = 'OK', status = 200) { return new Response(JSON.stringify({ code, data, request_id: 'test', message: code }), { status }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('API token transports', () => {
  it('omits cookies and never adds CSRF to an explicit bearer request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ items: [], total: 0 }));
    const api = new BearerTransport('https://instance.example', 'ucp_test', fetcher);
    await api.call('listNotes');
    const init = fetcher.mock.calls[0][1]!;
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer ucp_test');
    expect(new Headers(init.headers).has('X-CSRF-Token')).toBe(false);
  });
  it('shares one refresh across distinct failed API calls', async () => {
    const gate = deferred<Response>(); let refreshes = 0;
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/auth/token/refresh')) { refreshes++; return gate.promise; }
      if (new Headers(init?.headers).get('Authorization') === 'Bearer old') return response(null, 'AUTH_REQUIRED', 401);
      return response({ items: [], total: 0 });
    };
    const session = new ClientTokenSession('https://instance.example', fetcher);
    session.accept(pair('old', 'refresh1'));
    const a = session.call('listNotes'); const b = session.call('adminListNotes');
    await vi.waitFor(() => expect(refreshes).toBe(1));
    gate.resolve(response(pair('new', 'refresh2')));
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
    expect(refreshes).toBe(1);
  });
  it('does not refresh permissions errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(null, 'PERMISSION_DENIED', 403));
    const session = new ClientTokenSession('https://instance.example', fetcher); session.accept(pair('valid', 'refresh1'));
    await expect(session.call('listNotes')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not deliver or retry old user data after the principal changes', async () => {
    const gate = deferred<Response>(); const fetcher = vi.fn<typeof fetch>().mockReturnValue(gate.promise);
    const session = new ClientTokenSession('https://instance.example', fetcher); session.accept(pair('old', 'refresh1'));
    const pending = session.call('listNotes');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    session.accept({ ...pair('other', 'refresh2'), user: { ...user, id: 'other' } });
    gate.resolve(response({ items: [], total: 0 })); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('a pending login cannot sign the user back in after logout', async () => {
    const gate = deferred<Response>(); const fetcher = vi.fn<typeof fetch>().mockReturnValue(gate.promise);
    const session = new ClientTokenSession('https://instance.example', fetcher);
    const pending = session.login({ username: 'member', password: 'test-password-strong', captcha_id: '', captcha_answer: '' });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    await session.logout(); gate.resolve(response({ mfa_required: false, tokens: pair('new', 'refresh1') })); await rejected;
    await expect(session.call('listNotes')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
