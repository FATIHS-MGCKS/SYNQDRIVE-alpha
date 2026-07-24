import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  installDataProcessingA11yMocks,
  openDataProcessingHub,
} from './data-processing-a11y-fixtures';
import {
  attachNetworkFailureLogging,
  fillInternalProcessingWizard,
  installDataProcessingFlowMocks,
  openDataProcessingHub as openFlowHub,
  submitWizardDraft,
} from './data-processing-flow-fixtures';

test.describe('Data Processing — mobile wizard & accessibility', () => {
  test.beforeEach(({ page }) => {
    attachNetworkFailureLogging(page);
  });

  test('21 — Mobile wizard completes draft save at 375px (DE)', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile viewport only');
    await page.setViewportSize({ width: 375, height: 812 });
    await installDataProcessingFlowMocks(page, { locale: 'de' });
    await openFlowHub(page);
    await fillInternalProcessingWizard(page, 'PA.MOBILE.DE');
    await submitWizardDraft(page);
    await expect(page.locator('#data-processing-main')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('21 — Mobile wizard completes draft save at 375px (EN)', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile viewport only');
    await page.setViewportSize({ width: 375, height: 812 });
    await installDataProcessingFlowMocks(page, { locale: 'en' });
    await openFlowHub(page);
    await fillInternalProcessingWizard(page, 'PA.MOBILE.EN');
    await submitWizardDraft(page);
    await expect(page.locator('#data-processing-main')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('22 — Accessibility: hub axe scan on mobile 320px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-320', 'A11y mobile check on 320px');
    await installDataProcessingA11yMocks(page);
    await openDataProcessingHub(page);
    await assertNoHorizontalOverflow(page);
    const results = await new AxeBuilder({ page })
      .include('#data-processing-main')
      .disableRules(['color-contrast'])
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });
});
