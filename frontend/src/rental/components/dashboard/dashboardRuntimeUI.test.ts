import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../../data/vehicles';
import { buildDashboardGroups, collectDrawerRowIds } from './dashboardDrilldownGroups';
import { readyToRentNotReadyRows, resolveReadyForRentingKpiCounts, resolveTodaysOperationsKpiCounts } from './dashboardSliceAccess';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import { buildDashboardRuntimeModel } from './runtime/dashboardSliceBuilder';
import type { DashboardSliceId } from './runtime';

const NOW = new Date('2026-06-24T10:00:00.000Z');
const RUNTIME_SLICE_ORDER: DashboardSliceId[] = [
  'ready-to-rent',
  'active-rented',
  'due-soon',
  'overdue-returns',
  'overdue-pickups',
  'blocked-maintenance',
  'critical-alerts',
];

function hoursAgoIso(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60_000).toISOString();
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? hoursAgoIso(1),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

const testDir = dirname(fileURLToPath(import.meta.url));

describe('dashboard runtime-only UI contracts', () => {
  it('keeps KPI counts aligned with dashboardRuntime.slices', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'blocked', license: 'BLOCKED' }),
        vehicle({ id: 'maintenance', status: 'Maintenance' }),
      ],
      blockedVehicleIds: new Set(['blocked']),
      now: NOW,
    });

    for (const id of RUNTIME_SLICE_ORDER) {
      const slice = runtime.slices[id];
      expect(slice.count).toBe(slice.rows.length);
    }

    expect(runtime.slices['ready-to-rent'].count).toBe(1);
    expect(runtime.slices['blocked-maintenance'].count).toBe(2);
    expect(runtime.slices['blocked-maintenance'].id).toBe('blocked-maintenance');
  });

  it('deduplicates ready-to-rent available-but-not-ready drawer groups', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'offline', license: 'OFFLINE', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    const groups = buildDashboardGroups(slice, 'en');
    const notReadyGroups = groups.filter((group) => group.id === 'available-but-not-ready');

    expect(notReadyGroups).toHaveLength(1);
    expect(notReadyGroups[0]?.title).toBe('Not Ready');
    expect(notReadyGroups[0]?.count).toBe(2);
    expect(collectDrawerRowIds(groups)).toHaveLength(new Set(collectDrawerRowIds(groups)).size);
    expect(slice.secondaryRows).toHaveLength(2);
  });

  it('uses runtime groups for blocked-maintenance and critical-alerts drawers', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'blocked', license: 'BLOCKED' }),
        vehicle({
          id: 'critical',
          license: 'CRITICAL',
          healthStatus: 'Critical Health',
        }),
      ],
      blockedVehicleIds: new Set(['blocked']),
      healthRiskVehicleIds: new Set(['critical']),
      now: NOW,
    });

    const blockedGroups = buildDashboardGroups(runtime.slices['blocked-maintenance'], 'en');
    const criticalGroups = buildDashboardGroups(runtime.slices['critical-alerts'], 'en');

    expect(blockedGroups.length).toBeGreaterThan(0);
    expect(blockedGroups.flatMap((group) => group.rows).map((row) => row.vehicleId)).toContain('blocked');
    expect(criticalGroups.flatMap((group) => group.rows).length).toBe(runtime.slices['critical-alerts'].count);
  });

  it('does not import legacy dashboard drilldown or adapter builders', () => {
    const drawerSrc = readFileSync(resolve(testDir, './DashboardDrilldownDrawer.tsx'), 'utf8');
    const viewModelSrc = readFileSync(resolve(testDir, './useDashboardViewModel.ts'), 'utf8');
    const runtimeIndexSrc = readFileSync(resolve(testDir, './runtime/index.ts'), 'utf8');
    const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');
    const businessPulseSrc = readFileSync(resolve(testDir, './BusinessPulse.tsx'), 'utf8');

    expect(drawerSrc).not.toMatch(/dashboardDrilldownBuilder|dashboardRuntimeViewModelAdapters/);
    expect(viewModelSrc).not.toMatch(/dashboardDrilldownBuilder|dashboardRuntimeViewModelAdapters|buildControlCenterKpis|buildFleetBoard|buildDashboardDrilldown|buildRuntimeControlCenterKpis|buildRuntimeFleetBoard/);
    expect(runtimeIndexSrc).not.toMatch(/dashboardRuntimeViewModelAdapters/);
    expect(dashboardViewSrc).toMatch(/dashboardRuntime=\{vm\.dashboardRuntime\}/);
    expect(dashboardViewSrc).toMatch(/businessPulseSlices=\{vm\.businessPulseSlices\}/);
    expect(businessPulseSrc).toMatch(/businessPulseSlices/);
    expect(existsSync(resolve(testDir, 'dashboardDrilldownBuilder.ts'))).toBe(false);
    expect(existsSync(resolve(testDir, 'runtime/dashboardRuntimeViewModelAdapters.ts'))).toBe(false);
  });

  it('does not wire legacy business/finance builders in the active dashboard path', () => {
    const viewModelSrc = readFileSync(resolve(testDir, './useDashboardViewModel.ts'), 'utf8');
    const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');

    expect(viewModelSrc).not.toMatch(/businessPulseBuilder/);
    expect(viewModelSrc).not.toMatch(/computeMonthlyKpis|buildFinanceKpis|fmtMonthlyEUR|monthlyKpis|financeKpis/);
    expect(viewModelSrc).toMatch(/buildBusinessPulseSlices/);
    expect(dashboardViewSrc).not.toMatch(/BusinessInsightsBox/);
    expect(dashboardViewSrc).toMatch(/businessPulseSlices=\{vm\.businessPulseSlices\}/);
  });

  it('keeps Business Pulse UI free of technical sublines and source labels', () => {
    const businessPulseSrc = readFileSync(resolve(testDir, './BusinessPulse.tsx'), 'utf8');
    const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');
    const shellSrc = readFileSync(resolve(testDir, './dashboardShell.tsx'), 'utf8');

    expect(shellSrc).toMatch(/controlFinanceGrid:[\s\S]*lg:grid-cols-2/);
    expect(shellSrc).toMatch(/controlLeftColumn:[\s\S]*contents[\s\S]*lg:flex/);
    expect(shellSrc).toMatch(/notificationsSlot:[\s\S]*lg:col-start-2/);
    expect(shellSrc).not.toMatch(/lg:row-span-2/);
    expect(shellSrc).toMatch(/financeSlot:[\s\S]*order-3/);
    expect(shellSrc).toMatch(/notificationsPanelScroll/);
    expect(shellSrc).not.toMatch(/notificationsDayPlanGrid:[\s\S]*lg:grid-cols-2/);
    expect(shellSrc).toMatch(/financeKpiGrid:[\s\S]*sm:grid-cols-4/);
    expect(shellSrc).toMatch(/lg:items-start/);
    expect(dashboardViewSrc).toMatch(/useDashboardLeftColumnHeight/);
    expect(dashboardViewSrc).toMatch(/controlLeftColumn/);
    expect(dashboardViewSrc).toMatch(/notificationsMaxHeight/);
    expect(dashboardViewSrc).toMatch(/controlFinanceGrid/);
    expect(dashboardViewSrc).toMatch(/financeSlot/);
    expect(dashboardViewSrc).toMatch(/notificationsSlot/);
    expect(dashboardViewSrc).toMatch(/layout="sidebar"/);
    expect(dashboardViewSrc).toMatch(/<DashboardControlHeader vm=\{vm\}>[\s\S]*<ControlKpiStrip/);
    expect(dashboardViewSrc).not.toMatch(/controlKpiShell/);
    expect(dashboardViewSrc).not.toMatch(/notificationsRow/);
    expect(dashboardViewSrc).not.toMatch(/OperationsSchedulePanel/);
    expect(dashboardViewSrc).not.toMatch(/dayPlanSlot/);
    expect(businessPulseSrc).not.toMatch(/\bh-full\b/);
    expect(businessPulseSrc).toMatch(/dashboard\.financesTitle/);
    expect(businessPulseSrc).toMatch(/dashboard\.openInvoices/);
    expect(businessPulseSrc).toMatch(/financeKpiGrid/);
    expect(shellSrc).toMatch(/financeKpiGrid:[\s\S]*sm:grid-cols-4/);
    expect(businessPulseSrc).not.toMatch(/Slice based|Slice-basiert|Business Pulse ·|Dokumente/);
    expect(businessPulseSrc).not.toMatch(/Einträge|document\$\{/);
    expect(businessPulseSrc).not.toMatch(/Source:|Quelle:/);
    expect(businessPulseSrc).toMatch(/dashboard\.profitHint/);
    expect(businessPulseSrc).not.toMatch(/'expenses'/);
  });

  it('reads not-ready rows from groups only via dashboardSliceAccess', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    const notReady = readyToRentNotReadyRows(slice);
    const groups = buildDashboardGroups(slice, 'en');

    expect(notReady.map((row) => row.vehicleId)).toEqual(['dirty']);
    expect(notReady).toEqual(slice.groups?.find((group) => group.id === 'available-but-not-ready')?.rows);
    expect(groups.filter((group) => group.id === 'available-but-not-ready')).toHaveLength(1);
    expect(collectDrawerRowIds(groups)).toHaveLength(new Set(collectDrawerRowIds(groups)).size);
  });

  it('resolves ready-for-renting KPI counts from runtime slice groups only', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'r1', license: 'R1' }),
        vehicle({ id: 'r2', license: 'R2' }),
        vehicle({ id: 'r3', license: 'R3' }),
        vehicle({ id: 'r4', license: 'R4' }),
        vehicle({ id: 'r5', license: 'R5' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    expect(slice.title).toBe('Ready for Renting');
    expect(resolveReadyForRentingKpiCounts(slice)).toEqual({
      readyCount: 5,
      availableCount: 6,
      notReadyCount: 1,
    });
  });

  it("resolves today's operations KPI counts from runtime slice groups only", () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'rented-a', license: 'RENT-A', status: 'Active Rented' }),
        vehicle({ id: 'rented-b', license: 'RENT-B', status: 'Active Rented' }),
      ],
      pickupItems: [
        {
          bookingId: 'p1',
          time: '09:00',
          vehicle: 'VW Golf',
          plate: 'P1',
          customer: 'A',
          station: 'Zentrale',
          done: false,
          vehicleId: 'pickup-1',
          needsCleaning: false,
          hasAlert: false,
          hasError: false,
          startDate: NOW.toISOString(),
          endDate: NOW.toISOString(),
          isOverdue: false,
          minutesOverdue: 0,
        } satisfies PickupTileItem,
        {
          bookingId: 'p2',
          time: '10:00',
          vehicle: 'VW Polo',
          plate: 'P2',
          customer: 'B',
          station: 'Zentrale',
          done: false,
          vehicleId: 'pickup-2',
          needsCleaning: false,
          hasAlert: false,
          hasError: false,
          startDate: NOW.toISOString(),
          endDate: NOW.toISOString(),
          isOverdue: false,
          minutesOverdue: 0,
        } satisfies PickupTileItem,
      ],
      returnItems: [
        {
          bookingId: 'r1',
          time: '18:00',
          vehicle: 'Audi A4',
          plate: 'R1',
          customer: 'C',
          station: 'Zentrale',
          done: false,
          vehicleId: 'return-1',
          hasError: false,
          kmExceeded: false,
          extraKm: null,
          isOverdue: false,
          returnProtocolStatus: null,
          hasAlert: false,
          startDate: NOW.toISOString(),
          endDate: NOW.toISOString(),
          pickupOdometerKm: null,
        } satisfies ReturnTileItem,
      ],
      now: NOW,
    });

    const slice = runtime.slices['active-rented'];
    expect(slice.title).toBe("Today's Operations");
    expect(resolveTodaysOperationsKpiCounts(slice)).toEqual({
      activeRentalsCount: 2,
      pickupsToday: 2,
      returnsToday: 1,
    });

    const drawerGroups = buildDashboardGroups(slice, 'en');
    expect(drawerGroups.some((group) => group.id === 'pickups-today')).toBe(true);
    expect(drawerGroups.some((group) => group.id === 'returns-today')).toBe(true);
    expect(drawerGroups.find((group) => group.id === 'pickups-today')?.rows).toHaveLength(2);
    expect(drawerGroups.find((group) => group.id === 'returns-today')?.rows).toHaveLength(1);

    const pickupFocused = buildDashboardGroups(slice, 'en', { focusedGroupId: 'pickups-today' });
    expect(pickupFocused).toHaveLength(1);
    expect(pickupFocused[0]?.id).toBe('pickups-today');
    expect(pickupFocused[0]?.rows).toHaveLength(2);

    const activeFocused = buildDashboardGroups(slice, 'en', { focusedGroupId: 'active-rentals' });
    expect(activeFocused.some((group) => group.id === 'pickups-today')).toBe(false);
    expect(activeFocused.some((group) => group.id === 'returns-today')).toBe(false);
    expect(activeFocused.some((group) => group.id === 'on-time')).toBe(true);
  });

  it('shapes pickup drawer rows with time, customer, station, and timing label', () => {
    const pickupAt = new Date(NOW.getTime() + 45 * 60_000).toISOString();
    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'pickup-1', license: 'WOB L 7503' })],
      pickupItems: [
        {
          bookingId: 'booking-uuid-abc123',
          time: '10:45',
          vehicle: 'VW Golf',
          plate: 'WOB L 7503',
          customer: 'Kübra Serin',
          station: 'Zentrale',
          done: false,
          vehicleId: 'pickup-1',
          needsCleaning: false,
          hasAlert: false,
          hasError: false,
          startDate: pickupAt,
          endDate: pickupAt,
          isOverdue: false,
          minutesOverdue: 0,
        } satisfies PickupTileItem,
      ],
      now: NOW,
    });

    const pickupRow = runtime.slices['active-rented'].groups
      ?.find((group) => group.id === 'pickups-today')
      ?.rows[0];

    expect(pickupRow?.title).toMatch(/\d{2}:\d{2} Uhr$/);
    expect(pickupRow?.subtitle).toBe('Kunde: Kübra Serin');
    expect(pickupRow?.bookingRef).toBe('BK-ABC123');
    expect(pickupRow?.meta).toBe('WOB L 7503 · VW Golf');
    expect(pickupRow?.stationLabel).toBe('Zentrale');
    expect(pickupRow?.statusLabel).toBe('In 45 Min.');
    expect(pickupRow?.readinessLabel).toBe('Bereit');
    expect(pickupRow?.readinessTone).toBe('success');
    expect(pickupRow?.bookingId).toBe('booking-uuid-abc123');
    expect(pickupRow?.primaryActionLabel).toBe('Buchung öffnen');
  });

  it('formats overdue pickup timing with Seit prefix and English am/pm time', () => {
    const overdueAt = new Date(NOW.getTime() - (5 * 60 + 17) * 60_000).toISOString();
    const deRuntime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'pickup-1', license: 'WOB L 7503', cleaningStatus: 'Needs Cleaning' })],
      pickupItems: [
        {
          bookingId: 'b-overdue',
          time: '04:43',
          vehicle: 'VW Golf',
          plate: 'WOB L 7503',
          customer: 'Kübra Serin',
          station: 'Zentrale',
          done: false,
          vehicleId: 'pickup-1',
          needsCleaning: true,
          hasAlert: false,
          hasError: false,
          startDate: overdueAt,
          endDate: overdueAt,
          isOverdue: true,
          minutesOverdue: 317,
        } satisfies PickupTileItem,
      ],
      now: NOW,
    });
    const deRow = deRuntime.slices['active-rented'].groups
      ?.find((group) => group.id === 'pickups-today')
      ?.rows[0];
    expect(deRow?.statusLabel).toBe('Seit 5 Std. 17 Min.');
    expect(deRow?.readinessLabel).toBe('Nicht bereit');

    const enRuntime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'pickup-1', license: 'WOB L 7503' })],
      pickupItems: [
        {
          bookingId: 'b-en',
          time: '10:00',
          vehicle: 'VW Golf',
          plate: 'WOB L 7503',
          customer: 'Jane Doe',
          station: 'Central',
          done: false,
          vehicleId: 'pickup-1',
          needsCleaning: false,
          hasAlert: false,
          hasError: false,
          startDate: '2026-06-24T10:00:00.000Z',
          endDate: '2026-06-24T10:00:00.000Z',
          isOverdue: false,
          minutesOverdue: 0,
        } satisfies PickupTileItem,
      ],
      now: NOW,
    });
    const enRow = enRuntime.slices['active-rented'].groups
      ?.find((group) => group.id === 'pickups-today')
      ?.rows[0];
    expect(enRow?.title).toMatch(/10:00\s?(AM|am)/);
    expect(enRow?.subtitle).toBe('Customer: Jane Doe');
  });

  it('prefers booking navigation over vehicle in pickup drawer CTA', () => {
    const drawerSrc = readFileSync(resolve(testDir, './DashboardDrilldownDrawer.tsx'), 'utf8');
    expect(drawerSrc).toMatch(/if \(row\.bookingId && onOpenBooking\) onOpenBooking\(row\.bookingId\)/);
    expect(drawerSrc).not.toMatch(
      /if \(row\.vehicleId && onOpenVehicle\) onOpenVehicle\(row\.vehicleId\);\s*else if \(row\.bookingId && onOpenBooking\)/,
    );
  });

  it('keeps due-soon out of the visible KPI strip order and includes overdue-pickups', () => {
    const stripSrc = readFileSync(resolve(testDir, './ControlKpiStrip.tsx'), 'utf8');

    expect(stripSrc).toContain("const TOP_KPI_ORDER: DashboardSliceId[] = ['ready-to-rent', 'active-rented']");
    expect(stripSrc).toContain("'overdue-pickups'");
    expect(stripSrc).toMatch(
      /const LOWER_KPI_ORDER: DashboardSliceId\[\] = \[\s*'blocked-maintenance',\s*'overdue-returns',\s*'critical-alerts',\s*'overdue-pickups',\s*\]/,
    );
    expect(stripSrc).not.toMatch(/TOP_KPI_ORDER: DashboardSliceId\[\] = \[[^\]]*'due-soon'/);
    expect(stripSrc).not.toMatch(/LOWER_KPI_ORDER: DashboardSliceId\[\] = \[[^\]]*'due-soon'/);
  });
});
