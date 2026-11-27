/**
 * SPA session refresh coordinator (USR-P2E E4/E5).
 * Coalesces concurrent refresh attempts and prevents unbounded 401 retry loops.
 */
import { clearAuth } from './auth';

export type RefreshSuccess = {
  ok: true;
  accessToken: string;
  refreshToken: string;
};

export type RefreshFailure = {
  ok: false;
  reason: 'revoked' | 'network' | 'denied';
};

export type RefreshOutcome = RefreshSuccess | RefreshFailure;

let refreshInFlight: Promise<RefreshOutcome> | null = null;
let refreshTerminated = false;
let authSessionEpoch = 0;
/** Access JWT refreshed for this epoch (at most one backend refresh per epoch). */
let accessRefreshedAtEpoch: number | null = null;

export function getAuthSessionEpoch(): number {
  return authSessionEpoch;
}

export function getAccessRefreshedAtEpoch(): number | null {
  return accessRefreshedAtEpoch;
}

export function bumpAuthSessionEpoch(): void {
  authSessionEpoch += 1;
  accessRefreshedAtEpoch = null;
}

/** Production: new login, org switch, or credential replacement. */
export function beginAuthenticatedSession(): void {
  bumpAuthSessionEpoch();
  refreshInFlight = null;
  refreshTerminated = false;
}

/** Vitest only — never call in production transitions. */
export function resetAuthRefreshCoordinatorForTests(): void {
  refreshInFlight = null;
  refreshTerminated = false;
  authSessionEpoch = 0;
  accessRefreshedAtEpoch = null;
}

/** @deprecated Use resetAuthRefreshCoordinatorForTests in specs only. */
export function resetAuthRefreshCoordinator(): void {
  resetAuthRefreshCoordinatorForTests();
}

export function markAccessRefreshedForCurrentEpoch(): void {
  accessRefreshedAtEpoch = authSessionEpoch;
}

export function markRefreshSessionTerminated(): void {
  refreshTerminated = true;
  refreshInFlight = null;
}

export function openRefreshCoordinatorAfterLogin(): void {
  refreshTerminated = false;
  refreshInFlight = null;
}

export async function coalescedAuthRefresh(
  performRefresh: () => Promise<RefreshOutcome>,
): Promise<RefreshOutcome> {
  if (refreshTerminated) {
    return { ok: false, reason: 'revoked' };
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const SESSION_BINDING_REQUIRED = 'SESSION_BINDING_REQUIRED';

export function assertFamilyBoundAccessClaims(decoded: { tokenFamily?: string | null }): void {
  if (!decoded.tokenFamily?.trim()) {
    throw new Error(SESSION_BINDING_REQUIRED);
  }
}

export async function executeUnauthorizedRecovery<T>(input: {
  replay: () => Promise<T>;
  performRefresh: () => Promise<RefreshOutcome>;
  onTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  maxRefreshAttempts?: number;
}): Promise<T> {
  const max = input.maxRefreshAttempts ?? 1;
  let attempts = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await input.replay();
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('401')) {
        throw err;
      }
      if (attempts >= max) {
        markRefreshSessionTerminated();
        clearAuth();
        throw err;
      }
      attempts += 1;
      const refreshed = await coalescedAuthRefresh(input.performRefresh);
      if (!refreshed.ok) {
        markRefreshSessionTerminated();
        clearAuth();
        throw err;
      }
      input.onTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
      });
    }
  }
}