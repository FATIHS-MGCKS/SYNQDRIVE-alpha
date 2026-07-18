import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openStationDetail,
  openStationsListPage,
} from './stations-v2-fixtures';

test.beforeEach(({ }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Stations responsive specs run on desktop-1280 only');
});

const viewports = [
  { name: 'mobile-320', width: 320, height: 640 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Stations V2 responsive — ${theme}`, () => {
    for (const vp of viewports) {
      test(`${vp.name}: stations list and detail without horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await openStationsListPage(page, { theme });
        await assertNoHorizontalOverflow(page);

        await expect(page.getByRole('heading', { name: 'Stationen' })).toBeVisible();
        await expect(page.getByLabel('Stationen suchen')).toBeVisible();

        await openStationDetail(page, 'Kassel Hauptbahnhof', 'overview');
        await assertNoHorizontalOverflow(page);
        await expect(page.getByRole('tablist', { name: 'Stationsdetail-Bereiche' })).toBeVisible();
      });
    }
  });
}

test('EN locale renders stations page title in English', async ({ page }) => {
  await openStationsListPage(page, { locale: 'en' });
  await expect(page.getByRole('heading', { name: 'Stations' })).toBeVisible();
  await expect(page.getByLabel('Search stations')).toBeVisible();
});

test('mobile navigation opens stations from sidebar drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStationsListPage(page);
  await expect(page.getByRole('heading', { name: 'Stationen' })).toBeVisible();
  await expect(page.getByText('Kassel Hauptbahnhof', { exact: true })).toBeVisible();
});

test('keyboard tab navigation moves between detail tabs', async ({ page }) => {
  await openStationsListPage(page);
  await openStationDetail(page, 'Kassel Hauptbahnhof', 'overview');

  await page.getByRole('tab', { name: 'Uebersicht' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Flotte' })).toHaveAttribute('aria-selected', 'true');
});
