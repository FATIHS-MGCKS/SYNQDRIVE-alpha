import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openEvaluationsPage,
  resetEvaluationsMockState,
  saveEvaluationsScreenshot,
  type EvaluationsScenarioProfile,
} from './evaluations-fixtures';

const VISUAL_SCENARIOS: EvaluationsScenarioProfile[] = [
  'full-org',
  'empty-org',
  'stale-sources',
  'backend-error',
  'many-insights',
  'grouped-insights',
  'forecast-available',
  'forecast-unavailable',
];

const ALL_VIEWPORT_PROJECTS = [
  'mobile-320',
  'mobile-375',
  'mobile-390',
  'mobile-430',
  'tablet-768',
  'desktop-1280',
  'desktop-1920',
] as const;

test.describe('Auswertungen — visual regression snapshots', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const profile of VISUAL_SCENARIOS) {
    for (const projectName of ALL_VIEWPORT_PROJECTS) {
      test(`snapshot ${profile} @ ${projectName}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== projectName, `${projectName} only`);

        resetEvaluationsMockState(profile);
        await openEvaluationsPage(page, { profile, theme: 'light' });

        await expect(page.getByTestId('evaluations-page')).toBeVisible();
        await assertNoHorizontalOverflow(page);

        await saveEvaluationsScreenshot(
          page,
          `evaluations-${profile}-${projectName}-light`,
          testInfo,
        );
      });
    }
  }

  test('dark theme snapshot @ desktop-1280', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');

    resetEvaluationsMockState('full-org');
    await openEvaluationsPage(page, { profile: 'full-org', theme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);

    await saveEvaluationsScreenshot(page, 'evaluations-full-org-desktop-1280-dark', testInfo);
  });

  test('breakdown dialog snapshot @ desktop-1280', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');

    await openEvaluationsPage(page, { profile: 'full-org' });
    await page.getByRole('button', { name: /Issued Revenue MTD/i }).click();
    await expect(page.getByTestId('evaluations-breakdown-dialog')).toBeVisible();

    await saveEvaluationsScreenshot(page, 'evaluations-breakdown-dialog-desktop-1280', testInfo);
  });
});

test.describe('Auswertungen — responsive layout', () => {
  test('mobile KPI grid does not overflow at 320px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-320', 'mobile-320 only');

    await openEvaluationsPage(page, { profile: 'full-org' });
    await assertNoHorizontalOverflow(page);
    await expect(page.getByText('Business Risks')).toBeVisible();
    await expect(page.getByText('Financial Intelligence')).toBeVisible();
  });

  test('tablet layout keeps cockpit and finance sections stacked', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-768', 'tablet-768 only');

    await openEvaluationsPage(page, { profile: 'many-insights' });
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('evaluations-insights-cockpit')).toBeVisible();
    await expect(page.getByText('Daily Revenue & Expenses')).toBeVisible();
  });

  test('large desktop uses full content width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1920', 'desktop-1920 only');

    await openEvaluationsPage(page, { profile: 'full-org' });
    const box = await page.getByTestId('evaluations-page').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(1200);
    await assertNoHorizontalOverflow(page);
  });
});
