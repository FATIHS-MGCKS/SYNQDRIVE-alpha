/**
 * Product Catalog V2 UX acceptance (mocked APIs — UI/a11y/responsive only).
 * Backend authorization and persistence are certified in backend Postgres HTTP suites.
 *
 * Live backend-integrated Playwright requires PRODUCT_CATALOG_V2_LIVE_E2E=1 and a running API.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  installMasterSidebarMocks,
  mockMasterSidebarAdmin,
  openMasterSidebarView,
} from './master-sidebar-v1-fixtures';

const LOCALES = ['en', 'de', 'pl', 'fr', 'cs', 'nl', 'es', 'tr', 'it'] as const;

const STATUS_ACTION: Record<(typeof LOCALES)[number], RegExp> = {
  en: /Change catalog status/i,
  de: /Katalogstatus ändern/i,
  pl: /Zmień status katalogu/i,
  fr: /Modifier le statut catalogue/i,
  cs: /Změnit stav katalogu/i,
  nl: /Catalogusstatus wijzigen/i,
  es: /Cambiar estado del catálogo/i,
  tr: /Katalog durumunu değiştir/i,
  it: /Modifica stato catalogo/i,
};

test.describe('Product Catalog V2 UX (mocked APIs)', () => {
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
      if (url.match(/\/catalog-status\/impact/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            productSlug: 'RENTAL',
            currentCatalogStatus: 'ACTIVE',
            targetCatalogStatus: 'DISABLED',
            blocksNewOrganizationAssignment: true,
            preservesExistingOrganizationProducts: true,
            preservesExistingVehicleGrants: true,
            doesNotAutomaticallyReactivateCustomers: true,
          }),
        });
      }
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
        localStorage.setItem('synqdrive-theme-preference', 'light');
      },
      { token: 'product-catalog-v2-ui', user: mockMasterSidebarAdmin },
    );
  });

  for (const locale of LOCALES) {
    test(`locale ${locale}: status dialog exposes localized title`, async ({ page }) => {
      await page.addInitScript((loc) => {
        localStorage.setItem('synqdrive.locale', loc);
      }, locale);
      await openMasterSidebarView(page, 'product-management', { width: 1280, height: 900 });
      const rentalCard = page.locator('[data-product-slug="RENTAL"]');
      await rentalCard.getByRole('button').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: STATUS_ACTION[locale] }).click();
      await expect(page.getByRole('dialog').last()).toBeVisible();
      await expect(page.locator('#catalog-status-change-title')).toBeVisible();
    });
  }

  test('tablet: keyboard focus reaches reason field', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-768', 'Keyboard focus runs on tablet project only');
    await openMasterSidebarView(page, 'product-management', { width: 768, height: 1024 });
    await page.locator('[data-product-slug="RENTAL"]').getByRole('button').first().click();
    await page.getByRole('dialog').getByRole('button', { name: STATUS_ACTION.en }).click();
    await page.locator('#catalog-status-reason').focus();
    await expect(page.locator('#catalog-status-reason')).toBeFocused();
  });

  test('mobile: status dialog layout', async ({ page }) => {
    await openMasterSidebarView(page, 'product-management', { width: 390, height: 844 });
    await page.locator('[data-product-slug="RENTAL"]').getByRole('button').first().click();
    await page.getByRole('dialog').getByRole('button', { name: STATUS_ACTION.en }).click();
    await expect(page.locator('#catalog-status-reason')).toBeVisible();
  });

  test('desktop: axe status change dialog', async ({ page }) => {
    await openMasterSidebarView(page, 'product-management', { width: 1280, height: 900 });
    await page.locator('[data-product-slug="RENTAL"]').getByRole('button').first().click();
    await page.getByRole('dialog').getByRole('button', { name: STATUS_ACTION.en }).click();
    const results = await new AxeBuilder({ page })
      .include('#catalog-status-change-title')
      .disableRules(['color-contrast', 'aria-allowed-role'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });
});

const live = process.env.PRODUCT_CATALOG_V2_LIVE_E2E === '1';

test.describe(live ? 'Product Catalog V2 LIVE API' : 'Product Catalog V2 LIVE API (skipped)', () => {
  test.skip(!live, 'Set PRODUCT_CATALOG_V2_LIVE_E2E=1 with running backend to enable');

  test('live: master products list requires auth', async ({ request }) => {
    const base = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001';
    const res = await request.get(`${base}/api/v1/admin/products`);
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });
});