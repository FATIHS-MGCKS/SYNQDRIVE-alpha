import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { BOOKING_PICKUP_ID } from './operator-fixtures';
import { openOperatorApp } from './operator-fixtures';

/**
 * UX-011 bounded cross-product accessibility regression (automated slice).
 * Supplements operator-a11y, vehicle-detail-a11y, legal-documents-a11y.
 */
test.describe('UX-011 cross-product accessibility', () => {
  test('operator booking detail sheet has dialog name and close control', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-375', 'Operator mobile layout');
    await openOperatorApp(page, { path: `/operator/bookings/${BOOKING_PICKUP_ID}` });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toHaveAttribute('aria-labelledby', 'operator-booking-detail-title');
    await expect(page.locator('#operator-booking-detail-title')).toBeVisible();
    const close = page.getByRole('button', { name: 'Schließen' });
    await expect(close).toBeVisible();
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  });

  test('operator booking detail sheet axe (critical/serious, wcag2aa tags)', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-375', 'Operator mobile layout');
    await openOperatorApp(page, { path: `/operator/bookings/${BOOKING_PICKUP_ID}` });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});