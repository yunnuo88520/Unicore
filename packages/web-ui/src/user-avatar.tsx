// Author: yunnuo <ymz@ebox.vip>
// Description: Shared account avatar: the profile image when one resolves, otherwise an initial-letter circle, so every avatar spot keeps a visible fallback.
export function userInitial(name: string | undefined | null): string {
  const value = (name ?? '').trim();
  if (!value) return '?';
  // Code-point aware first character: CJK names and surrogate-pair emoji stay
  // whole instead of splitting into lone surrogates.
  const first = [...value][0] ?? '?';
  return first.toUpperCase();
}

// The display chain every listing and menu shares: the nickname when the
// account has one, otherwise the username.
export function displayLabel(displayName: string | undefined | null, username: string | undefined | null): string {
  const name = (displayName ?? '').trim();
  if (name) return name;
  return (username ?? '').trim();
}

export function UserAvatar({ name, url, className = 'size-8 text-[length:var(--font-11)]', alt }: {
  name: string | undefined | null; url?: string; className?: string;
  /** Accessible name for the rendered image or initial fallback; omit for decorative spots. */
  alt?: string;
}) {
  if (url) return <span aria-hidden={alt ? undefined : true} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-avatar ${className}`}>
    <img src={url} className="size-full object-cover" alt={alt ?? ''} />
  </span>;
  return <span aria-hidden={alt ? undefined : true} aria-label={alt} role={alt ? 'img' : undefined} className={`flex shrink-0 items-center justify-center rounded-full bg-avatar font-semibold text-avatar-ink ${className}`}>{userInitial(name)}</span>;
}
