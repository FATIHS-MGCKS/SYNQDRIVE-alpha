const TOKEN_KEY = 'synqdrive_token';
const USER_KEY = 'synqdrive_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  platformRole: string;
  membershipRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationLogoUrl?: string | null;
  permissions: Record<string, { read: boolean; write: boolean }> | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Patch the stored user record in-place (e.g. after the user updates their
 * own organization profile / logo). Returns the merged user, or null when no
 * user is currently stored.
 */
export function patchStoredUser(patch: Partial<AuthUser>): AuthUser | null {
  const current = getStoredUser();
  if (!current) return null;
  const next: AuthUser = { ...current, ...patch };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function isMasterAdmin(): boolean {
  const user = getStoredUser();
  return user?.platformRole === 'MASTER_ADMIN';
}
