import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, type Route } from '@playwright/test';
import { productionOperationalDashboardFixture } from '../src/master/dashboard/master-dashboard-fixtures';

export const MASTER_SIDEBAR_E2E_ORG = '00000000-0000-4000-8000-0000000000e2';

export const mockMasterSidebarAdmin = {
  id: 'user-master-sidebar-e2e',
  email: 'sidebar-e2e@synqdrive.eu',
  name: 'Sidebar E2E Master',
  platformRole: 'MASTER_ADMIN',
  membershipRole: 'MASTER_ADMIN',
  organizationId: null,
  organizationName: null,
  organizationLogoUrl: null,
  permissions: {},
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const INSTALLED = Symbol('masterSidebarMocksInstalled');

export async function installMasterSidebarMocks(page: Page) {
  if ((page as unknown as Record<symbol, boolean>)[INSTALLED]) {
    return;
  }
  (page as unknown as Record<symbol, boolean>)[INSTALLED] = true;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.includes('/auth/me')) {
      return json(route, mockMasterSidebarAdmin);
    }
    if (url.includes('/account/mfa/status')) {
      return json(route, {
        enrolled: true,
        factorTypes: ['totp'],
        recoveryCodesRemaining: 8,
        privilegedAccount: true,
        enrollmentRequired: false,
        stepUpEnforced: false,
      });
    }
    if (url.includes('/admin/users') && method === 'GET' && !url.includes('/admin/security/')) {
      return json(route, []);
    }
    if (url.includes('/admin/organizations/operational') && method === 'GET') {
      return json(route, {
        data: [{ id: MASTER_SIDEBAR_E2E_ORG, companyName: 'Sidebar E2E Org', company_name: 'Sidebar E2E Org' }],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });
    }
    if (url.includes('/admin/organizations') && method === 'GET' && !url.includes('/master-intelligence/')) {
      return json(route, {
        data: [{ id: MASTER_SIDEBAR_E2E_ORG, companyName: 'Sidebar E2E Org', company_name: 'Sidebar E2E Org', status: 'ACTIVE' }],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });
    }
    if (url.includes('/admin/dashboard/operational')) {
      return json(
        route,
        productionOperationalDashboardFixture({
          overallStatus: 'healthy',
          incidentSummary: { count: 0, highestSeverity: null, affectedOrganizationCount: 0 },
          incidents: [],
          organizationsAttention: [],
          support: {
            openTickets: 5,
            criticalOpen: 0,
            newest: [],
          },
        }),
      );
    }
    if (url.includes('/admin/security-access/attention-summary')) {
      return json(route, { total: 0 });
    }
    if (url.includes('/admin/platform-integrations/attention-summary')) {
      return json(route, { total: 0 });
    }
    if (url.includes('/admin/platform-integrations/directory')) {
      return json(route, { entries: [] });
    }
    if (url.includes('/admin/vehicles/operational-overview')) {
      return json(route, { counts: { withAttention: 0 } });
    }
    if (url.includes('/health')) {
      return json(route, { status: 'ok' });
    }
    return json(route, { data: [], items: [], meta: { total: 0 } });
  });
}

export async function seedMasterSidebarAuth(page: Page, locale: 'de' | 'en' = 'de') {
  await page.addInitScript(
    ({ token, user, locale: loc, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', loc);
      localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: 'master-sidebar-e2e-token',
      user: mockMasterSidebarAdmin,
      locale,
      theme: 'light',
    },
  );
}

export async function openMasterSidebarView(
  page: Page,
  view = 'dashboard',
  opts?: { width?: number; height?: number; theme?: 'light' | 'dark' },
) {
  if (opts?.width && opts?.height) {
    await page.setViewportSize({ width: opts.width, height: opts.height });
  }
  if (opts?.theme) {
    await page.addInitScript((theme) => {
      localStorage.setItem('synqdrive-theme-preference', theme);
    }, opts.theme);
  }
  await installMasterSidebarMocks(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mfaStatus = page.waitForResponse(
    (res) => res.url().includes('/account/mfa/status') && res.ok(),
    { timeout: 60_000 },
  );
  await page.goto(`/master?view=${encodeURIComponent(view)}`, { waitUntil: 'domcontentloaded' });
  await mfaStatus;
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByRole('main', { name: 'Master Admin' })).toBeVisible({ timeout: 60_000 });
  const width = opts?.width ?? page.viewportSize()?.width ?? 1280;
  if (width >= 1024) {
    const dash = desktopSidebar(page).locator('[data-master-nav-view="dashboard"]');
    await expect(dash).toBeVisible({ timeout: 60_000 });
  }
}

export function desktopSidebar(page: Page) {
  return page.getByTestId('master-sidebar-desktop');
}

export function mobileSidebarShell(page: Page) {
  return page.locator('.lg\\:hidden.fixed.top-0').first();
}

export async function saveSidebarScreenshot(page: Page, fileName: string, dir: string) {
  await fs.mkdir(dir, { recursive: true });
  const sidebar = desktopSidebar(page);
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('[data-master-nav-view="dashboard"]')).toBeVisible();
  const box = await sidebar.boundingBox();
  if (!box) {
    throw new Error('master-sidebar-desktop has no layout box');
  }
  await page.screenshot({
    path: path.join(dir, fileName),
    clip: box,
    animations: 'disabled',
  });
}