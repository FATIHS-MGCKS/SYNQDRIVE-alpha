// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRefreshToken, getToken, setAuth, type AuthUser } from './auth';
import { request } from './api';
import {
  bumpAuthSessionEpoch,
  resetAuthRefreshCoordinator,
} from './auth-session-refresh';
import { setStepUpToken } from './mfa';

const user: AuthUser = {
  id: 'u1',
  email: 'u@example.test',
  name: 'User',
  platformRole: 'USER',
  membershipRole: 'WORKER',
  organizationId: 'org-1',
  organizationName: 'Org',
  permissions: null,
};

describe('auth API transport (E5.1)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetAuthRefreshCoordinator();
    vi.restoreAllMocks();
    setAuth('expired-access', user, 'refresh-1');
    setStepUpToken('step-up-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('coalesces concurrent refresh on 401 and retries GET once', async () => {
    let apiCalls = 0;
    let refreshCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(
          JSON.stringify({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            user,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      apiCalls += 1;
      if (apiCalls === 1) {
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const [a, b] = await Promise.all([request('/me'), request('/me')]);
    expect(refreshCalls).toBe(1);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(getToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh');
  });

  it('does not retry POST after refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    }));

    await expect(
      request('/organizations/x', { method: 'POST', body: '{"a":1}' }),
    ).rejects.toThrow('Session refreshed');
    expect(getToken()).toBe('new-access');
  });

  it('blocks stale refresh after session epoch bump', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        bumpAuthSessionEpoch();
        await new Promise((r) => setTimeout(r, 10));
        return new Response(
          JSON.stringify({ accessToken: 'stale', refreshToken: 'stale', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    }));

    await expect(request('/me')).rejects.toThrow('Session expired');
    expect(getToken()).toBeNull();
  });

  it('clears step-up grant on successful refresh', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) {
          return new Response(
            JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        calls += 1;
        if (calls === 1) return new Response('{}', { status: 401 });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    await request('/me');
    expect(sessionStorage.getItem('synqdrive_step_up_token')).toBeNull();
  });
});