import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  installLegalDocumentsA11yMocks,
  openLegalDocumentsAdminTab,
} from './legal-documents-a11y-fixtures';

test.describe('Legal Documents — accessibility (administration)', () => {
  test.beforeEach(async ({ page }) => {
    await installLegalDocumentsA11yMocks(page);
  });

  test('administration tablist exposes tab/tabpanel wiring', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/rental/settings');
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();

    const legalTab = page.getByRole('tab', { name: /Kunden-Rechtstexte|legalDocuments/i });
    await expect(legalTab).toHaveAttribute('aria-controls', 'admin-panel-legal-documents');
    await legalTab.click();
    await expect(legalTab).toHaveAttribute('aria-selected', 'true');

    const panel = page.locator('#admin-panel-legal-documents');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#legal-documents-main')).toBeVisible();
  });

  test('keyboard: arrow keys move focus between administration tabs', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/rental/settings');
    const legalTab = page.getByRole('tab', { name: /Kunden-Rechtstexte|legalDocuments/i });
    await legalTab.focus();
    await page.keyboard.press('ArrowLeft');
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBeTruthy();
    expect(focusedId).not.toBe('admin-tab-legal-documents');
  });

  test('legal documents page passes axe scan (critical violations)', async ({ page }) => {
    await openLegalDocumentsAdminTab(page);
    await assertNoHorizontalOverflow(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });

  test('upload wizard dialog is keyboard reachable and labeled', async ({ page }) => {
    await openLegalDocumentsAdminTab(page);
    await page.getByTestId('legal-documents-new-version').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('responsive: no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openLegalDocumentsAdminTab(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('legal-version-mobile-list-TERMS_AND_CONDITIONS')).toBeVisible();
  });
});
