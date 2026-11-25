import { expect, test } from '@playwright/test';
import {
  installMasterSidebarMocks,
  mockMasterSidebarAdmin,
  openMasterSidebarView,
} from './master-sidebar-v1-fixtures';

test.describe('Master product catalog editor', () => {
  test.beforeEach(async ({ page }) => {
    await installMasterSidebarMocks(page);
    await page.route('**/organizations/operational**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'org-e2e', companyName: 'E2E Org', city: 'Berlin', country: 'DE' }],
          meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
        }),
      });
    });
    await page.route('**/admin/products**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.match(/\/admin\/products\/stats/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { slug: 'RENTAL', totalOrgs: 2, active: 1 },
            { slug: 'FLEET', totalOrgs: 0, active: 0 },
            { slug: 'VYMOD', totalOrgs: 0, active: 0 },
          ]),
        });
      }
      if (url.match(/\/admin\/products\/RENTAL$/) && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            slug: 'RENTAL',
            name: 'SYNQDRIVE Rental',
            description: 'Ops',
            catalogStatus: 'ACTIVE',
            organizationsCount: 2,
          }),
        });
      }
      if (url.match(/\/admin\/products$/) && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: '1',
              slug: 'RENTAL',
              name: 'SYNQDRIVE Rental',
              description: 'Ops',
              catalogStatus: 'ACTIVE',
              organizationsCount: 2,
            },
            { id: '2', slug: 'FLEET', name: 'Fleet', catalogStatus: 'ACTIVE', organizationsCount: 0 },
            { id: '3', slug: 'VYMOD', name: 'VYMOD', catalogStatus: 'ACTIVE', organizationsCount: 0 },
          ]),
        });
      }
      return route.continue();
    });
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('synqdrive_token', token);
        localStorage.setItem('synqdrive_user', JSON.stringify(user));
        localStorage.setItem('synqdrive.locale', 'en');
        localStorage.setItem('synqdrive-theme-preference', 'light');
      },
      { token: 'master-product-editor-e2e', user: mockMasterSidebarAdmin },
    );
  });

  test('desktop: opens editor from roadmap card', async ({ page }) => {
    await openMasterSidebarView(page, 'product-management', { width: 1280, height: 900 });
    const rentalCard = page.locator('[data-product-slug="RENTAL"]');
    await expect(rentalCard).toBeVisible({ timeout: 30_000 });
    const editBtn = rentalCard.getByRole('button').first();
    await expect(editBtn).toBeVisible({ timeout: 30_000 });
    await editBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Display name')).toHaveValue('SYNQDRIVE Rental');
  });

  test('mobile: editor layout', async ({ page }) => {
    await openMasterSidebarView(page, 'product-management', { width: 390, height: 844 });
    const rentalCard = page.locator('[data-product-slug="RENTAL"]');
    await expect(rentalCard).toBeVisible({ timeout: 30_000 });
    await rentalCard.getByRole('button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });
});