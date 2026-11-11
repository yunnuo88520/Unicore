// Author: yunnuo <ymz@ebox.vip>
// Description: Shared class merge helper for the UI primitive layer.
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Design-token utilities such as max-w-dialog are invisible to the default
// tailwind-merge class groups, so a standard override (max-w-6xl) silently
// lost to stylesheet order. Teach the merger the token names so later
// classes win the conflict the same way they do for built-in scales.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'max-w': [{ 'max-w': ['dialog'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
