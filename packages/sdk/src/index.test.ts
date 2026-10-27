// Author: yunnuo <ymz@ebox.vip>
import { describe, expect, it, vi } from 'vitest';
import { HttpTransport, WailsTransport } from './index';

const output = { characters: 5, words: 1, lines: 1, bytes: 5, sha256: 'abc' };
const response = { code: 'OK', message: '', request_id: 'request-1', data: output };
describe('AppClient transports', () => {
  it('returns identical results for HTTP and native bridge', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } }));
    const http = new HttpTransport('', fetcher);
    const bridge = { Execute: vi.fn().mockResolvedValue(response), Bootstrap: vi.fn() };
    expect(await http.execute({ text: 'hello' })).toEqual(await new WailsTransport(() => bridge).execute({ text: 'hello' }));
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/core/execute');
  });
  it('preserves stable error codes and request IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'INVALID_INPUT', message: 'Invalid', request_id: 'r-2' }), { status: 400 }));
    await expect(new HttpTransport('', fetcher).execute({ text: 'valid wire input' })).rejects.toMatchObject({ code: 'INVALID_INPUT', requestId: 'r-2' });
  });
  it('reports network and malformed responses', async () => {
    await expect(new HttpTransport('', vi.fn().mockRejectedValue(new Error('offline'))).bootstrap()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(new HttpTransport('', vi.fn().mockResolvedValue(new Response('<html>'))).bootstrap()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

it('expires an authenticated session once and rejects responses from its previous generation', async () => {
  let complete!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...response, data: { profile: 'web-platform', current_user: { id: 'old' }, csrf_token: 'old-csrf' } })))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }))
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ code: 'AUTH_REQUIRED', message: 'Expired', request_id: 'expired' }), { status: 401 })));
  const http = new HttpTransport('', fetcher); const listener = vi.fn(); http.subscribeSession(listener);
  await http.bootstrap();
  const previous = http.users('', 1);
  await expect(http.systemLogs()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  complete(new Response(JSON.stringify({ ...response, data: { items: [{ username: 'old-private-user' }] } })));
  await expect(previous).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  await expect(http.roles()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(listener).toHaveBeenCalledExactlyOnceWith('expired');
  expect(new Headers(fetcher.mock.calls.at(-1)![1].headers).has('X-CSRF-Token')).toBe(false);
});

it('preserves field errors and distinguishes cancellation from unavailable network', async () => {
  const http = new HttpTransport('', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'INVALID_INPUT', message: 'Invalid', request_id: 'field', fields: { username: 'Too long' } }), { status: 400 })));
  await expect(http.createUser({ username: 'validuser', email: 'valid@example.test', password: 'test-password-strong', role: 'user' })).rejects.toMatchObject({ fields: { username: 'Too long' } });
  const controller = new AbortController(); controller.abort();
  const cancelled = new HttpTransport('', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
  await expect(cancelled.bootstrap({ signal: controller.signal })).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
});

it('retains the current session when local password confirmation fails', async () => {
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({...response,data:{profile:'web-platform',current_user:{id:'current'},csrf_token:'current-csrf'}})))
    .mockResolvedValueOnce(new Response(JSON.stringify({code:'INVALID_CREDENTIALS',message:'账号或密码不正确',request_id:'password'}),{status:401}))
    .mockResolvedValueOnce(new Response(JSON.stringify(response)));
  const client=new HttpTransport('',fetcher);const changed=vi.fn();client.subscribeSession(changed);await client.bootstrap();
  await expect(client.oidcLink('wrong-password')).rejects.toMatchObject({code:'INVALID_CREDENTIALS'});
  expect(changed).not.toHaveBeenCalled();await client.execute({text:'still authenticated'});
  expect(new Headers(fetcher.mock.calls.at(-1)![1].headers).get('X-CSRF-Token')).toBe('current-csrf');
});

it('notifies when a visible anonymous tab discovers a browser callback login', async () => {
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({...response,data:{profile:'web-platform',csrf_token:''}})))
    .mockResolvedValueOnce(new Response(JSON.stringify({...response,data:{profile:'web-platform',current_user:{id:'callback-user'},csrf_token:'new-csrf'}})));
  const client=new HttpTransport('',fetcher);const changed=vi.fn();client.subscribeSession(changed);
  await client.bootstrap();expect(changed).not.toHaveBeenCalled();await client.bootstrap();expect(changed).toHaveBeenCalledExactlyOnceWith('external');
});

it('uploads directly without forwarding platform credentials and confirms only after storage success', async()=>{
 const envelope=(data:unknown)=>new Response(JSON.stringify({code:'OK',request_id:'storage-test',message:'',data}));
 const grant={file_id:'f1',url:'https://objects.example.test/private',method:'POST',headers:{},fields:{key:'pending/random',policy:'short-lived'},direct:true,expires_at:9999999999};
 const fetcher=vi.fn().mockResolvedValueOnce(envelope({profile:'web-platform',current_user:{id:'u1'},csrf_token:'platform-csrf'})).mockResolvedValueOnce(envelope(grant)).mockResolvedValueOnce(new Response(null,{status:204})).mockResolvedValueOnce(envelope({file_id:'f1',state:'ready'}));
 const client=new HttpTransport('',fetcher);await client.bootstrap();await client.uploadFile(new File(['hello'],'hello.txt',{type:'text/plain'}));
 const direct=fetcher.mock.calls[2];expect(direct[0]).toBe(grant.url);expect(direct[1].credentials).toBe('omit');expect(new Headers(direct[1].headers).has('X-CSRF-Token')).toBe(false);expect(new Headers(direct[1].headers).has('X-Unicore-Identity')).toBe(false);expect(direct[1].body).toBeInstanceOf(FormData);expect(direct[1].body.get('key')).toBe('pending/random');
 expect(fetcher.mock.calls[3][0]).toBe('/api/v1/files/uploads/f1/complete');expect(new Headers(fetcher.mock.calls[3][1].headers).get('X-CSRF-Token')).toBe('platform-csrf');
});
it('does not confirm a failed direct upload',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'OK',request_id:'upload',data:{file_id:'bad',url:'https://objects.example.test/pending',method:'PUT',headers:{'Content-Type':'text/plain'},fields:{},direct:true}}))).mockResolvedValueOnce(new Response(null,{status:403}));
 await expect(new HttpTransport('',fetcher).uploadFile(new File(['hello'],'file.txt',{type:'text/plain'}))).rejects.toMatchObject({code:'STORAGE_UPLOAD_FAILED'});expect(fetcher).toHaveBeenCalledTimes(2);
});
