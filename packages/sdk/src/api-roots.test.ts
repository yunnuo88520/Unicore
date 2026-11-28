// Author: yunnuo <ymz@ebox.vip>
// Description: Generated operation paths and same-origin upload grants retain their complete API root.
import {expect,it,vi} from 'vitest';
import {File as BufferFile} from 'node:buffer';

vi.mock('@unicore/contracts/operations',async importOriginal=>{
 const original=await importOriginal<typeof import('@unicore/contracts/operations')>();
 return {...original,operations:{...original.operations,
  bootstrap:{...original.operations.bootstrap,path:'/api/v2/bootstrap'},
  execute:{...original.operations.execute,path:'/api/v2/module/{id}/execute'},
  exportUsers:{...original.operations.exportUsers,path:'/api/v2/admin/users/export.xlsx'},
  importUsers:{...original.operations.importUsers,path:'/api/v12/admin/users/import.xlsx'},
 }};
});
import {HttpTransport} from './index';

const envelope=(data:unknown)=>new Response(JSON.stringify({code:'OK',data,request_id:'versions'}));
it('uses the full generated path for JSON calls, params, query and bearer credentials',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>Promise.resolve(envelope({profile:'web-platform'})));
 const client=new HttpTransport('https://app.example',fetcher,'user','bound-token');
 await client.bootstrap();
 await client.call('execute',{text:'hello'},{params:{id:'a/b'},query:{page:2}});
 expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['https://app.example/api/v2/bootstrap','https://app.example/api/v2/module/a%2Fb/execute?page=2']);
 expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer bound-token');
 expect(fetcher.mock.calls[1][1]?.credentials).toBe('omit');
});
it('uses complete generated binary and multipart paths',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('xlsx')).mockResolvedValueOnce(envelope({created:1,failed:[]}));
 const client=new HttpTransport('https://app.example',fetcher);
 await client.exportUsers('a&b');
 await client.importUsers(new BufferFile(['workbook'],'users.xlsx') as unknown as File);
 expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['https://app.example/api/v2/admin/users/export.xlsx?search=a%26b','https://app.example/api/v12/admin/users/import.xlsx']);
});
it('uses a local upload grant verbatim while refusing non-API and foreign credential destinations',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>Promise.resolve(envelope({success:true})));
 const client=new HttpTransport('https://app.example',fetcher);
 const grant={file_id:'file',url:'/api/v2/business/files/content',direct:false,method:'PUT' as const,headers:{},fields:{},expires_at:1800000000};
 await client.uploadFileContent(grant,new Blob(['bytes']));
 expect(fetcher.mock.calls[0][0]).toBe('https://app.example/api/v2/business/files/content');
 for(const url of ['https://foreign.example/api/v2/upload','//foreign.example/api/v2/upload','/unrelated/upload']){
  await expect(client.uploadFileContent({...grant,url},new Blob(['bytes']))).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 }
 expect(fetcher).toHaveBeenCalledTimes(1);
});
