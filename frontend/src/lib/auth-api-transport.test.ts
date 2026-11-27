// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRefreshToken, getToken, setAuth, type AuthUser } from './auth';
import { request, requestResult } from './api';
import {
  beginAuthenticatedSession,
  getAuthSessionEpoch,
  markRefreshSessionTerminated,
  resetAuthRefreshCoordinatorForTests,
} from './auth-session-refresh';
import { clearAuthSession } from './auth-api-transport';
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

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => handler(String(input), init)));
}

describe('auth API transport (E5.1 / E5A)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetAuthRefreshCoordinatorForTests();
    vi.restoreAllMocks();
    setAuth('expired-access', user, 'refresh-1');
    setStepUpToken('step-up-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('A: two concurrent GET 401s coalesce to one refresh and both retry', async () => {
    let refreshCalls = 0;
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const token = getToken();
      if (token === 'expired-access') {
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const [a, b] = await Promise.all([request('/me'), request('/me')]);
    expect(refreshCalls).toBe(1);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(getToken()).toBe('new-access');
  });

  it('B: delayed 401 with original expired token does not rotate again', async () => {
    let refreshCalls = 0;
    const authHeaders = (init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined;
      return h?.Authorization ?? '';
    };
    stubFetch(async (url, init) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (authHeaders(init).includes('expired-access')) {
        await new Promise((r) => setTimeout(r, 40));
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const slow = request('/me');
    await new Promise((r) => setTimeout(r, 5));
    const fast = request('/widgets');
    await slow;
    await fast;
    expect(refreshCalls).toBe(1);
    expect(getToken()).toBe('new-access');
  });

  it('allows two successive refresh rotations in one auth session', async () => {
    let refreshCalls = 0;
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        const next =
          refreshCalls === 1
            ? { accessToken: 'access-v2', refreshToken: 'refresh-v2' }
            : { accessToken: 'access-v3', refreshToken: 'refresh-v3' };
        return new Response(JSON.stringify({ ...next, user }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const token = getToken();
      if (token === 'expired-access') {
        return new Response('{}', { status: 401 });
      }
      if (url.includes('/vehicles') && token === 'access-v2') {
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await request('/me');
    expect(getToken()).toBe('access-v2');
    await request('/vehicles');
    expect(getToken()).toBe('access-v3');
    expect(refreshCalls).toBe(2);
  });

  it('old refresh promise finally does not clear newer in-flight refresh', async () => {
    const { coalescedAuthRefresh } = await import('./auth-session-refresh');
    const { performBackendTokenRefresh } = await import('./auth-api-transport');
    let refreshCalls = 0;
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          await new Promise((r) => setTimeout(r, 40));
          return new Response(
            JSON.stringify({ accessToken: 'slow', refreshToken: 'slow-r', user }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ accessToken: 'fast', refreshToken: 'fast-r', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    });

    setAuth('expired-a', user, 'refresh-a');
    const epoch = getAuthSessionEpoch();
    const slowP = coalescedAuthRefresh(
      performBackendTokenRefresh,
      `${epoch}:expired-a:refresh-a`,
    );
    await new Promise((r) => setTimeout(r, 5));
    setAuth('expired-b', user, 'refresh-b');
    const fastP = coalescedAuthRefresh(
      performBackendTokenRefresh,
      `${epoch}:expired-b:refresh-b`,
    );
    const [, fastOutcome] = await Promise.allSettled([slowP, fastP]);
    expect(fastOutcome.status).toBe('fulfilled');
    if (fastOutcome.status === 'fulfilled') {
      expect(fastOutcome.value.ok).toBe(true);
    }
    expect(getToken()).toBe('fast');
    expect(refreshCalls).toBe(2);
  });

  it('C: logout during pending refresh cannot restore stale session', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 40));
        return new Response(
          JSON.stringify({ accessToken: 'stale-win', refreshToken: 'stale-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      await new Promise((r) => setTimeout(r, 40));
      return new Response('{}', { status: 401 });
    });

    const pending = request('/me');
    await new Promise((r) => setTimeout(r, 5));
    clearAuthSession(false);
    await expect(pending).rejects.toThrow('Stale request');
    expect(getToken()).toBeNull();
  });

  it('D: organization switch during pending refresh keeps new session', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 40));
        return new Response(
          JSON.stringify({ accessToken: 'stale-win', refreshToken: 'stale-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      await new Promise((r) => setTimeout(r, 40));
      return new Response('{}', { status: 401 });
    });

    const pending = request('/me');
    await new Promise((r) => setTimeout(r, 5));
    beginAuthenticatedSession();
    setAuth('org-switch-access', user, 'org-switch-refresh');
    await expect(pending).rejects.toThrow('Stale request');
    expect(getToken()).toBe('org-switch-access');
    expect(getRefreshToken()).toBe('org-switch-refresh');
  });

  it('E: fresh login during pending refresh keeps new credentials', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 40));
        return new Response(
          JSON.stringify({ accessToken: 'stale-win', refreshToken: 'stale-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      await new Promise((r) => setTimeout(r, 40));
      return new Response('{}', { status: 401 });
    });

    const pending = request('/me');
    await new Promise((r) => setTimeout(r, 5));
    beginAuthenticatedSession();
    setAuth('login-access', { ...user, organizationId: 'org-2' }, 'login-refresh');
    await expect(pending).rejects.toThrow('Stale request');
    expect(getToken()).toBe('login-access');
  });

  it('stale delayed 401 after organization switch does not refresh new session', async () => {
    let refreshCalls = 0;
    const authHeaders = (init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined;
      return h?.Authorization ?? '';
    };
    stubFetch(async (url, init) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (authHeaders(init).includes('expired-access')) {
        await new Promise((r) => setTimeout(r, 50));
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const pending = request('/me');
    await new Promise((r) => setTimeout(r, 5));
    beginAuthenticatedSession();
    setAuth('org-b-access', user, 'org-b-refresh');
    await expect(pending).rejects.toThrow('Stale request');
    expect(refreshCalls).toBe(0);
    expect(getToken()).toBe('org-b-access');
  });

  it('F: refresh revoked clears only current session', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        return new Response('{}', { status: 401 });
      }
      return new Response('{}', { status: 401 });
    });

    await expect(request('/me')).rejects.toThrow('Session expired');
    expect(getToken()).toBeNull();
  });

  it('G: retried GET 401 after refresh does not loop refresh', async () => {
    let refreshCalls = 0;
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    });

    await expect(request('/me')).rejects.toThrow('Session expired');
    expect(refreshCalls).toBe(1);
    expect(getToken()).toBeNull();
  });

  it('H: POST 401 does not automatically replay mutation', async () => {
    let apiPosts = 0;
    stubFetch(async (url, init) => {
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
        apiPosts += 1;
      }
      return new Response('{}', { status: 401 });
    });

    await expect(
      request('/organizations/x', { method: 'POST', body: '{"a":1}' }),
    ).rejects.toThrow('Session refreshed');
    expect(apiPosts).toBe(1);
    expect(getToken()).toBe('new-access');
  });

  it('I: step-up grant cleared through refresh transport', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (getToken() === 'expired-access') return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await request('/me');
    expect(sessionStorage.getItem('synqdrive_step_up_token')).toBeNull();
  });

  it('stale refresh success blocked when epoch advanced mid-flight', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        beginAuthenticatedSession();
        setAuth('new-session', user, 'new-refresh');
        await new Promise((r) => setTimeout(r, 15));
        return new Response(
          JSON.stringify({ accessToken: 'stale', refreshToken: 'stale', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    });

    await expect(request('/me')).rejects.toThrow('Session expired');
    expect(getToken()).toBe('new-session');
  });

  it('stale refresh failure does not clear newer session', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 10));
        beginAuthenticatedSession();
        setAuth('newer-session', user, 'newer-refresh');
        return new Response('{}', { status: 401 });
      }
      return new Response('{}', { status: 401 });
    });

    await expect(request('/me')).rejects.toThrow('Session expired');
    expect(getToken()).toBe('newer-session');
  });

  it('refresh recovers after terminated flag when new login opens session', async () => {
    markRefreshSessionTerminated();
    beginAuthenticatedSession();
    setAuth('expired-access', user, 'refresh-1');

    let refreshCalls = 0;
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (getToken() === 'expired-access') return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await request('/me');
    expect(refreshCalls).toBe(1);
    expect(getToken()).toBe('new-access');
  });

  it('requestResult surfaces session expired without double refresh', async () => {
    stubFetch(async (url) => {
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    });

    const res = await requestResult('/me');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
  });
});