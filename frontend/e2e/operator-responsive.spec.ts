import { expect, test } from '@playwright/test';

import { openOperatorApp } from './operator-fixtures';

const RESPONSIVE_PROJECTS = [
  'mobile-320',
  'mobile-360',
  'mobile-390',
  'mobile-430',
  'tablet-768',
  'landscape-375',
  'desktop-1280',
] as const;

for (const projectName of RESPONSIVE_PROJECTS) {
  test.describe(`Operator responsive — ${projectName}`, () => {
    test(`shell renders without horizontal overflow (${projectName})`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== projectName, `Viewport project ${projectName}`);
      test.setTimeout(90_000);
      await openOperatorApp(page);
      const shell = page.getByTestId('operator-shell');
      if (await shell.count()) {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
        await expect(page.getByRole('navigation', { name: 'Operator navigation' })).toBeVisible();
      } else {
        await expect(page.getByTestId('operator-desktop-only')).toBeVisible();
      }
    });
  });
}

test.describe('Operator desktop fallback', () => {
  test('desktop-1920 shows mobile-only notice', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1920', 'Desktop fallback on desktop-1920');
    await openOperatorApp(page);
    await expect(page.getByTestId('operator-desktop-only')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/mobile Endgeräte und Tablets/i)).toBeVisible();
  });
});
