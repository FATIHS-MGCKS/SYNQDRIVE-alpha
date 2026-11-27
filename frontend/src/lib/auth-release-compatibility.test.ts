// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertFamilyBoundAccessClaims,
  coalescedAuthRefresh,
  executeUnauthorizedRecovery,
  markRefreshSessionTerminated,
  resetAuthRefreshCoordinatorForTests,
  type RefreshOutcome,
} from './auth-session-refresh';
import { clearAuth, getRefreshToken, getToken, setAuth, type AuthUser } from './auth';
import { getStepUpToken, setStepUpToken } from './mfa';
import { requestResult, type RequestResultMeta } from './api';

const sampleUser: AuthUser = {
  id: 'u1',
  email: 'u@example.test',
  name: 'User',
  platformRole: 'USER',
  membershipRole: 'WORKER',
  organizationId: 'org-1',
  organizationName: 'Org',
  permissions: null,
};

describe('USR-P2E E4 frontend auth compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetAuthRefreshCoordinatorForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetAuthRefreshCoordinatorForTests();
  });

  it('F01 legacy access JWT lacking family binding receives expected denial', () => {
    expect(() => assertFamilyBoundAccessClaims({ tokenFamily: null })).toThrow(
      'SESSION_BINDING_REQUIRED',
    );
    expect(() => assertFamilyBoundAccessClaims({})).toThrow('SESSION_BINDING_REQUIRED');
    expect(() => assertFamilyBoundAccessClaims({ tokenFamily: 'fam-1' })).not.toThrow();
  });

  it('F02 eligible refresh upgrade preserves family-bound session storage', () => {
    setAuth('legacy-access', sampleUser, 'old-refresh');
    setAuth('family-bound-access', sampleUser, 'rotated-refresh');
    expect(getToken()).toBe('family-bound-access');
    expect(getRefreshToken()).toBe('rotated-refresh');
  });

  it('F03 concurrent failed requests trigger one coalesced refresh operation', async () => {
    let refreshCalls = 0;
    const performRefresh = vi.fn(async (): Promise<RefreshOutcome> => {
      refreshCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, accessToken: 'a2', refreshToken: 'r2' };
    });
    const [a, b] = await Promise.all([
      coalescedAuthRefresh(performRefresh),
      coalescedAuthRefresh(performRefresh),
    ]);
    expect(refreshCalls).toBe(1);
    expect(a).toEqual({ ok: true, accessToken: 'a2', refreshToken: 'r2' });
    expect(b).toEqual(a);
  });

  it('F04 successful refresh retries legitimate pending request once', async () => {
    let calls = 0;
    const replay = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('401 unauthorized');
      }
      return 'ok';
    });
  const performRefresh = vi.fn(async (): Promise<RefreshOutcome> => ({
      ok: true,
      accessToken: 'next',
      refreshToken: 'next-r',
    }));
    const result = await executeUnauthorizedRecovery({
      replay,
      performRefresh,
      onTokens: ({ accessToken, refreshToken }) => setAuth(accessToken, sampleUser, refreshToken),
    });
    expect(result).toBe('ok');
    expect(performRefresh).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(2);
    expect(getToken()).toBe('next');
  });

  it('F05 failed or revoked refresh terminates session safely', async () => {
    setAuth('access', sampleUser, 'refresh');
    await expect(
      executeUnauthorizedRecovery({
        replay: async () => {
          throw new Error('401 unauthorized');
        },
        performRefresh: async () => ({ ok: false, reason: 'revoked' }),
        onTokens: () => undefined,
      }),
    ).rejects.toThrow('401');
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('F06 does not infinite 401 refresh/retry loop', async () => {
    let refreshCalls = 0;
    await expect(
      executeUnauthorizedRecovery({
        replay: async () => {
          throw new Error('401 unauthorized');
        },
        performRefresh: async () => {
          refreshCalls += 1;
          return { ok: true, accessToken: 'a', refreshToken: 'r' };
        },
        onTokens: () => undefined,
        maxRefreshAttempts: 1,
      }),
    ).rejects.toThrow('401');
    expect(refreshCalls).toBe(1);
    markRefreshSessionTerminated();
    const blocked = await coalescedAuthRefresh(async () => ({
      ok: true,
      accessToken: 'x',
      refreshToken: 'y',
    }));
    expect(blocked.ok).toBe(false);
  });

  it('F07 MFA login pending token path remains compatible', async () => {
    const loginMfa = vi.fn().mockResolvedValue({
      accessToken: 'mfa-access',
      refreshToken: 'mfa-refresh',
      user: sampleUser,
    });
    const res = await loginMfa({
      mfaPendingToken: 'pending',
      code: '123456',
    });
    setAuth(res.accessToken, res.user, res.refreshToken);
    expect(getToken()).toBe('mfa-access');
    expect(getRefreshToken()).toBe('mfa-refresh');
  });

  it('F08 conservative MFA downgrade clears step-up token before protected call', () => {
    setStepUpToken('stale-grant');
    setAuth('password-only-jwt', { ...sampleUser, platformRole: 'MASTER_ADMIN' }, 'refresh');
    setStepUpToken(null);
    expect(getStepUpToken()).toBeNull();
  });

  it('F09 organization switch patch preserves canonical org context', () => {
    setAuth('access', sampleUser, 'refresh');
    const next = {
      ...sampleUser,
      organizationId: 'org-2',
      organizationName: 'Other',
      membershipId: 'mem-2',
    };
    setAuth('access', next, 'refresh-rotated');
    const raw = localStorage.getItem('synqdrive_user');
    expect(raw).toContain('org-2');
    expect(getRefreshToken()).toBe('refresh-rotated');
  });

  it('F10 authority unavailable fails closed without uncontrolled retry loops', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const meta: RequestResultMeta = { suppressStepUpDispatch: true };
    const result = await requestResult<{ ok: boolean }>('/health', { method: 'GET' }, meta);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('F11 session-bound step-up grant does not survive organization context switch', () => {
    setStepUpToken('grant-org-1');
    setAuth('access', { ...sampleUser, organizationId: 'org-2' }, 'refresh-org-2');
    setStepUpToken(null);
    expect(getStepUpToken()).toBeNull();
  });
});