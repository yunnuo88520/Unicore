/** Author: yunnuo <ymz@ebox.vip>
 * Description: Role display resolution: builtin localization, the preserved super_admin marker, catalogue names and raw-id fallback.
 */
import { expect, it } from 'vitest';
import { roleDisplayName, roleDisplayLabels } from './role-display';

it('localizes the builtin user role and preserves the super_admin marker', () => {
  expect(roleDisplayName('user')).toBe('用户');
  expect(roleDisplayName('super_admin')).toBe('super_admin');
});

it('resolves custom roles from the parallel catalogue names', () => {
  expect(roleDisplayName('role-uuid-1', ['运营', 'user'], 0)).toBe('运营');
  // A catalogue name equal to the id adds nothing over the raw id.
  expect(roleDisplayName('ops', ['ops'], 0)).toBe('ops');
});

it('degrades to the raw id when names are missing or short', () => {
  expect(roleDisplayName('gone-role')).toBe('gone-role');
  expect(roleDisplayName('gone-role', null)).toBe('gone-role');
  expect(roleDisplayName('gone-role', [], 0)).toBe('gone-role');
});

it('maps payload order through the parallel name list', () => {
  expect(roleDisplayLabels(['role-uuid-1', 'user'], ['运营', 'user'])).toEqual(['运营', '用户']);
  expect(roleDisplayLabels([])).toEqual([]);
});
