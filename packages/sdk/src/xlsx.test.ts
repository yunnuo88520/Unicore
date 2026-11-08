// Author: yunnuo <ymz@ebox.vip>
// Description: Contract-derived XLSX transport requests preserve binary bodies and parse row failures.
import {describe,it,expect,vi} from 'vitest';
import {HttpTransport,AppError} from './index';

describe('XLSX transport',()=>{
 it('downloads binary exports through generated paths and encoded search',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('xlsx',{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}}));
  const client=new HttpTransport('https://example.test',fetcher,'administrator');
  expect(await (await client.exportUsers('a&b')).text()).toBe('xlsx');
  expect(fetcher.mock.calls[0][0]).toBe('https://example.test/api/v1/admin/users/export.xlsx?search=a%26b');
  await client.usersImportTemplate();await client.exportFiles();
  expect(fetcher.mock.calls[1][0]).toContain('/users/import-template.xlsx');
  expect(fetcher.mock.calls[2][0]).toContain('/files/export.xlsx');
 });
 it('sends multipart without a JSON content type and returns safe row feedback',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({code:'OK',request_id:'r',data:{created:1,failed:[{row:3,error:'invalid row'}]}})));
  const result=await new HttpTransport('',fetcher,'administrator').importUsers(new File(['xlsx'],'users.xlsx'));
  expect(result).toEqual({created:1,errors:['3: invalid row']});
  const init=fetcher.mock.calls[0][1]!;
  expect(init.body).toBeInstanceOf(FormData);
  expect(new Headers(init.headers).has('Content-Type')).toBe(false);
 });
 it('preserves stable JSON errors on binary downloads',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({code:'AUTH_REQUIRED',message:'expired',request_id:'r'}),{status:401}));
  await expect(new HttpTransport('',fetcher).exportFiles()).rejects.toMatchObject({code:'AUTH_REQUIRED'} as Partial<AppError>);
 });
});
