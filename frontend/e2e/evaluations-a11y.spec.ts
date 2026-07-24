import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  openEvaluationsPage,
} from './evaluations-fixtures';

test.describe('Evaluations — accessibility', () => {
  test('page exposes main landmark and labeled filter fieldset', async ({ page }) => {
    await openEvaluationsPage(page);

    await expect(page.getByTestId('evaluations-page')).toBeVisible();
    await expect(page.locator('main[data-testid="evaluations-page"]')).toBeVisible();

    const filterBar = page.getByTestId('evaluations-filter-bar');
    await expect(filterBar).toBeVisible();
    await expect(filterBar.locator('legend')).toHaveCount(1);
    await expect(filterBar.getByLabel(/Zeitraum|Period/i)).toBeVisible();
    await expect(filterBar.getByLabel(/Risikokategorie|Risk category/i)).toBeVisible();
  });

  test('SW cockpit category tabs use tablist semantics and arrow keys', async ({ page }) => {
    await openEvaluationsPage(page);

    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: /Stärken & Schwächen|Strengths & weaknesses/i }).click();
    const tablist = page.getByRole('tablist').first();
    const tabCount = await tablist.getByRole('tab').count();
    test.skip(tabCount === 0, 'Mock summary has no SW cockpit findings');

    await expect(tablist).toBeVisible();
    const firstTab = tablist.getByRole('tab').first();
    await firstTab.focus();
    const beforeId = await page.evaluate(() => document.activeElement?.id);
    await page.keyboard.press('ArrowRight');
    const afterId = await page.evaluate(() => document.activeElement?.id);
    expect(afterId).toBeTruthy();
    expect(afterId).not.toBe(beforeId);
  });

  test('section collapse buttons are keyboard focusable with visible labels', async ({ page }) => {
    await openEvaluationsPage(page);

    const financeSection = page.locator('#auswertungen-finanzen');
    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: /Finanzen|Finance/i }).click();
    await financeSection.scrollIntoViewIfNeeded();

    const toggle = financeSection.locator('header button[aria-expanded]').first();
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-controls', /-body$/);
  });

  test('evaluations main region passes axe scan (critical/serious)', async ({ page }) => {
    await openEvaluationsPage(page);
    await assertNoHorizontalOverflow(page);

    const results = await new AxeBuilder({ page })
      .include('[data-testid="evaluations-page"]')
      .disableRules(['color-contrast', 'nested-interactive', 'scrollable-region-focusable'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });

  test('risk matrix exposes table alternative for screen readers', async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('mobile-') && testInfo.project.name !== 'tablet-768',
      'Mobile table fallback check',
    );

    await openEvaluationsPage(page);
    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: /Risiken|Risks/i }).click();
    await page.locator('#auswertungen-risiken').scrollIntoViewIfNeeded();

    const table = page.getByTestId('eval-risk-matrix-table');
    await expect(table).toBeVisible();
    await expect(table.locator('caption')).toHaveCount(1);
    await expect(table.getByRole('columnheader', { name: /Kategorie|Category/i })).toBeVisible();
  });
});
