import { expect, test, type Page } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  installCommunicationMocks,
  mockUserWithCommunication,
  mockUserWithoutCommunication,
  TEST_ORG_ID,
} from './communication-center-fixtures';
import { installTaskMocks } from './task-fixtures';

async function seedDashboardSession(page: Page) {
  await page.addInitScript(
    ({ token, authUser, orgId }) => {
      if (sessionStorage.getItem('communication-dashboard-e2e-seeded')) return;
      sessionStorage.setItem('communication-dashboard-e2e-seeded', '1');
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(authUser));
      localStorage.setItem('synqdrive.locale', 'en');
      localStorage.setItem('synqdrive.selectedOrgId', orgId);
    },
    {
      token: 'communication-dashboard-e2e-token',
      authUser: { ...mockUserWithCommunication, organizationId: TEST_ORG_ID },
      orgId: TEST_ORG_ID,
    },
  );
}

async function openDashboardWithCommunicationWidget(page: Page) {
  await seedDashboardSession(page);
  await installTaskMocks(page);
  await installCommunicationMocks(page, { orgId: TEST_ORG_ID });
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...mockUserWithCommunication, organizationId: TEST_ORG_ID }),
    });
  });
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('dashboard-communication-widget').waitFor({ state: 'visible', timeout: 45_000 });
}

test.describe('Dashboard Communication widget E2E (mocked API)', () => {
  test('desktop 1440 — metrics, rows, deep links, canonical-only requests', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop dashboard communication widget');

    const communicationRequests: string[] = [];
    const providerRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes(`/organizations/${TEST_ORG_ID}/communication/`)) {
        communicationRequests.push(url);
      }
      if (
        url.includes('/api/') &&
        (/whatsapp|sent\.dm|twilio|elevenlabs/i.test(url) ||
          (url.includes('/sms/') && !url.includes('/communication/')))
      ) {
        providerRequests.push(url);
      }
    });

    await openDashboardWithCommunicationWidget(page);

    const dashboardLoadRequests = communicationRequests.filter((url) =>
      url.includes(`/organizations/${TEST_ORG_ID}/communication/`),
    );
    expect(dashboardLoadRequests.length).toBeGreaterThanOrEqual(2);
    expect(dashboardLoadRequests.length).toBeLessThanOrEqual(3);

    const widget = page.getByTestId('dashboard-communication-widget');
    await expect(widget.getByTestId('dashboard-communication-summary')).toBeVisible();
    await expect(widget.getByRole('button', { name: /Unread/i })).toBeVisible();
    await expect(widget.getByRole('button', { name: /Needs attention/i })).toBeVisible();
    await expect(widget.getByRole('button', { name: /Unassigned/i })).toBeVisible();

    const rows = widget.getByTestId('dashboard-communication-row');
    await expect(rows).toHaveCount(3);

    await widget.getByTestId('dashboard-communication-open-center').click();
    await expect(page).toHaveURL(/view=communication-center/);

    await page.goto('/rental', { waitUntil: 'domcontentloaded' });
    await widget.waitFor({ state: 'visible', timeout: 45_000 });

    await rows.first().click();
    await expect(page).toHaveURL(/conversationId=/);
    await expect(page).toHaveURL(/communicationPane=conversation/);

    await page.goto('/rental', { waitUntil: 'domcontentloaded' });
    await widget.waitFor({ state: 'visible', timeout: 45_000 });

    await widget.getByRole('button', { name: /Unread/i }).click();
    await expect(page).toHaveURL(/communicationUnread=true/);

    await page.goto('/rental', { waitUntil: 'domcontentloaded' });
    await widget.waitFor({ state: 'visible', timeout: 45_000 });

    await widget.getByRole('button', { name: /Unassigned/i }).click();
    await expect(page).toHaveURL(/communicationAssignment=unassigned/);

    await page.goto('/rental', { waitUntil: 'domcontentloaded' });
    await widget.waitFor({ state: 'visible', timeout: 45_000 });

    await widget.getByRole('button', { name: /Needs attention/i }).click();
    await expect(page).toHaveURL(/communicationStatus=HUMAN_REQUIRED/);

    expect(providerRequests).toEqual([]);

    await assertNoHorizontalOverflow(page);
  });

  test('tablet 1024 — widget fits dashboard grid', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-1024', 'Tablet dashboard communication widget');

    await openDashboardWithCommunicationWidget(page);
    const widget = page.getByTestId('dashboard-communication-widget');
    await expect(widget).toBeVisible();
    await expect(widget.getByTestId('dashboard-communication-summary')).toBeVisible();
    await expect(page.getByTestId('dashboard-tasks-overview-panel')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('mobile 390 — metrics wrap and row tap opens Communication Center', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile dashboard communication widget');

    await openDashboardWithCommunicationWidget(page);
    const widget = page.getByTestId('dashboard-communication-widget');
    await expect(widget.getByRole('button', { name: /Unread/i })).toBeVisible();
    await widget.getByTestId('dashboard-communication-row').first().click();
    await expect(page).toHaveURL(/view=communication-center/);
    await assertNoHorizontalOverflow(page);
  });

  test('hides widget without communication.read', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'RBAC proof on desktop only');
    await page.addInitScript(
      ({ token, authUser, orgId }) => {
        localStorage.setItem('synqdrive_token', token);
        localStorage.setItem('synqdrive_user', JSON.stringify(authUser));
        localStorage.setItem('synqdrive.locale', 'en');
        localStorage.setItem('synqdrive.selectedOrgId', orgId);
      },
      {
        token: 'communication-dashboard-e2e-token',
        authUser: { ...mockUserWithoutCommunication, organizationId: TEST_ORG_ID },
        orgId: TEST_ORG_ID,
      },
    );
    await installTaskMocks(page);
    await page.route('**/auth/me', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockUserWithoutCommunication, organizationId: TEST_ORG_ID }),
      });
    });

    const communicationRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes(`/organizations/${TEST_ORG_ID}/communication/`)) {
        communicationRequests.push(url);
      }
    });

    await page.goto('/rental', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dashboard-tasks-overview-panel').waitFor({ state: 'visible', timeout: 45_000 });
    await expect(page.getByTestId('dashboard-communication-widget')).toHaveCount(0);
    expect(communicationRequests).toEqual([]);
  });
});
