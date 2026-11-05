// Author: yunnuo <ymz@ebox.vip>
import { describe, expect, it, vi } from 'vitest';
import { HttpTransport } from './index';

const ok = (data: unknown) => new Response(JSON.stringify({ code: 'OK', message: '', request_id: 'r-1', data }), { headers: { 'Content-Type': 'application/json' } });

const roles = { items: [], total: 0 };

describe('GET in-flight dedup', () => {
  it('shares identical concurrent GETs into one request', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok(roles)));
    const http = new HttpTransport('', fetcher);
    const [first, second] = await Promise.all([http.roles(), http.roles()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    // The shared request is removed once settled, so later calls refetch.
    await http.roles();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not share different queries or non-GET operations', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok({ items: [], total: 1 })));
    const http = new HttpTransport('', fetcher);
    await Promise.all([http.users('', 1), http.users('', 2)]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockClear();
    const poster = vi.fn().mockImplementation(() => Promise.resolve(ok({ success: true })));
    const client = new HttpTransport('', poster);
    await Promise.all([client.logout(), client.logout()]);
    expect(poster).toHaveBeenCalledTimes(2);
  });

  it('aborting one caller neither cancels the shared fetch nor its siblings', async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    const http = new HttpTransport('', fetcher);
    const controller = new AbortController();
    const aborted = http.call('listRoles', undefined, { signal: controller.signal });
    const survivor = http.roles();
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    release(ok(roles));
    await expect(survivor).resolves.toEqual(roles);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects pre-aborted callers without issuing a request', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(ok(roles)));
    const http = new HttpTransport('', fetcher);
    const controller = new AbortController();
    controller.abort();
    await expect(http.call('listRoles', undefined, { signal: controller.signal })).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('propagates shared failures to every joined caller and clears the slot', async () => {
    const fetcher = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'boom', request_id: 'r-2' }), { status: 500 })))
      .mockImplementation(() => Promise.resolve(ok(roles)));
    const http = new HttpTransport('', fetcher);
    await expect(Promise.all([http.roles(), http.roles()])).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(http.roles()).resolves.toEqual(roles);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
