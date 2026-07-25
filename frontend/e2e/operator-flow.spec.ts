import { expect, test } from '@playwright/test';

import {
  advanceHandoverThroughSignatures,
  BOOKING_PICKUP_ID,
  BOOKING_RETURN_ID,
  openOperatorApp,
  operatorNavButton,
  SCAN_INVALID_QUERY,
  SCAN_VALID_PLATE,
  submitHandover,
  submitOperatorTaskCompleteDialog,
  getPickupAttempts,
  VEHICLE_ID,
} from './operator-fixtures';

test.describe('Operator App E2E — core field flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async (_context, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Serial operator flows run on mobile-375');
  });

  test('1 — operator login and shell access', async ({ page }) => {
    test.setTimeout(120_000);
    await openOperatorApp(page);
    await expect(page.getByText('Operator', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Operator navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Heute' })).toBeVisible();
  });

  test('3 — today view shows pickups and returns', async ({ page }) => {
    await openOperatorApp(page);
    await expect(page.getByText('Übergaben heute')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('VW Golf').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pickup starten' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return starten' }).first()).toBeVisible();
  });

  test('4 — booking deep link opens detail sheet', async ({ page }) => {
    await openOperatorApp(page, { path: `/operator/bookings/${BOOKING_PICKUP_ID}` });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('E2E Kunde').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pickup starten' })).toBeVisible();
  });

  test('5 — vehicle deep link opens quick view', async ({ page }) => {
    await openOperatorApp(page, { path: `/operator/vehicles/${VEHICLE_ID}` });
    await expect(page.getByText(SCAN_VALID_PLATE).first()).toBeVisible({ timeout: 20_000 });
  });

  test('6–14 — pickup handover full flow with review and double submit', async ({ page }) => {
    test.setTimeout(120_000);
    await openOperatorApp(page);
    await page.getByRole('button', { name: 'Pickup starten' }).first().click();
    await advanceHandoverThroughSignatures(page, '15000', 'PICKUP');
    const submit = page.getByTestId('operator-handover-submit');
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click({ clickCount: 2 });
    await expect(page.getByTestId('operator-handover-flow')).toHaveCount(0, { timeout: 45_000 });
    expect(getPickupAttempts()).toBe(1);
    await expect(page.getByRole('button', { name: 'Return starten' }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('7–8 — handover observation draft survives back navigation', async ({ page }) => {
    test.setTimeout(90_000);
    await openOperatorApp(page);
    await page.getByRole('button', { name: 'Pickup starten' }).first().click();
    await expect(page.getByTestId('operator-handover-flow')).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByPlaceholder('z. B. 48500').fill('15000');
    await page.getByText('Technische Beobachtungen').scrollIntoViewIfNeeded();
    await page.getByPlaceholder(/Technische Beobachtung beschreiben|Was ist aufgefallen/i).fill('Reifendruck niedrig E2E');
    await page.getByRole('button', { name: 'Beobachtung hinzufügen' }).click();
    await expect(page.getByText('Reifendruck niedrig E2E')).toBeVisible();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByText('Reifendruck niedrig E2E')).toBeVisible();
  });

  test('15–20 — return handover with new damage note and immutable completion', async ({ page }) => {
    test.setTimeout(120_000);
    await openOperatorApp(page);
    await page.getByRole('button', { name: 'Return starten' }).first().click();
    await advanceHandoverThroughSignatures(page, '15120', 'RETURN');
    await submitHandover(page);
    await expect(page.getByTestId('operator-handover-flow')).toHaveCount(0, { timeout: 20_000 });

    await page.goto(`/operator/bookings/${BOOKING_RETURN_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Pickup starten' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Return starten' })).toBeDisabled();
  });

  test('21 — complete operator task', async ({ page }) => {
    await openOperatorApp(page);
    await operatorNavButton(page, 'Aufgaben').click();
    await page.getByRole('button', { name: 'Starten' }).first().click();
    await page.getByRole('button', { name: /Aufgabe öffnen: Fahrzeug reinigen E2E/ }).click();
    await expect(page.getByTestId('task-detail-action-bar')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('task-detail-action-bar').getByRole('button', { name: 'Erledigen' }).click();
    await submitOperatorTaskCompleteDialog(page);
    await expect(page.getByText('Aufgabe abgeschlossen')).toBeVisible({ timeout: 15_000 });
  });

  test('22 — scan valid plate resolves booking', async ({ page }) => {
    await openOperatorApp(page);
    await page.getByRole('button', { name: 'Scan' }).click();
    await page.getByPlaceholder('Kennzeichen, Fahrzeug oder Buchungs-ID').fill(SCAN_VALID_PLATE);
    await expect(page.getByText(SCAN_VALID_PLATE).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Buchung' })).toBeVisible();
  });

  test('23 — scan invalid query shows empty state', async ({ page }) => {
    await openOperatorApp(page);
    await page.getByRole('button', { name: 'Scan' }).click();
    await page.getByPlaceholder('Kennzeichen, Fahrzeug oder Buchungs-ID').fill(SCAN_INVALID_QUERY);
    await expect(page.getByText('Kein Treffer')).toBeVisible({ timeout: 15_000 });
  });
});
