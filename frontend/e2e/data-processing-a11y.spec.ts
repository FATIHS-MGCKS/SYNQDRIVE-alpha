import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  installDataProcessingA11yMocks,
  openDataProcessingHub,
} from './data-processing-a11y-fixtures';

test.describe('Data Processing — accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await installDataProcessingA11yMocks(page);
  });

  test('section tablist exposes tab/tabpanel wiring', async ({ page }) => {
    await openDataProcessingHub(page);

    const tablist = page.getByRole('tablist', { name: /Datenverarbeitung|Data processing sections/i });
    await expect(tablist).toBeVisible();

    const activitiesTab = page.getByRole('tab', { name: /Verarbeitungstätigkeiten|Processing activities/i });
    await expect(activitiesTab).toHaveAttribute('aria-controls', 'dp-section-panel-activities');
    await expect(activitiesTab).toHaveAttribute('aria-selected', 'true');

    const panel = page.locator('#dp-section-panel-activities');
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', 'dp-section-tab-activities');
  });

  test('keyboard: arrow keys move between section tabs', async ({ page }) => {
    await openDataProcessingHub(page);
    const activitiesTab = page.getByRole('tab', { name: /Verarbeitungstätigkeiten|Processing activities/i });
    await activitiesTab.focus();
    await page.keyboard.press('ArrowRight');
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe('dp-section-tab-enforcement');
  });

  test('keyboard: Home and End jump section tabs', async ({ page }) => {
    await openDataProcessingHub(page);
    const activitiesTab = page.getByRole('tab', { name: /Verarbeitungstätigkeiten|Processing activities/i });
    await activitiesTab.focus();
    await page.keyboard.press('End');
    const endId = await page.evaluate(() => document.activeElement?.id);
    expect(endId).toBe('dp-section-tab-audit');
    await page.keyboard.press('Home');
    const homeId = await page.evaluate(() => document.activeElement?.id);
    expect(homeId).toBe('dp-section-tab-activities');
  });

  test('hub passes axe scan (critical/serious)', async ({ page }) => {
    await openDataProcessingHub(page);
    await assertNoHorizontalOverflow(page);

    const results = await new AxeBuilder({ page })
      .include('#data-processing-main')
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });

  test('wizard dialog opens with progressbar and closes on Escape', async ({ page }) => {
    await openDataProcessingHub(page);
    await page.getByRole('button', { name: /Neuer Vorgang|New procedure/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('responsive: no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openDataProcessingHub(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.locator('#data-processing-main')).toBeVisible();
  });
});
