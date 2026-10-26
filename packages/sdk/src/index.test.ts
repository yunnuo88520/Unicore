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
    await expect(new HttpTransport('', fetcher).execute({ text: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT', requestId: 'r-2' });
  });
  it('reports network and malformed responses', async () => {
    await expect(new HttpTransport('', vi.fn().mockRejectedValue(new Error('offline'))).bootstrap()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(new HttpTransport('', vi.fn().mockResolvedValue(new Response('<html>'))).bootstrap()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
