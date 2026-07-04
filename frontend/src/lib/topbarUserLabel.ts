import type { AuthUser } from './auth';

/** Resolves the user-facing display name (typically first + last name). */
export function resolveTopBarUserDisplayName(user: AuthUser | null): string | null {
  if (!user) return null;
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) {
    const localPart = email.split('@')[0]?.trim();
    if (localPart) return localPart;
  }
  return null;
}

export function formatTopBarWelcomeLabel(
  user: AuthUser | null,
  format: (name: string) => string,
  fallback: string,
): string {
  const displayName = resolveTopBarUserDisplayName(user);
  if (displayName) return format(displayName);
  return fallback;
}
