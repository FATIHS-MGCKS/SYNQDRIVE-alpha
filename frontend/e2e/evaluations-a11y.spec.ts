import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  assertSeverityHasTextLabel,
  openEvaluationsPage,
  resetEvaluationsMockState,
} from './evaluations-fixtures';

test.describe('Auswertungen — accessibility', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'A11y specs run on desktop-1280 only');
    resetEvaluationsMockState('full-org');
    await openEvaluationsPage(page, { profile: 'full-org' });
  });

  test('main page passes axe scan (critical/serious)', async ({ page }) => {
    await assertNoHorizontalOverflow(page);

    const results = await new AxeBuilder({ page })
      .include('[data-testid="evaluations-page"]')
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });

  test('keyboard: Tab reaches KPI buttons and breakdown dialog', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT', 'SELECT']).toContain(focusedTag);

    await page.getByRole('button', { name: /Issued Revenue MTD/i }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByTestId('evaluations-breakdown-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByRole('heading', { name: 'Revenue MTD breakdown' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('breakdown dialog has labelled heading and close control', async ({ page }) => {
    await page.getByRole('button', { name: /Issued Revenue MTD/i }).click();
    const dialog = page.getByTestId('evaluations-breakdown-dialog');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'evaluations-breakdown-title');
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeVisible();
  });

  test('insight KPI cards expose aria-label summaries', async ({ page }) => {
    const kpi = page.locator('[aria-label*="Business Risks"]').first();
    await expect(kpi).toBeVisible();
  });

  test('severity badges use text labels, not color alone', async ({ page }) => {
    await assertSeverityHasTextLabel(page);
    await expect(page.getByText('CRITICAL').first()).toBeVisible();
  });

  test('responsive: no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('evaluations-page')).toBeVisible();
  });
});
