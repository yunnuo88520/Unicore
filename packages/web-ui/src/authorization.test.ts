// Author: yunnuo <ymz@ebox.vip>
// Description: Independent point/menu/action/API enforcement and workspace isolation.
import { expect, it } from 'vitest';
import type { Bootstrap } from '@unicore/sdk';
import { grantUI } from './test-authorization';
import { canAction } from './permissions';
import { canAccess } from './routes';
import { defaultNavigation } from './navigation';

function authorized(): Bootstrap {
 return grantUI({profile:'web-platform',identity_realm:'user',capabilities:{database:true},current_user:{id:'actor',roles:['writer'],permissions:['notes:access','notes:create','notes:delete']}} as unknown as Bootstrap);
}
it('requires the point, action and operation independently for a button',()=>{
 const data=authorized();expect(canAction(data,'createNote')).toBe(true);
 const user=data.current_user!;
 for(const replacement of [{permissions:['notes:access']},{operation_ids:[]},{action_ids:[]}]){
  expect(canAction({...data,current_user:{...user,...replacement}},'createNote')).toBe(false);
 }
 expect(canAction({...data,current_user:{...user,operation_ids:['createNote']}},'deleteNote')).toBe(false);
});
it('denies direct page URLs without menu grants while preserving personal security access',()=>{
 const data=authorized();expect(canAccess('notes',data)).toBe(true);
 const denied={...data,current_user:{...data.current_user!,menu_ids:[]}};
 expect(canAccess('notes',denied)).toBe(false);
 expect(canAccess('account-security',denied)).toBe(true);
 // API/action grants and menu grants have independent meanings.
 expect(canAction(denied,'createNote')).toBe(true);
});
it('isolates the same route and action between workspaces and respects hidden parents',()=>{
 const data=authorized();const admin=defaultNavigation('administrator');
 const switched={...data,identity_realm:'administrator',navigation:admin} as Bootstrap;
 expect(canAction(switched,'createNote')).toBe(false);
 expect(canAccess('notes',switched)).toBe(false);
 const hidden={...data,navigation:{...data.navigation!,nodes:data.navigation!.nodes.map(node=>node.id==='user:notes'?{...node,visible:false}:node)}};
 expect(canAction(hidden,'createNote')).toBe(false);
 expect(canAccess('notes',hidden)).toBe(false);
});
it('uses globally unique default node identities for menus and actions',()=>{
 const nodes=[...defaultNavigation('user').nodes,...defaultNavigation('administrator').nodes];
 expect(new Set(nodes.map(node=>node.id)).size).toBe(nodes.length);
});
it('preserves local profiles without platform grants',()=>{
 expect(canAction({profile:'desktop'} as Bootstrap,'createNote')).toBe(true);
});
