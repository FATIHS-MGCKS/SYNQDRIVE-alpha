import { expect, test } from '@playwright/test';

import {
  installWorkflowAutomationFlowMocks,
  openWorkflowAutomationView,
} from './workflow-automation-flow-fixtures';

test.describe('Workflow Automation — mobile responsive', () => {
  test('renders on 320px viewport without horizontal overflow', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-320', 'Mobile specs run on mobile-320 only');

    await installWorkflowAutomationFlowMocks(page);
    await openWorkflowAutomationView(page);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});
