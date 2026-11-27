import type { Page, Route } from '@playwright/test';
import { installMasterSidebarMocks, seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';

export const SA_FIXTURE_USER_A = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Fixture User A',
  email: 'fixture-a@synqdrive.test',
};

export const SA_FIXTURE_USER_B = {
  id: '00000000-0000-4000-8000-0000000000b2',
  name: 'Fixture User B',
  email: 'fixture-b@synqdrive.test',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function listItem(id: string, name: string, email: string) {
  return {
    id,
    name,
    email,
    role: 'Member',
    platformRole: null,
    accountState: 'ACTIVE',
    mfaState: 'ENABLED',
    attentionCodes: [],
    lastActive: '2024-06-01T00:00:00Z',
  };
}

function userDetail(id: string, name: string, email: string) {
  return {
    ...listItem(id, name, email),
    createdAt: '2024-01-01T00:00:00Z',
    memberships: [],
    mfa: { enrolled: true, state: 'ENABLED', factorTypes: ['totp'], recoveryCodesRemaining: 2 },
    recentPrivilegedActivity: [],
  };
}

function sessionRows(userId: string) {
  return [
    {
      id: `${userId}-sess-current`,
      device: 'E2E Current',
      browser: 'Chromium',
      os: 'Linux',
      ipAddress: '203.0.113.10',
      current: true,
      createdAt: '2024-01-01T00:00:00Z',
      lastUsedAt: '2024-06-01T00:00:00Z',
    },
    {
      id: `${userId}-sess-other`,
      device: 'E2E Other',
      browser: 'Firefox',
      os: 'macOS',
      ipAddress: '203.0.113.11',
      current: false,
      createdAt: '2024-01-02T00:00:00Z',
      lastUsedAt: '2024-06-02T00:00:00Z',
    },
  ];
}

export async function installSecurityAccessMocks(page: Page) {
  await installMasterSidebarMocks(page);
  await page.route('**/api/admin/security/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.includes('/admin/security/attention-summary')) {
      return json(route, { total: 0, topItems: [], byCode: {}, generatedAt: new Date().toISOString() });
    }
    if (url.includes('/admin/security/users') && method === 'GET' && !url.match(/\/users\/[^/?]+/)) {
      const parsed = new URL(url);
      const pageNum = Number(parsed.searchParams.get('page') ?? '1');
      const search = (parsed.searchParams.get('search') ?? '').toLowerCase();
      const all = [
        listItem(SA_FIXTURE_USER_A.id, SA_FIXTURE_USER_A.name, SA_FIXTURE_USER_A.email),
        listItem(SA_FIXTURE_USER_B.id, SA_FIXTURE_USER_B.name, SA_FIXTURE_USER_B.email),
      ];
      const filtered = search
        ? all.filter((u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search))
        : all;
      const pageSize = 1;
      const start = (pageNum - 1) * pageSize;
      const slice = filtered.slice(start, start + pageSize);
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      return json(route, {
        data: slice,
        meta: { total: filtered.length, page: pageNum, limit: pageSize, totalPages },
      });
    }
    if (url.includes(`/admin/security/users/${SA_FIXTURE_USER_A.id}`) && !url.includes('/sessions')) {
      return json(route, userDetail(SA_FIXTURE_USER_A.id, SA_FIXTURE_USER_A.name, SA_FIXTURE_USER_A.email));
    }
    if (url.includes(`/admin/security/users/${SA_FIXTURE_USER_B.id}`) && !url.includes('/sessions')) {
      return json(route, userDetail(SA_FIXTURE_USER_B.id, SA_FIXTURE_USER_B.name, SA_FIXTURE_USER_B.email));
    }
    if (url.includes('/admin/security/users/') && url.includes('/sessions')) {
      const userId = url.includes(SA_FIXTURE_USER_A.id) ? SA_FIXTURE_USER_A.id : SA_FIXTURE_USER_B.id;
      return json(route, sessionRows(userId));
    }
    return json(route, { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 1 } });
  });
}

export async function seedMasterSecurityAccess(page: Page, theme: 'light' | 'dark' = 'light') {
  await seedMasterSidebarAuth(page, 'en');
  await page.addInitScript((th) => {
    localStorage.setItem('synqdrive-theme-preference', th);
  }, theme);
}