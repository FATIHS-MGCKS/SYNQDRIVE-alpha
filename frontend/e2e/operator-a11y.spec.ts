import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openOperatorApp } from './operator-fixtures';

test.describe('Operator App — accessibility', () => {
  test('today view has no critical a11y violations', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-375', 'A11y on mobile-375');
    await openOperatorApp(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
  });

  test('connectivity banner exposes status role when offline', async ({ page, context }) => {
    test.skip(test.info().project.name !== 'mobile-375', 'A11y on mobile-375');
    await openOperatorApp(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const banner = page
      .locator('[role="status"]')
      .filter({ hasText: 'Aktionen werden erst nach erneutem Senden übernommen' });
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });
});
