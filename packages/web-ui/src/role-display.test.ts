/** Author: yunnuo <ymz@ebox.vip>
 * Description: Role display resolution: builtin localization, catalogue names and raw-id fallback.
 */
import { expect, it } from 'vitest';
import { roleDisplayName, roleDisplayLabel, roleDisplayLabels } from './role-display';
import { setLocale } from './i18n';

it('localizes builtin roles while preserving their ids for authorization', () => {
  expect(roleDisplayName('user')).toBe('用户');
  expect(roleDisplayName('super_admin')).toBe('超级管理员');
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

it('shares catalogue display rules without translating custom names in English', () => {
  setLocale('en');
  try {
    expect(roleDisplayLabel({ id: 'user', name: '用户' })).toBe('User');
    expect(roleDisplayLabel({ id: 'super_admin', name: 'customized-name' })).toBe('Super administrator');
    expect(roleDisplayLabel({ id: 'custom', name: '用户' })).toBe('用户');
  } finally { setLocale('zh-CN'); }
});

it('maps payload order through the parallel name list', () => {
  expect(roleDisplayLabels(['role-uuid-1', 'user'], ['运营', 'user'])).toEqual(['运营', '用户']);
  expect(roleDisplayLabels([])).toEqual([]);
});
