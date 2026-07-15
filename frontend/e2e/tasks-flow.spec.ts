import { expect, test } from '@playwright/test';

import {
  clickTaskAction,
  getCompleteAttempts,
  openCompleteDialog,
  openTaskDetail,
  openTasksPage,
  setFailNextComplete,
  submitCompleteDialog,
  taskActionBar,
  taskCardLocator,
} from './task-fixtures';

test.describe('Task Management E2E flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — global page: buckets, search, URL state, list', async ({ page }) => {
    test.setTimeout(120_000);
    await openTasksPage(page);

    await expect(page.getByRole('heading', { name: 'Aufgaben' })).toBeVisible();
    await expect(page.getByTestId('tasks-view')).toBeVisible();
    await expect(page.getByTestId('tasks-page-views')).toBeVisible();
    await expect(page.getByTestId('tasks-list')).toBeVisible();

    await page.getByRole('tab', { name: /Heute/ }).click();
    await expect(page).toHaveURL(/taskView=today/);
    await expect(taskCardLocator(page, 'Reifen prüfen E2E')).toBeVisible();

    await page.getByRole('tab', { name: /Offen/ }).click();
    await expect(page).not.toHaveURL(/taskView=today/);

    const search = page.getByLabel('Aufgaben suchen');
    await search.fill('Bremsen');
    await expect(taskCardLocator(page, 'Bremsen prüfen E2E')).toBeVisible({ timeout: 10000 });
    await expect(taskCardLocator(page, 'Reifen prüfen E2E')).toHaveCount(0);
    await search.fill('');
  });

  test('2 — task detail sections and linked objects', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Reifen prüfen E2E');

    const detail = page.getByTestId('task-detail-body');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Warum wurde diese Aufgabe erstellt?')).toBeVisible();
    await expect(detail.getByText('Nächster Schritt')).toBeVisible();
    await expect(detail.getByText('Verknüpfte Objekte')).toBeVisible();
    await expect(detail.getByText('M-AB 1234')).toBeVisible({ timeout: 15000 });
    await expect(detail.getByText('BK-E2E-1001')).toBeVisible({ timeout: 15000 });
    await expect(detail.getByText('Technische Details')).toBeVisible();
    await expect(page.getByTestId('task-detail-action-bar-desktop')).toBeVisible();
  });

  test('3 — start open task', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Reifen prüfen E2E');
    await clickTaskAction(page, 'Starten');
    await expect(taskActionBar(page).getByRole('button', { name: 'Erledigen' })).toBeEnabled({ timeout: 15000 });
  });

  test('4 — complete in-progress task via dialog', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Ölwechsel E2E');
    await openCompleteDialog(page);
    await submitCompleteDialog(page);
    await expect(page.getByTestId('task-completion-summary')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Aufgabe abgeschlossen')).toBeVisible();
  });

  test('5 — blocks completion with open required checklist', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Buchung vorbereiten E2E');

    await expect(taskActionBar(page).getByText(/Pflichtpunkt offen/i)).toBeVisible();
    await expect(page.getByTestId('task-detail-body').getByText('Kunde identifizieren', { exact: true })).toBeVisible();
    await openCompleteDialog(page);
    const dialog = page.getByTestId('task-complete-dialog');
    await expect(dialog.getByText('Offene Pflichtpunkte')).toBeVisible();
    await submitCompleteDialog(page);
    await expect(dialog.getByText(/blockieren den Abschluss/i)).toBeVisible();
  });

  test('6 — manager override completes checklist-blocked task', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Buchung vorbereiten E2E');
    await openCompleteDialog(page);

    const dialog = page.getByTestId('task-complete-dialog');
    await dialog.getByRole('checkbox').check();
    await dialog.locator('textarea[placeholder*="Begründung"]').fill('E2E Manager Override');
    await submitCompleteDialog(page);

    await expect(page.getByTestId('task-completion-summary')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Aufgabe abgeschlossen')).toBeVisible();
  });

  test('7 — resolution note required for BRAKE_CHECK', async ({ page }) => {
    await openTasksPage(page);
    await page.getByRole('tab', { name: /Offen/ }).click();
    await openTaskDetail(page, 'Bremsen prüfen E2E');
    await openCompleteDialog(page);

    const dialog = page.getByTestId('task-complete-dialog');
    await expect(dialog.getByText('Abschluss-Code')).toBeVisible();
    await expect(dialog.getByText('Abschluss-Notiz *')).toBeVisible();
    await submitCompleteDialog(page);
    await expect(dialog.getByText('Bitte wählen Sie einen Abschluss-Code.')).toBeVisible();
    await expect(dialog.getByText(/Abschluss-Notiz ist für diesen Aufgabentyp erforderlich/i)).toBeVisible();

    await dialog.locator('select').selectOption('BRAKE_MEASURED_OK');
    await dialog.locator('textarea[placeholder*="Ergebnis"]').fill('Bremsen gemessen, alles in Ordnung.');
    await submitCompleteDialog(page);

    await expect(page.getByTestId('task-completion-summary')).toBeVisible({ timeout: 15000 });
  });

  test('8 — API error surfaces in complete dialog', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Ölwechsel E2E');

    setFailNextComplete();
    await openCompleteDialog(page);
    await submitCompleteDialog(page);

    const dialog = page.getByTestId('task-complete-dialog');
    await expect(dialog.getByRole('alert')).toContainText('Abschluss fehlgeschlagen (E2E)', { timeout: 15000 });
    await expect(dialog).toBeVisible();
  });

  test('9 — double submit does not duplicate complete calls', async ({ page }) => {
    await openTasksPage(page);
    await openTaskDetail(page, 'Ölwechsel E2E');

    await openCompleteDialog(page);
    const dialog = page.getByTestId('task-complete-dialog');
    const submit = dialog.getByRole('button', { name: 'Abschließen' });
    await submit.click();
    await submit.click({ force: true }).catch(() => undefined);
    await expect(page.getByTestId('task-completion-summary')).toBeVisible({ timeout: 15000 });
    expect(getCompleteAttempts()).toBe(1);
  });

  test('10 — completion modes on completed tab', async ({ page }) => {
    await openTasksPage(page);
    await page.getByRole('tab', { name: /Erledigt/ }).click();

    await openTaskDetail(page, 'Manuell erledigt');
    await expect(page.getByTestId('task-completion-summary')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manuell erledigt' })).toBeVisible();
    await expect(page.getByText('Aufgabe abgeschlossen')).toBeVisible();

    await page.getByRole('button', { name: 'Schließen' }).click();
    await openTaskDetail(page, 'Automatisch aufgelöst');
    await expect(page.getByTestId('task-completion-summary')).toContainText('Automatisch aufgelöst');

    await page.getByRole('button', { name: 'Schließen' }).click();
    await openTaskDetail(page, 'Ersetzt durch Nachfolger');
    await expect(page.getByTestId('task-completion-summary')).toContainText('Automatisch beendet');

    await page.getByRole('button', { name: 'Schließen' }).click();
    await openTaskDetail(page, 'Legacy DONE mit offener Checkliste');
    await expect(page.getByRole('heading', { name: 'Legacy DONE mit offener Checkliste' })).toBeVisible();
    await expect(page.getByTestId('task-detail-body').getByText(/älterer Logik/i)).toBeVisible();
  });
});
