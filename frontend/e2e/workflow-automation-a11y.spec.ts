import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  installWorkflowAutomationFlowMocks,
  openWorkflowAutomationView,
} from './workflow-automation-flow-fixtures';

test.describe('Workflow Automation — accessibility', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'A11y specs run on desktop-1280 only');
  });

  test('workflow automation view has no critical axe violations', async ({ page }) => {
    await installWorkflowAutomationFlowMocks(page);
    await openWorkflowAutomationView(page);

    await page.waitForTimeout(1000);

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical).toEqual([]);
  });
});
