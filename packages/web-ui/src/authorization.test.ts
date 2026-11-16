// Author: yunnuo <ymz@ebox.vip>
// Description: Independent point/menu/action/API enforcement and workspace isolation on the shared navigation tree.
import { expect, it } from 'vitest';
import type { Bootstrap, NavigationNode } from '@unicore/sdk';
import { grantUI } from './test-authorization';
import { canAction } from './permissions';
import { canAccess } from './routes';
import { defaultNavigation, newNavigationNode } from './navigation';

function authorized(): Bootstrap {
 return grantUI({profile:'web-platform',identity_realm:'user',capabilities:{database:true,features:{notes:true}},current_user:{id:'actor',roles:['writer'],permissions:['notes:access','notes:create','notes:delete']}} as unknown as Bootstrap);
}
it('requires the point, action and operation independently for a button',()=>{
 const data=authorized();
 // Action grants reuse the shared tree's global op:* node identities.
 expect(data.current_user!.action_ids).toContain('op:createNote');
 expect(canAction(data,'createNote')).toBe(true);
 const user=data.current_user!;
 for(const replacement of [{permissions:['notes:access']},{operation_ids:[]},{action_ids:[]}]){
  expect(canAction({...data,current_user:{...user,...replacement}},'createNote')).toBe(false);
 }
 expect(canAction({...data,current_user:{...user,operation_ids:['createNote']}},'deleteNote')).toBe(false);
});
it('denies direct page URLs without menu grants',()=>{
 const data=authorized();
 // menu_ids store unprefixed shared-tree node ids.
 expect(data.current_user!.menu_ids).toContain('notes');
 expect(canAccess('notes',data)).toBe(true);
 const denied={...data,current_user:{...data.current_user!,menu_ids:[]}};
 expect(canAccess('notes',denied)).toBe(false);
 // API/action grants and menu grants have independent meanings.
 expect(canAction(denied,'createNote')).toBe(true);
});
it('shares one tree across workspaces while node surfaces and hidden parents stay isolated',()=>{
 const data=authorized();
 const shared=defaultNavigation(['administrator']);
 const switched={...data,identity_realm:'administrator',navigation:shared} as Bootstrap;
 // The grant binds the contract operation: in the administrator realm the same
 // operation resolves to its mirrored /admin/ endpoint and stays authorized.
 expect(canAction(switched,'createNote')).toBe(true);
 // The shared tree itself is realm-agnostic: the same menu grant reaches the
 // page from both workspaces.
 expect(canAccess('notes',switched)).toBe(true);
 // Hidden parents cut both the page and its actions.
 const hidden={...data,navigation:{...data.navigation!,nodes:data.navigation!.nodes.map(node=>node.id==='notes'?{...node,visible:false}:node)}};
 expect(canAction(hidden,'createNote')).toBe(false);
 expect(canAccess('notes',hidden)).toBe(false);
});
it('keeps administrator-surface action nodes out of the user workspace',()=>{
 const config=defaultNavigation(['administrator']);
 // The default op:adminCreateNote action serves both surfaces; this fixture
 // narrows it to the administrator surface only.
 const adminOnlyAction: NavigationNode={...newNavigationNode('op:adminCreateNote','business','action',['administrator']),
  parent_id:'notes',permission:'notes:create',operation_ids:['adminCreateNote']};
 const nodes=[...config.nodes.filter(node=>node.id!=='op:adminCreateNote'),adminOnlyAction];
 const operator=grantUI({profile:'web-platform',identity_realm:'user',capabilities:{database:true,features:{notes:true}},
  navigation:{version:1,sections:config.sections,nodes},
  current_user:{id:'actor',roles:['ops'],permissions:['admin:access','notes:access','notes:create','notes:delete']}} as unknown as Bootstrap);
 // The action node only surfaces in the administrator workspace.
 expect(canAction(operator,'adminCreateNote')).toBe(false);
 expect(canAction({...operator,identity_realm:'administrator'} as Bootstrap,'adminCreateNote')).toBe(true);
});
it('serves every workspace from one default tree with globally unique op:* action identities',()=>{
 const tree=defaultNavigation(['user']);
 expect(defaultNavigation(['administrator'])).toEqual(tree);
 const nodes=tree.nodes;
 expect(new Set(nodes.map(node=>node.id)).size).toBe(nodes.length);
 for(const node of nodes) expect(node.id).not.toMatch(/^(user|administrator):/);
 const actions=nodes.filter(node=>node.type==='action');
 expect(actions.length).toBeGreaterThan(0);
 for(const action of actions) expect(action.id).toMatch(/^op:/);
});
it('keeps mirrored admin-exclusive endpoints super-admin-only',()=>{
 const points=['storage:write'];
 const restricted=grantUI({profile:'web-platform',identity_realm:'administrator',capabilities:{database:true,features:{notes:true}},
  current_user:{id:'ops',roles:['ops'],permissions:points}} as unknown as Bootstrap);
 // The permission-point gate passes, but the mirrored admin-exclusive
 // endpoint stays super-gated for restricted operators.
 expect(canAction(restricted,'adminDeleteFile')).toBe(false);
 const superUser=grantUI({profile:'web-platform',identity_realm:'administrator',capabilities:{database:true,features:{notes:true}},
  current_user:{id:'root',roles:['super_admin'],permissions:points}} as unknown as Bootstrap);
 expect(canAction(superUser,'adminDeleteFile')).toBe(true);
});
it('preserves local profiles without platform grants',()=>{
 expect(canAction({profile:'desktop'} as Bootstrap,'createNote')).toBe(true);
});
