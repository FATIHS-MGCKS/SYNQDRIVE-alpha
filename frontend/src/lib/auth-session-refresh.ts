/**
 * SPA session refresh coordinator (USR-P2E E4/E5/E5B).
 * Coalesces concurrent refresh for the same stale access credential;
 * allows multiple legitimate rotations within one authentication session.
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
/** Identity of the in-flight refresh promise (stale completions must not clear a newer flight). */
let refreshInFlightSerial = 0;
let refreshInFlightCoalesceKey: string | null = null;
let refreshTerminated = false;
let authSessionEpoch = 0;
/** Access tokens we already rotated away from in this auth session (dedupe delayed 401). */
const refreshedFromAccessTokens = new Set<string>();

export function getAuthSessionEpoch(): number {
  return authSessionEpoch;
}

export function bumpAuthSessionEpoch(): void {
  authSessionEpoch += 1;
  refreshedFromAccessTokens.clear();
}

/** Production: new login, org switch, or credential replacement. */
export function beginAuthenticatedSession(): void {
  bumpAuthSessionEpoch();
  refreshInFlight = null;
  refreshInFlightCoalesceKey = null;
  refreshTerminated = false;
}

/** Vitest only — never call in production transitions. */
export function resetAuthRefreshCoordinatorForTests(): void {
  refreshInFlight = null;
  refreshInFlightCoalesceKey = null;
  refreshInFlightSerial = 0;
  refreshTerminated = false;
  authSessionEpoch = 0;
  refreshedFromAccessTokens.clear();
}

/** @deprecated Use resetAuthRefreshCoordinatorForTests in specs only. */
export function resetAuthRefreshCoordinator(): void {
  resetAuthRefreshCoordinatorForTests();
}

export function hasAlreadyRefreshedFromAccessToken(accessToken: string): boolean {
  return refreshedFromAccessTokens.has(accessToken);
}

export function markRefreshedFromAccessToken(accessToken: string): void {
  if (accessToken) refreshedFromAccessTokens.add(accessToken);
}

export function markRefreshSessionTerminated(): void {
  refreshTerminated = true;
  refreshInFlight = null;
  refreshInFlightCoalesceKey = null;
}

export function openRefreshCoordinatorAfterLogin(): void {
  refreshTerminated = false;
  refreshInFlight = null;
  refreshInFlightCoalesceKey = null;
}

export async function coalescedAuthRefresh(
  performRefresh: () => Promise<RefreshOutcome>,
  coalesceKey: string,
): Promise<RefreshOutcome> {
  if (refreshTerminated) {
    return { ok: false, reason: 'revoked' };
  }
  if (refreshInFlight && refreshInFlightCoalesceKey === coalesceKey) {
    return refreshInFlight;
  }
  const flightId = ++refreshInFlightSerial;
  refreshInFlightCoalesceKey = coalesceKey;
  const promise = performRefresh().finally(() => {
    if (refreshInFlightSerial === flightId) {
      refreshInFlight = null;
      refreshInFlightCoalesceKey = null;
    }
  });
  refreshInFlight = promise;
  return promise;
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
      const refreshed = await coalescedAuthRefresh(input.performRefresh, 'legacy-recovery');
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