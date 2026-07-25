import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  installOperatorA11yMocks,
  openOperatorToday,
} from './operator-a11y-fixtures';

test.describe('Operator App — accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await installOperatorA11yMocks(page);
  });

  test('shell exposes skip link, main landmark, and bottom navigation', async ({ page }) => {
    await openOperatorToday(page);

    const skipLink = page.locator('#operator-skip-link');
    await skipLink.focus();
    await expect(skipLink).toBeFocused();

    await skipLink.click();
    await expect(page.locator('#operator-main-content')).toBeFocused();

    const nav = page.getByRole('navigation', { name: 'Operator navigation' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
  });

  test('keyboard: bottom nav switches tabs', async ({ page }) => {
    await openOperatorToday(page);
    await page.getByRole('button', { name: 'Scan' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Scan' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('searchbox')).toBeVisible();
  });

  test('operator today view passes axe scan (critical violations)', async ({ page }) => {
    await openOperatorToday(page);
    await assertNoHorizontalOverflow(page);

    const results = await new AxeBuilder({ page })
      .include('#operator-main-content')
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toEqual([]);
  });

  test('responsive: no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openOperatorToday(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByRole('navigation', { name: 'Operator navigation' })).toBeVisible();
  });
});
