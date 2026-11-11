/** Author: yunnuo <ymz@ebox.vip>
 * Description: The merge helper must treat design-token utilities as members of their built-in group so call-site overrides win by position.
 */
import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('resolves the dialog max-width token against standard scales by position', () => {
    expect(cn('max-w-dialog', 'max-w-6xl')).toBe('max-w-6xl');
    expect(cn('max-w-6xl', 'max-w-dialog')).toBe('max-w-dialog');
  });

  it('keeps unrelated classes intact while merging conflicts', () => {
    expect(cn('fixed flex-col p-4', 'max-w-dialog', 'max-w-4xl')).toBe('fixed flex-col p-4 max-w-4xl');
  });
});
