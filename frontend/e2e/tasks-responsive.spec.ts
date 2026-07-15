import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  assertNoVisibleUuids,
  openTaskDetail,
  openTasksPage,
  taskCardLocator,
} from './task-fixtures';

const ARTIFACT_VIEWPORTS = ['mobile-375', 'tablet-768', 'desktop-1280'] as const;

test.describe('Task Management responsive & accessibility', () => {
  test('list view: layout, themes, focus, labels', async ({ page }, testInfo) => {
    await openTasksPage(page, { theme: 'light' });

    await expect(page.getByTestId('tasks-view')).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Aufgaben-Ansichten' })).toBeVisible();
    await expect(page.getByLabel('Aufgaben suchen')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoVisibleUuids(page);

    if (ARTIFACT_VIEWPORTS.includes(testInfo.project.name as (typeof ARTIFACT_VIEWPORTS)[number])) {
      await page.screenshot({
        path: `playwright-report/tasks-list-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }

    await page.getByRole('button', { name: 'Design: Hell' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA']).toContain(focusedTag);
  });

  test('detail drawer: sticky actions, safe areas, readable labels', async ({ page }, testInfo) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Reifen prüfen E2E');

    await expect(page.getByTestId('task-detail-body')).toBeVisible();
    await expect(page.getByTestId('task-detail-action-bar')).toBeVisible();
    await expect(page.getByTestId('task-detail-action-bar-desktop')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoVisibleUuids(page);

    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      await expect(page.getByRole('dialog')).toBeVisible();
    }

    if (ARTIFACT_VIEWPORTS.includes(testInfo.project.name as (typeof ARTIFACT_VIEWPORTS)[number])) {
      await page.screenshot({
        path: `playwright-report/tasks-detail-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
  });

  test('mobile cards remain tappable without clipped content', async ({ page }) => {
    await openTasksPage(page);
    const card = taskCardLocator(page, 'Reifen prüfen E2E');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width ?? 0).toBeLessThanOrEqual((viewport?.width ?? 1280) + 1);
    await card.click();
    await expect(page.getByTestId('task-detail-body')).toBeVisible();
  });
});
