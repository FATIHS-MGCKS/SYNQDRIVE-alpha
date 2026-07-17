import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  batteryHealthDetailRoot,
  openBatteryHealthRental,
  openBatteryHealthTab,
} from './battery-health-fixtures';

test.beforeEach(({ }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Battery responsive specs run on desktop-1280 only');
});

const viewports = [
  { name: 'mobile-320', width: 320, height: 640 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Battery Health V2 responsive — ${theme}`, () => {
    for (const vp of viewports) {
      test(`${vp.name}: health tab and LV detail without horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await openBatteryHealthRental(page, { profile: 'ice-lv-stable', theme });
        await openBatteryHealthTab(page);
        await assertNoHorizontalOverflow(page);

        const detailPanel = batteryHealthDetailRoot(page);
        await expect(detailPanel.getByText('Geschätzter 12V-Batteriezustand').first()).toBeVisible({
          timeout: 15_000,
        });
        await assertNoHorizontalOverflow(page);

        const longGerman =
          'Werkstattbefund mit ausführlicher Beschreibung der 12V-Batterie für schmale Displays ohne Layoutbruch';
        await expect(page.locator('body')).toContainText('12V-Batterie');
        await expect(page.locator('body')).not.toContainText(longGerman);
      });
    }
  });
}
