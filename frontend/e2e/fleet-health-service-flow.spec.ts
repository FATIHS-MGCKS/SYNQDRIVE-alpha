import { expect, test } from '@playwright/test';

import {
  CASE_BLOCKING,
  CASE_NEW,
  clearServiceCasesError,
  clickFhsKpi,
  clickFhsTab,
  expandVehicleRow,
  fhsHealthDetailRoot,
  getCreatedServiceCaseCount,
  getCreatedTaskCount,
  getHealthFetchCount,
  getServiceCasesFetchCount,
  getTasksFetchCount,
  getVendorsFetchCount,
  openFleetHealthServicePage,
  openHealthDetailForPlate,
  openHealthErrorsForPlate,
  openTechnicalObservationsModal,
  closeTechnicalObservationsModal,
  returnToFleetHealthServiceTab,
  openServiceCaseDrawer,
  resetFleetHealthServiceMockState,
  VEH_CASE,
  VEH_CREATE_TASK,
  VEH_MULTI,
  VEH_OBS,
  VEH_UNKNOWN,
} from './fleet-health-service-fixtures';

test.describe('Fleet Health Service E2E flows', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Fleet health service flow runs on desktop-1280');
  });

  test('1 — opens Zustand & Service tabs and overview', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await expect(page.getByRole('heading', { name: 'Flotte' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Zustand & Service' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Priorisierte Übersicht', { exact: true })).toBeVisible();
    await expect(page.getByText('Kennzahlen')).toBeVisible();
    await expect(page.locator('#fhs-panel-overview')).toBeVisible();
  });

  test('2 — KPI filter navigates to filtered vehicles surface', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await clickFhsKpi(page, /Technisch prüfen/);
    await expect(page).toHaveURL(/fhs=vehicles/);
    await expect(page).toHaveURL(/fhsVf=review/);
    await expect(page.getByRole('tab', { name: 'Fahrzeuge' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('FHS-VEND', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('3 — vehicle with multiple findings shows expanded details', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await expect(page.getByText('FHS-MULTI', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expandVehicleRow(page, VEH_MULTI, 'FHS-MULTI');
    const details = page.getByRole('region', { name: /Details für FHS-MULTI/i });
    await expect(details.getByText('Zustandsbefunde')).toBeVisible();
    await expect(details.locator('span.font-semibold', { hasText: 'Brakes' })).toBeVisible();
    await expect(details.locator('span.font-semibold', { hasText: 'Tires' })).toBeVisible();
    await expect(details.locator('span.font-semibold', { hasText: 'Complaints' })).toBeVisible();
  });

  test('4 — opens health detail from vehicles tab', async ({ page }) => {
    await openFleetHealthServicePage(page);

    const detail = await openHealthDetailForPlate(page, 'FHS-CREATE');
    await expect(detail.getByRole('heading', { name: 'Why this status?' })).toBeVisible();
    await expect(detail.getByText('FHS-CREATE', { exact: true }).first()).toBeVisible();
  });

  test('5 — creates task from finding via overview action', async ({ page }) => {
    await openFleetHealthServicePage(page);

    const createButton = page
      .locator('.space-y-3')
      .filter({ hasText: 'FHS-CREATE' })
      .getByRole('button', { name: 'Aufgabe erstellen' })
      .first();
    await expect(createButton).toBeVisible({ timeout: 15_000 });
    await createButton.click();

    await expect(page.getByRole('dialog', { name: 'Aufgabe erstellen' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('combobox', { name: 'Fahrzeug' })).toBeVisible();
  });

  test('6 — creates service case from technical finding', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await openHealthErrorsForPlate(page, 'FHS-OBS');
    const observationsModal = await openTechnicalObservationsModal(page);
    await expect(observationsModal.getByText('Motorgeräusch E2E')).toBeVisible({ timeout: 15_000 });
    await observationsModal.getByRole('button', { name: 'Service-Aufgabe erstellen' }).click();
    await expect.poll(() => getCreatedServiceCaseCount()).toBe(1);
    await expect(observationsModal.getByText(/Service-Fall:/)).toBeVisible({ timeout: 10_000 });

    await closeTechnicalObservationsModal(page);
    await returnToFleetHealthServiceTab(page);
    await page.getByRole('button', { name: 'Aktualisieren' }).click();
    await expandVehicleRow(page, VEH_OBS, 'FHS-OBS');
    await expect(page.getByText('Motorgeräusch E2E')).toBeVisible({ timeout: 15_000 });
  });

  test('7 — opens service case drawer with linked tasks', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await expandVehicleRow(page, VEH_CASE, 'FHS-CASE');
    await openServiceCaseDrawer(page, 'Bremsenreparatur E2E');
    await expect(page.getByRole('dialog').getByText('Bremsenreparatur E2E')).toBeVisible();
    await expect(page.getByRole('button', { name: /Bremsen prüfen E2E/ })).toBeVisible();
  });

  test('8 — schedule panel shows due dates and workshop appointments', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await clickFhsTab(page, 'Arbeiten');
    await page.locator('#fhs-work-tab-schedule').click();
    const schedulePanel = page.locator('#fhs-work-panel-schedule');
    await expect(schedulePanel).toBeVisible();
    await expect(schedulePanel.getByText('Fälligkeiten', { exact: true }).first()).toBeVisible();
    await expect(schedulePanel.getByText('Überfällige Inspektion E2E')).toBeVisible({ timeout: 15_000 });
    await expect(schedulePanel.getByText('Ersatzteil bestellen E2E')).toBeVisible();
  });

  test('9 — partner errors keep vendors readable and vendor KPI works', async ({ page }) => {
    resetFleetHealthServiceMockState('vendor-stats-error');
    await openFleetHealthServicePage(page, { mode: 'vendor-stats-error' });

    await clickFhsKpi(page, /Wartet Partner/);
    await expect(page).toHaveURL(/fhsTf=waiting-vendor/);
    await expect(page.locator('#fhs-work-panel-tasks')).toBeVisible();
    await expect(
      page.locator('#fhs-work-panel-tasks').getByText('Ersatzteil bestellen E2E').first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.locator('#fhs-work-tab-vendors').click();
    await expect(
      page.locator('#fhs-work-panel-vendors').getByText('Werkstatt Nord E2E').first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(getVendorsFetchCount()).toBeGreaterThan(0);
  });

  test('10 — refresh reloads health, tasks, and service cases', async ({ page }) => {
    resetFleetHealthServiceMockState('service-error');
    await openFleetHealthServicePage(page, { mode: 'service-error' });

    await expect(page.getByText('Priorisierte Übersicht konnte nicht geladen werden')).toBeVisible({
      timeout: 15_000,
    });

    const healthBefore = getHealthFetchCount();
    const tasksBefore = getTasksFetchCount();
    const casesBefore = getServiceCasesFetchCount();

    clearServiceCasesError();
    await page.getByRole('button', { name: 'Erneut laden' }).click();

    await expect(page.getByText('FHS-MULTI', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    expect(getTasksFetchCount()).toBeGreaterThan(tasksBefore);
    expect(getServiceCasesFetchCount()).toBeGreaterThan(casesBefore);

    await page.getByRole('button', { name: 'Aktualisieren' }).click();
    await expect.poll(() => getHealthFetchCount()).toBeGreaterThan(healthBefore);
  });

  test('11 — unknown health surfaces in limited KPI and incomplete section', async ({ page }) => {
    await openFleetHealthServicePage(page);

    await clickFhsKpi(page, /Nicht bewertbar/);
    await expect(page).toHaveURL(/fhsVf=limited/);
    await expect(page.getByText('FHS-UNK', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await clickFhsTab(page, 'Übersicht');
    await expect(page.getByText('Daten unvollständig')).toBeVisible();
    await expandVehicleRow(page, VEH_UNKNOWN, 'FHS-UNK');
    await expect(page.getByRole('button', { name: 'Fahrzeug prüfen' }).first()).toBeVisible();
    await expect(page.getByText('Nicht bewertbar').first()).toBeVisible();
  });

  test('12 — permission denied blocks write actions', async ({ page }) => {
    await openFleetHealthServicePage(page, { readOnly: true, mode: 'permission-denied' });

    const detail = await openHealthDetailForPlate(page, 'FHS-CREATE');
    await detail.getByRole('button', { name: 'Brakes', exact: true }).click();
    await detail.getByRole('button', { name: 'Service-Aufgabe anlegen' }).click();
    await page.getByRole('button', { name: 'Anlegen' }).click();
    await expect(page.getByText(/Keine Berechtigung|konnte nicht/i)).toBeVisible({ timeout: 15_000 });
    expect(getCreatedTaskCount()).toBe(0);
  });
});

test.describe('Fleet Health Service mobile drawer', () => {
  test('13 — service case drawer on mobile viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Mobile drawer test runs on mobile-375');

    await openFleetHealthServicePage(page);
    await expandVehicleRow(page, VEH_CASE, 'FHS-CASE');
    await openServiceCaseDrawer(page, 'Bremsenreparatur E2E');

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Bremsenreparatur E2E')).toBeVisible();
    await drawer.getByRole('button', { name: /Schließen|Close/i }).click();
    await expect(drawer).toHaveCount(0);
  });
});

test.describe('Fleet Health Service legacy deep links', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Deep-link specs run on desktop-1280');
  });

  test('14a — legacy fhs=tasks opens Arbeiten → Aufgaben', async ({ page }) => {
    await openFleetHealthServicePage(page, {
      path: '/rental?fhs=tasks&fhsTf=overdue',
    });

    await expect(page.getByRole('tab', { name: 'Arbeiten' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#fhs-work-panel-tasks')).toBeVisible();
    await expect(page).toHaveURL(/fhs=work/);
    await expect(page).toHaveURL(/fhsWork=tasks/);
    await expect(page).toHaveURL(/fhsTf=overdue/);
    await expect(
      page.locator('#fhs-work-panel-tasks').getByText('Überfällige Inspektion E2E').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('14b — legacy vehicleStatusFilter maps to fhsVf', async ({ page }) => {
    await openFleetHealthServicePage(page, {
      path: '/rental?fhs=overview&vehicleStatusFilter=blocked&fhsCase=blocking',
    });

    await expect(page).toHaveURL(/fhsVf=blocked/);
    await expect(page).toHaveURL(/fhsCase=blocking/);
    await expect(page.getByRole('tab', { name: 'Fahrzeuge' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('FHS-CASE', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('14c — legacy fhs=schedule opens Fälligkeiten', async ({ page }) => {
    await openFleetHealthServicePage(page, {
      path: '/rental?fhs=schedule',
    });

    await expect(page.getByRole('tab', { name: 'Arbeiten' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#fhs-work-panel-schedule')).toBeVisible();
    await expect(page).toHaveURL(/fhsWork=schedule/);
    await expect(
      page.locator('#fhs-work-panel-schedule').getByText('Ersatzteil bestellen E2E').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
