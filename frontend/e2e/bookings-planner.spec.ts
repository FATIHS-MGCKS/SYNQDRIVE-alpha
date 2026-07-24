import { expect, test } from '@playwright/test';

import {
  expectBookingVisible,
  openBookingsPage,
} from './bookings-planner-fixtures';

test.describe('Booking planner E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — loads bookings list with timeline view (DE)', async ({ page }) => {
    test.setTimeout(120_000);
    await openBookingsPage(page, { locale: 'de' });

    await expect(page.getByRole('heading', { name: 'Buchungen' })).toBeVisible();
    await expectBookingVisible(page, 'Anna Schmidt');
    await expectBookingVisible(page, 'Max Müller');
  });

  test('2 — search filter narrows results', async ({ page }) => {
    await openBookingsPage(page);
    const search = page.getByPlaceholder(/Kunde, Fahrzeug|Customer, vehicle/i);
    await search.fill('Anna Schmidt');
    await expectBookingVisible(page, 'Anna Schmidt');
    await expect(page.getByText('Max Müller')).toHaveCount(0);
    await search.fill('');
  });

  test('3 — switches planner views (timeline → table → calendar)', async ({ page }) => {
    await openBookingsPage(page);

    await page.getByRole('button', { name: /Tabelle|Table/i }).click();
    await expect(page.getByRole('cell', { name: /Anna Schmidt/i })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /Timeline/i }).click();
    await expect(page.getByText(/2 Buchungen|2 bookings/i)).toBeVisible();

    await page.getByRole('button', { name: /Kalender|Calendar/i }).click();
    await expect(page.getByRole('button', { name: /Tabelle|Table/i })).toBeVisible();
  });

  test('4 — status filter shows only active bookings', async ({ page }) => {
    await openBookingsPage(page);
    await page.locator('select').first().selectOption('active');
    await expectBookingVisible(page, 'Max Müller');
    await expect(page.getByText('Anna Schmidt')).toHaveCount(0);
  });

  test('5 — error state with retry', async ({ page }) => {
    await openBookingsPage(page, { failFirstList: true });
    await expect(page.getByText(/konnten nicht geladen|could not be loaded/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Erneut laden|Reload/i }).click();
    await expectBookingVisible(page, 'Anna Schmidt');
  });

  test('6 — empty state when filter matches nothing', async ({ page }) => {
    await openBookingsPage(page);
    const search = page.getByPlaceholder(/Kunde, Fahrzeug|Customer, vehicle/i);
    await search.fill('___no-match___');
    await expect(page.getByText(/Keine Buchungen|No bookings/i)).toBeVisible({ timeout: 10000 });
  });

  test('7 — EN locale navigation label', async ({ page }) => {
    await openBookingsPage(page, { locale: 'en' });
    await expect(page.getByRole('button', { name: 'Bookings' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Language: English' })).toBeVisible();
  });
});
