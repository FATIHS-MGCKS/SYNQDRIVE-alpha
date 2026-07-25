import { expect, test } from '@playwright/test';

import {
  BOOKING_FOREIGN_ID,
  BOOKING_PICKUP_ID,
  openOperatorApp,
  operatorNavButton,
  setOperatorFailNextUpload,
  setOperatorSessionExpired,
  setOperatorVersionConflictOnTaskComplete,
  submitOperatorTaskCompleteDialog,
} from './operator-fixtures';

test.describe('Operator App E2E — access & resilience', () => {
  test('2 — missing permission shows access denied', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Access tests on mobile-375');
    await openOperatorApp(page, { profile: 'driver-denied' });
    await expect(page.getByTestId('operator-access-denied')).toBeVisible();
    await expect(page.getByText('Keine Berechtigung', { exact: true })).toBeVisible();
  });

  test('24 — foreign booking resource is blocked', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Access tests on mobile-375');
    await openOperatorApp(page, { path: `/operator/bookings/${BOOKING_FOREIGN_ID}` });
    await expect(page.getByTestId('operator-shell')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await operatorNavButton(page, 'Scan').click();
    await expect(page.getByText(BOOKING_FOREIGN_ID)).toHaveCount(0);
  });

  test('25 — session expiry redirects to login on refresh', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Access tests on mobile-375');
    await openOperatorApp(page);
    setOperatorSessionExpired(true);
    await page.goto('/operator').catch(() => undefined);
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('26 — offline shows connectivity banner', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Resilience tests on mobile-375');
    await openOperatorApp(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/Verbindung instabil oder offline/i)).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  test('27 — upload failure shows error toast', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Resilience tests on mobile-375');
    await openOperatorApp(page, { path: `/operator/bookings/${BOOKING_PICKUP_ID}` });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
    setOperatorFailNextUpload(true);
    await page.getByRole('button', { name: /Dokument\/Beleg per AI Upload hochladen/i }).click();
    await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles({
      name: 'operator-e2e-receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 operator e2e upload'),
    });
    await page.getByRole('button', { name: 'Analyse starten' }).click();
    await expect(page.getByText(/Upload rejected|fehlgeschlagen|abgelehnt/i)).toBeVisible({ timeout: 15_000 });
  });

  test('28 — task version conflict shows error', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Resilience tests on mobile-375');
    test.setTimeout(60_000);
    await openOperatorApp(page, { taskStatus: 'IN_PROGRESS' });
    setOperatorVersionConflictOnTaskComplete(true);
    await operatorNavButton(page, 'Aufgaben').click();
    await page.getByRole('button', { name: /Aufgabe öffnen: Fahrzeug reinigen E2E/ }).click();
    await expect(page.getByTestId('task-detail-action-bar')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('task-detail-action-bar').getByRole('button', { name: 'Erledigen' }).click();
    await submitOperatorTaskCompleteDialog(page);
    await expect(page.getByTestId('task-complete-dialog').getByRole('alert')).toContainText(/Version conflict/i);
  });

  test('high latency still loads today view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Resilience tests on mobile-375');
    test.setTimeout(90_000);
    const { setOperatorLatencyMs } = await import('./operator-fixtures');
    setOperatorLatencyMs(300);
    await openOperatorApp(page);
    await expect(page.getByText('Übergaben heute')).toBeVisible({ timeout: 45_000 });
  });

  test('request abort allows retry via reload', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Resilience tests on mobile-375');
    test.setTimeout(90_000);
    const { setOperatorAbortNextRequest } = await import('./operator-fixtures');
    setOperatorAbortNextRequest(true);
    await openOperatorApp(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('operator-shell')).toBeVisible({ timeout: 45_000 });
  });
});
