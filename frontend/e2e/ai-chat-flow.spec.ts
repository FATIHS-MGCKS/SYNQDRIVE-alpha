import { expect, test } from '@playwright/test';

import {
  flowMessageForScenario,
  type FlowStreamScenarioId,
} from './ai-chat-flow-fixtures';
import { openAiChatPage } from './ai-chat-fixtures';

const textMatchers: Record<FlowStreamScenarioId, RegExp> = {
  'location-fresh': /Live-Position|Live position|52\.42/i,
  'health-limited': /Limited Data|unknown/i,
  'overdue-true': /überfällig|overdue/i,
  'combined-location-overdue': /Kombinierte|Combined|52\.42|überfällig/i,
  'permission-denied': /Berechtigung|Permission/i,
  default: /Domain-Daten|domain data/i,
};

const flowCases: Array<{ scenario: FlowStreamScenarioId; locale: 'de' | 'en'; responseType: string }> = [
  { scenario: 'location-fresh', locale: 'de', responseType: 'LOCATION_SUMMARY' },
  { scenario: 'health-limited', locale: 'en', responseType: 'HEALTH_SUMMARY' },
  { scenario: 'overdue-true', locale: 'de', responseType: 'OVERDUE_EXPLANATION' },
  { scenario: 'combined-location-overdue', locale: 'de', responseType: 'COMBINED_SUMMARY' },
  { scenario: 'permission-denied', locale: 'de', responseType: 'PERMISSION_RESTRICTED' },
];

test.describe('AI Chat — full data flow E2E', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Flow E2E runs on desktop-1280 only');
  });

  for (const entry of flowCases) {
    test(`${entry.scenario} (${entry.locale})`, async ({ page }) => {
      await page.addInitScript((locale) => {
        localStorage.setItem('synqdrive.locale', locale);
      }, entry.locale);

      await openAiChatPage(page);

      const message = flowMessageForScenario(entry.scenario, entry.locale);
      const input = page.getByTestId('ai-chat-input');
      await input.fill(message);
      await input.press('Enter');

      await expect(page.getByTestId('ai-chat-messages')).toContainText(textMatchers[entry.scenario], {
        timeout: 15000,
      });

      await expect(
        page.locator(`[data-testid="fleet-chat-compact-summary"][data-response-type="${entry.responseType}"]`).first(),
      ).toBeVisible({ timeout: 15000 });
    });
  }
});
