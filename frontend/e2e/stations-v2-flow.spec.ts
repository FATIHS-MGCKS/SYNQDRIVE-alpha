import { expect, test } from '@playwright/test';

import {
  clickStationMenuAction,
  getSummariesFetchCount,
  openStationDetail,
  openStationsListPage,
  openStationsV2Rental,
  stationCardByName,
} from './stations-v2-fixtures';

test.describe('Stations V2 — operative flows', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Stations flow specs run on desktop-1280 only');
  });

  test('1 — list: canonical KPIs, cards, and list toggle', async ({ page }) => {
    await openStationsListPage(page);

    await expect(page.getByText('Aktive Stationen').first()).toBeVisible();
    await expect(page.getByText('Heimatflotte').first()).toBeVisible();
    await expect(page.getByText('Aktuell vor Ort').first()).toBeVisible();
    await expect(page.getByText('Kassel Hauptbahnhof', { exact: true })).toBeVisible();
    await expect(page.getByText('Berlin Mitte', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Listenansicht' }).click();
    await expect(page.getByText('Kassel Hauptbahnhof', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Kartenansicht' }).click();
    await expect(stationCardByName(page, 'Kassel Hauptbahnhof')).toBeVisible();
  });

  test('2 — scope-filtered list shows scoped banner', async ({ page }) => {
    await openStationsListPage(page, { profile: 'scoped' });

    await expect(
      page.getByText('Ergebnisse sind auf Stationen in Ihrem zugewiesenen Scope begrenzt.'),
    ).toBeVisible();
    await expect(page.getByText('Kassel Hauptbahnhof', { exact: true })).toBeVisible();
    await expect(page.getByText('Berlin Mitte', { exact: true })).toHaveCount(0);
  });

  test('3 — overview tab shows canonical on-site and today operations', async ({ page }) => {
    await openStationsListPage(page);
    await openStationDetail(page, 'Kassel Hauptbahnhof', 'overview');

    await expect(page.getByText('Aktuell vor Ort').first()).toBeVisible();
    await expect(page.getByText('Bereit zur Vermietung').first()).toBeVisible();
    await expect(page.getByText('Heutiger Betrieb').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Uebersicht' })).toHaveAttribute('aria-selected', 'true');
  });

  test('4 — fleet tab: groups, search, and paginated fleet read model', async ({ page }) => {
    await openStationsListPage(page, { profile: 'fleet-many' });
    await openStationDetail(page, 'Kassel Hauptbahnhof', 'fleet');

    await expect(page.getByText('Aktuell vor Ort').first()).toBeVisible();
    await expect(page.getByText('KS-BK 001', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Naechste Seite' }).click();
    await expect(page.getByText('KS-BK 011', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Flottenfahrzeuge suchen').fill('KS-BK 002');
    await expect(page.getByText('KS-BK 002', { exact: true }).first()).toBeVisible();
  });

  test('5 — schedule timeline shows booking rule warning chip', async ({ page }) => {
    await openStationsListPage(page);
    await openStationDetail(page, 'Kassel Hauptbahnhof', 'schedule');

    await expect(page.getByText(/KS-ST 101/).first()).toBeVisible();
    await expect(page.getByText('Aktion erforderlich').first()).toBeVisible();
  });

  test('6 — operations tab loads live operations and rules surface', async ({ page }) => {
    await openStationsListPage(page);
    await openStationDetail(page, 'Kassel Hauptbahnhof', 'operations');

    await expect(page.getByText('Live-Betrieb').first()).toBeVisible();
    await expect(page.getByText('Operative Regeln').first()).toBeVisible();
  });

  test('7 — team and activity tabs render membership and audit trail', async ({ page }) => {
    await openStationsListPage(page);
    await openStationDetail(page, 'Kassel Hauptbahnhof', 'team');
    await expect(page.getByText('Stationsteam').first()).toBeVisible();
    await expect(page.getByText('Stations E2E', { exact: true }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Aktivität' }).click();
    await expect(page.getByText('Stationsaktivitaet').first()).toBeVisible();
    await expect(page.getByText('Station aktualisiert').first()).toBeVisible();
  });

  test('8 — create and edit station via form modal', async ({ page }) => {
    await openStationsListPage(page);

    await page.getByRole('button', { name: 'Neue Station' }).click();
    await expect(page.getByRole('heading', { name: 'Neue Station' })).toBeVisible();
    await page.locator('#station-name').fill('Fulda Bahnhof');
    await page.locator('#station-address').fill('Bahnhofstrasse 5');
    await page.locator('#station-city').fill('Fulda');
    await page.locator('#station-postal').fill('36037');
    await page.locator('#station-country').fill('DE');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Fulda Bahnhof', { exact: true })).toBeVisible({ timeout: 15_000 });

    await clickStationMenuAction(page, 'Kassel Hauptbahnhof', 'Bearbeiten');
    await expect(page.getByRole('heading', { name: 'Station bearbeiten' })).toBeVisible();
    await page.locator('#station-name').fill('Kassel Hauptbahnhof Zentrum');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Kassel Hauptbahnhof Zentrum', { exact: true })).toBeVisible();
  });

  test('9 — lifecycle: deactivate and activate station', async ({ page }) => {
    await openStationsListPage(page);
    await clickStationMenuAction(page, 'Berlin Mitte', 'Bearbeiten');
    await page.getByRole('button', { name: 'Station deaktivieren' }).click();
    await expect(page.getByText('Station deaktiviert')).toBeVisible({ timeout: 10_000 });

    await clickStationMenuAction(page, 'Berlin Mitte', 'Bearbeiten');
    await page.getByRole('button', { name: 'Station aktivieren' }).click();
    await expect(page.getByText('Station aktiviert')).toBeVisible({ timeout: 10_000 });
  });

  test('10 — archive and restore from actions menu', async ({ page }) => {
    await openStationsListPage(page);
    await clickStationMenuAction(page, 'Berlin Mitte', 'Archivieren');
    await expect(page.getByText('Station archiviert')).toBeVisible({ timeout: 10_000 });

    await clickStationMenuAction(page, 'Berlin Mitte', 'Station wiederherstellen');
    await expect(page.getByText('Station wiederhergestellt')).toBeVisible({ timeout: 10_000 });
  });

  test('11 — set primary station action', async ({ page }) => {
    await openStationsListPage(page);
    await clickStationMenuAction(page, 'Berlin Mitte', 'Als Hauptstation setzen');
    await expect(page.getByText('Hauptstation gesetzt')).toBeVisible({ timeout: 10_000 });
  });

  test('12 — home assignment workflow', async ({ page }) => {
    await openStationsListPage(page);
    await clickStationMenuAction(page, 'Kassel Hauptbahnhof', 'Heimatstation ändern');
    await expect(page.getByText('KS-ST 101', { exact: true }).first()).toBeVisible();
    await page.getByText('KS-ST 101', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Bestätigen' }).click();
    await expect(page.getByText('Workflow erfolgreich ausgeführt')).toBeVisible({ timeout: 15_000 });
  });

  test('13 — current correction workflow', async ({ page }) => {
    await openStationsListPage(page);
    await clickStationMenuAction(page, 'Kassel Hauptbahnhof', 'Aktuellen Standort korrigieren');
    await page.getByText('KS-ST 101', { exact: true }).first().click();
    await page.locator('select').selectOption({ label: 'Kassel Hauptbahnhof (KAS)' });
    await page.getByLabel('Begründung').fill('E2E Current Correction');
    await page.getByRole('button', { name: 'Vorschau' }).click();
    await page.getByRole('button', { name: 'Bestätigen' }).click();
    await expect(page.getByText('Workflow erfolgreich ausgeführt')).toBeVisible({ timeout: 15_000 });
  });

  test('14 — transfer workflow with paginated vehicle search', async ({ page }) => {
    await openStationsListPage(page, { profile: 'fleet-many' });
    await clickStationMenuAction(page, 'Kassel Hauptbahnhof', 'Transfer planen');
    const workflowDialog = page.getByRole('dialog');
    await workflowDialog.getByRole('button', { name: 'Naechste Seite' }).click();
    await workflowDialog.getByText('KS-BK 026', { exact: true }).click();
    await workflowDialog.locator('select').selectOption({ label: 'Berlin Mitte (BER)' });
    await workflowDialog.getByRole('button', { name: 'Vorschau' }).click();
    await workflowDialog.getByRole('button', { name: 'Bestätigen' }).click();
    await expect(page.getByText('Workflow erfolgreich ausgeführt')).toBeVisible({ timeout: 15_000 });
  });

  test('15 — partial data banner on list', async ({ page }) => {
    await openStationsListPage(page, { profile: 'partial-data' });
    await expect(page.getByText('Unvollstaendige Stationsdaten').first()).toBeVisible();
  });

  test('16 — API error surfaces retry on list reload', async ({ page }) => {
    await openStationsListPage(page, { profile: 'list-error' });
    await expect(page.getByText('Stationsdaten konnten nicht geladen werden').first()).toBeVisible({
      timeout: 15_000,
    });

    const before = getSummariesFetchCount();
    await page.getByRole('button', { name: 'Erneut laden' }).click();
    await expect.poll(() => getSummariesFetchCount()).toBeGreaterThan(before);
    await expect(page.getByText('Kassel Hauptbahnhof', { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('17 — read-only user hides create action', async ({ page }) => {
    await openStationsListPage(page, { profile: 'read-only' });
    await expect(page.getByRole('button', { name: 'Neue Station' })).toHaveCount(0);
    await expect(page.getByText('Kassel Hauptbahnhof', { exact: true })).toBeVisible();
  });

  test('18 — deep link resumes station detail tab from URL', async ({ page }) => {
    await openStationsV2Rental(page, {
      path: '/rental?view=station-detail&stationId=st-v2-kassel&stationTab=fleet',
    });
    await expect(page.getByRole('heading', { name: 'Kassel Hauptbahnhof' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('tab', { name: 'Flotte' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('KS-ST 101', { exact: true }).first()).toBeVisible();
  });
});
