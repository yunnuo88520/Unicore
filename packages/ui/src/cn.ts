// Author: yunnuo <ymz@ebox.vip>
// Description: Shared class merge helper for the UI primitive layer.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
