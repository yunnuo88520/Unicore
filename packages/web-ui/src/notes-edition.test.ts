// Author: yunnuo <ymz@ebox.vip>
// Description: Compile-time omission and server capabilities independently close note navigation and deep links.
import { expect, it } from 'vitest';
import { createMemoryHistory } from '@tanstack/react-router';
import type { Bootstrap } from '@unicore/sdk';
import { canAccess } from './routes';
import { createWorkspaceRouter } from './router';
import { defaultNavigation } from './navigation';

it('matches note navigation and URL registration to the compiled feature', () => {
 const router=createWorkspaceRouter({history:()=>createMemoryHistory(),shell:()=>null});
 expect(Object.keys(router.routesByPath).includes('/notes')).toBe(__FEATURE_NOTES__);
 expect(defaultNavigation(['user','administrator']).nodes.some(node=>node.route_id==='notes')).toBe(__FEATURE_NOTES__);
 for(const profile of ['web-standalone','desktop'] as const){
  const metadata={profile,capabilities:{database:true,features:{notes:true}}} as unknown as Bootstrap;
  expect(canAccess('notes',metadata)).toBe(__FEATURE_NOTES__);
  metadata.capabilities.features!.notes=false;
  expect(canAccess('notes',metadata)).toBe(false);
 }
 expect(canAccess('notes',undefined)).toBe(false);
});
