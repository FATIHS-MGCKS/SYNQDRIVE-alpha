const TOKEN_KEY = 'synqdrive_token';
const REFRESH_TOKEN_KEY = 'synqdrive_refresh_token';
const USER_KEY = 'synqdrive_user';

export interface AuthOrganizationOption {
  organizationId: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  membershipId: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  platformRole: string;
  platformPermissions?: string[];
  membershipRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationLogoUrl?: string | null;
  membershipId?: string | null;
  permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
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

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuth(token: string, user: AuthUser, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
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
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function isMasterAdmin(): boolean {
  const user = getStoredUser();
  return user?.platformRole === 'MASTER_ADMIN';
}

const MASTER_BILLING_PLATFORM_PERMISSION = 'master-billing';

export function hasMasterBillingAccess(): boolean {
  const user = getStoredUser();
  if (!user) return false;
  if (user.platformRole === 'MASTER_ADMIN') return true;
  return (user.platformPermissions ?? []).includes(MASTER_BILLING_PLATFORM_PERMISSION);
}
