/**
 * Authenticated API transport — 401 refresh wiring (USR-P2E E5.1).
 */
import {
  getRefreshToken,
  getStoredUser,
  getToken,
  setAuth,
  type AuthUser,
} from './auth';
import { setStepUpToken } from './mfa';
import {
  bumpAuthSessionEpoch,
  coalescedAuthRefresh,
  getAccessRefreshedAtEpoch,
  getAuthSessionEpoch,
  markAccessRefreshedForCurrentEpoch,
  markRefreshSessionTerminated,
  type RefreshOutcome,
} from './auth-session-refresh';

const API_V1 = '/api/v1';

/** Paths that must not trigger refresh recovery (prevents recursive auth loops). */
export function isExcludedAuthTransportPath(path: string): boolean {
  const normalized = path.split('?')[0] ?? path;
  return (
    normalized.includes('/auth/login') ||
    normalized.includes('/auth/refresh') ||
    normalized.includes('/auth/logout') ||
    normalized.includes('/auth/switch-organization') ||
    normalized.includes('/auth/login/mfa')
  );
}

export function isIdempotentReadMethod(method: string | undefined): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

export function clearAuthSession(redirectToLogin = false): void {
  bumpAuthSessionEpoch();
  markRefreshSessionTerminated();
  localStorage.removeItem('synqdrive_token');
  localStorage.removeItem('synqdrive_refresh_token');
  localStorage.removeItem('synqdrive_user');
  setStepUpToken(null);
  if (redirectToLogin && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export async function performBackendTokenRefresh(): Promise<RefreshOutcome> {
  const startedEpoch = getAuthSessionEpoch();
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { ok: false, reason: 'revoked' };
  }
  let res: Response;
  try {
    res = await fetch(`${API_V1}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (startedEpoch !== getAuthSessionEpoch()) {
    return { ok: false, reason: 'revoked' };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'revoked' };
  }
  if (!res.ok) {
    return { ok: false, reason: 'denied' };
  }
  const body = (await res.json().catch(() => null)) as {
    accessToken?: string;
    refreshToken?: string;
    user?: AuthUser;
  } | null;
  if (!body?.accessToken || startedEpoch !== getAuthSessionEpoch()) {
    return { ok: false, reason: 'revoked' };
  }
  const user = body.user ?? getStoredUser();
  if (!user) {
    return { ok: false, reason: 'denied' };
  }
  setStepUpToken(null);
  setAuth(body.accessToken, user, body.refreshToken ?? refreshToken);
  markAccessRefreshedForCurrentEpoch();
  return {
    ok: true,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken ?? refreshToken,
  };
}

/**
 * After a 401 on a non-auth path: refresh once, optionally retry read-only calls.
 */
export async function recoverFromUnauthorized<T>(input: {
  path: string;
  method: string | undefined;
  retry: () => Promise<T>;
}): Promise<T> {
  if (isExcludedAuthTransportPath(input.path)) {
    clearAuthSession(true);
    throw new Error('Session expired');
  }
  const epochAtStart = getAuthSessionEpoch();
  if (getAccessRefreshedAtEpoch() === epochAtStart) {
    if (getAuthSessionEpoch() === epochAtStart) {
      clearAuthSession(true);
    }
    throw new Error('Session expired');
  }
  const refreshed = await coalescedAuthRefresh(performBackendTokenRefresh);
  if (!refreshed.ok) {
    if (getAuthSessionEpoch() === epochAtStart) {
      clearAuthSession(true);
    }
    throw new Error('Session expired');
  }
  if (isIdempotentReadMethod(input.method)) {
    const result = await input.retry();
    const maybeRes = result as Response;
    if (maybeRes instanceof Response && maybeRes.status === 401) {
      if (getAuthSessionEpoch() === epochAtStart) {
        clearAuthSession(true);
      }
      throw new Error('Session expired');
    }
    return result;
  }
  throw new Error('Session refreshed');
}

export function buildAuthorizedHeaders(
  extra?: Record<string, string>,
  stepUpToken?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra ?? {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const stepUp = stepUpToken ?? null;
  if (stepUp) headers['x-step-up-token'] = stepUp;
  return headers;
}