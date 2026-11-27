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
      return json(route, {
        data: [listItem(SA_FIXTURE_USER_A.id, SA_FIXTURE_USER_A.name, SA_FIXTURE_USER_A.email)],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      });
    }
    if (url.includes(`/admin/security/users/${SA_FIXTURE_USER_A.id}`)) {
      return json(route, userDetail(SA_FIXTURE_USER_A.id, SA_FIXTURE_USER_A.name, SA_FIXTURE_USER_A.email));
    }
    if (url.includes(`/admin/security/users/${SA_FIXTURE_USER_B.id}`)) {
      return json(route, userDetail(SA_FIXTURE_USER_B.id, SA_FIXTURE_USER_B.name, SA_FIXTURE_USER_B.email));
    }
    if (url.includes('/admin/security/users/') && url.includes('/sessions')) {
      return json(route, []);
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