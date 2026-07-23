import { expect, test } from '@playwright/test';

import {
  openRentalRulesSettings,
  resetRentalRulesMockState,
  TEST_ORG_ID,
} from './rental-rules-fixtures';

test.describe('Rental rules administration E2E flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    resetRentalRulesMockState();
  });

  test('flows: open rental rules tab, overview, matrix, mobile layout', async ({ page }) => {
    test.setTimeout(90_000);
    await openRentalRulesSettings(page);

    await expect(page.getByRole('heading', { name: /Mietregeln/i })).toBeVisible();
    await expect(page.getByTestId('rental-rules-overview')).toBeVisible();

    await page.getByRole('tab', { name: /Kategorien/i }).click();
    await expect(page.getByTestId('rental-rules-matrix')).toBeVisible();

    const search = page.getByRole('searchbox', { name: /Kategorien durchsuchen/i });
    await search.fill('SUV');
    await expect(page.getByText('SUV Premium')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('rental-rules-matrix-mobile')).toBeVisible();
  });

  test('flows: org defaults drawer tri-state editor opens', async ({ page }) => {
    await openRentalRulesSettings(page);
    await page.getByRole('tab', { name: /Unternehmensstandard/i }).click();
    await page.getByRole('button', { name: /Standard bearbeiten/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('radiogroup').first()).toBeVisible();
  });
});

test.describe('Rental rules responsive viewports', () => {
  test('mobile-390: rental rules matrix renders without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRentalRulesSettings(page);
    await page.getByRole('tab', { name: /Kategorien/i }).click();
    await expect(page.getByTestId('rental-rules-matrix-mobile')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
