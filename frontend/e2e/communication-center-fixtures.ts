/**
 * Playwright fixtures for Communication Center C8.1 shell E2E.
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow, installTaskMocks, mockUser, TEST_ORG_ID } from './task-fixtures';

export { assertNoHorizontalOverflow, TEST_ORG_ID };

const mockUserWithCommunication = {
  ...mockUser,
  permissions: {
    ...mockUser.permissions,
    communication: { read: true, write: true, manage: true },
  },
};

const mockUserWithoutCommunication = {
  ...mockUser,
  membershipRole: 'DRIVER',
  permissions: {
    dashboard: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

async function seedSession(page: Page, user: typeof mockUser, locale: 'en' | 'de' = 'en') {
  await page.addInitScript(
    ({ token, authUser, selectedLocale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(authUser));
      localStorage.setItem('synqdrive.locale', selectedLocale);
    },
    { token: 'communication-e2e-token', authUser: user, selectedLocale: locale },
  );
}

export async function openCommunicationCenter(
  page: Page,
  options?: {
    user?: typeof mockUser;
    query?: string;
    locale?: 'en' | 'de';
  },
) {
  const user = options?.user ?? mockUserWithCommunication;
  await seedSession(page, user, options?.locale ?? 'en');
  await installTaskMocks(page);
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  const query = options?.query ?? 'view=communication-center';
  await page.goto(`/rental?${query}`, { waitUntil: 'domcontentloaded' });
  await page
    .getByTestId('communication-center-view')
    .or(page.getByTestId('communication-center-access-denied'))
    .waitFor({ state: 'visible', timeout: 45000 });
}

export async function openDashboardWithCommunicationNav(
  page: Page,
  user: typeof mockUserWithCommunication = mockUserWithCommunication,
) {
  await seedSession(page, user, 'en');
  await installTaskMocks(page);
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('dashboard-tasks-overview-panel').waitFor({ state: 'visible', timeout: 45000 });
}

export async function expectCommunicationNavVisible(page: Page, visible: boolean) {
  const navItem = page.getByRole('button', { name: /Communication Center/i });
  if (visible) {
    await expect(navItem).toBeVisible();
  } else {
    await expect(navItem).toHaveCount(0);
  }
}

export { mockUserWithCommunication, mockUserWithoutCommunication };
