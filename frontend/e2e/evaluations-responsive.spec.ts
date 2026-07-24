import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  navigateToEvaluationsView,
  openEvaluationsPage,
  saveEvaluationsScreenshot,
} from './evaluations-fixtures';

const VIEWPORTS_FOR_ARTIFACTS = ['mobile-375', 'tablet-768', 'desktop-1280', 'desktop-1920'] as const;

test.describe('Evaluations responsive acceptance', () => {
  test('page shell: no horizontal overflow, filter bar and nav visible', async ({ page }, testInfo) => {
    await openEvaluationsPage(page);

    await expect(page.getByTestId('evaluations-page')).toBeVisible();
    await expect(page.getByTestId('evaluations-section-nav')).toBeVisible();
    await expect(page.getByTestId('evaluations-filter-bar')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    if (VIEWPORTS_FOR_ARTIFACTS.includes(testInfo.project.name as (typeof VIEWPORTS_FOR_ARTIFACTS)[number])) {
      await saveEvaluationsScreenshot(page, `evaluations-page-${testInfo.project.name}`, testInfo);
    }
  });

  test('filter controls meet touch target and do not block scroll', async ({ page }, testInfo) => {
    await openEvaluationsPage(page);

    const filterBar = page.getByTestId('evaluations-filter-bar');
    await expect(filterBar).toBeVisible();

    const periodSelect = filterBar.getByLabel('Zeitraum');
    await expect(periodSelect).toBeVisible();
    const box = await periodSelect.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await periodSelect.selectOption('last7d');
    await assertNoHorizontalOverflow(page);

    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(pageHeight).toBeGreaterThan(400);
  });

  test('section nav anchors scroll without overflow', async ({ page }) => {
    await openEvaluationsPage(page);

    const nav = page.getByTestId('evaluations-section-nav');
    await nav.getByRole('link', { name: 'Risiken' }).click();
    await expect(page.locator('#auswertungen-risiken')).toBeInViewport();
    await assertNoHorizontalOverflow(page);
  });

  test('charts expose mobile table alternative on narrow viewports', async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('mobile-') && testInfo.project.name !== 'tablet-768',
      'Mobile/tablet chart fallback check',
    );

    await openEvaluationsPage(page);

    const nav = page.getByTestId('evaluations-section-nav');
    await nav.getByRole('link', { name: 'Risiken' }).click();
    await page.locator('#auswertungen-risiken').scrollIntoViewIfNeeded();
    await expect(page.locator('#auswertungen-risiken')).toBeVisible();
    await expect(page.getByText('Risikomatrix')).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('eval-risk-matrix-mobile-hint')).toBeVisible();
    await expect(page.getByTestId('eval-risk-matrix-table')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('desktop shows chart region for risk matrix', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-1280' && testInfo.project.name !== 'desktop-1920',
      'Desktop chart check',
    );

    await openEvaluationsPage(page);
    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: 'Risiken' }).click();

    await expect(page.locator('[aria-label="Risikomatrix"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('finance section expands and remains readable', async ({ page }) => {
    await openEvaluationsPage(page);

    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: 'Finanzen' }).click();
    const financeSection = page.locator('#auswertungen-finanzen');
    await financeSection.scrollIntoViewIfNeeded();
    await expect(financeSection).toBeVisible();

    const expandButton = financeSection.locator('header button[aria-expanded]').first();
    if ((await expandButton.getAttribute('aria-expanded')) === 'false') {
      await expandButton.click();
    }

    await expect(financeSection.getByText('Forderungs-Aging')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('return navigation from evaluations preserves layout', async ({ page }) => {
    await openEvaluationsPage(page);
    await navigateToEvaluationsView(page);
    await assertNoHorizontalOverflow(page);
  });
});
