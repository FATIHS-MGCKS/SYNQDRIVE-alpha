import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openDocumentIntakeV2,
  readyExtraction,
  resetDocumentIntakeV2MockState,
  uploadSamplePdf,
} from './document-intake-v2-fixtures';

const viewports = [
  { name: 'mobile-320', width: 320, height: 640 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Document Intake V2 responsive — ${theme}`, () => {
    test.beforeEach(() => {
      resetDocumentIntakeV2MockState();
    });

    for (const vp of viewports) {
      test(`${vp.name}: idle upload without horizontal overflow`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== vp.name, `${vp.name} only`);

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await openDocumentIntakeV2(page, { theme });
        await expect(page.getByRole('heading', { name: /Dokumenten-Upload|Document Upload/i })).toBeVisible();
        await expect(page.getByRole('navigation', { name: /Dokumenten-Bereiche|Document sections/i })).toBeVisible();
        await assertNoHorizontalOverflow(page);
      });

      test(`${vp.name}: ready-for-review without horizontal overflow`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== vp.name, `${vp.name} only`);

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await openDocumentIntakeV2(page, { theme });
        await uploadSamplePdf(page);
        await expect(page.getByText(/KI-Analyse abgeschlossen|analysis complete/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i })).toBeVisible({
          timeout: 15_000,
        });
        await assertNoHorizontalOverflow(page);
      });
    }
  });
}
