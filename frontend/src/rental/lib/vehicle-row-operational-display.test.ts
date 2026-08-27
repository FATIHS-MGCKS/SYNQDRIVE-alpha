import { describe, expect, it } from 'vitest';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import type { VehicleData } from '../data/vehicles';
import { dashboardTestVehicle } from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { buildVehicleRuntimeStates } from '../components/dashboard/runtime/vehicleRuntimeStateBuilder';
import { resolveFleetTabCountsFromRuntime } from '../components/dashboard/runtime/runtimeSliceConsistency';
import { buildDashboardRuntimeModel } from '../components/dashboard/runtime/dashboardSliceBuilder';
import {
  applyFleetCommandFilters,
  buildFleetVehicleContexts,
} from './fleet-operator-panel';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import { canonicalAvailability } from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import {
  buildVehicleRowOperationalProjection,
} from './vehicle-row-operational-projection';
import {
  getVehicleRowOperationalDisplay,
  type VehicleRowOperationalDisplaySurface,
} from './vehicle-row-operational-display';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function tDe(key: TranslationKey): string {
  return de[key] ?? key;
}

function tEn(key: TranslationKey): string {
  return en[key] ?? key;
}

function projectionFor(
  vehicle: VehicleData,
  readiness?: { isReadyToRent: boolean; blockingReasonCodes?: string[] },
) {
  return buildVehicleRowOperationalProjection({
    vehicle,
    readiness: readiness ?? null,
    locale: 'de',
  });
}

function displayFor(
  vehicle: VehicleData,
  surface: VehicleRowOperationalDisplaySurface,
  readiness?: { isReadyToRent: boolean; blockingReasonCodes?: string[] },
) {
  return getVehicleRowOperationalDisplay(projectionFor(vehicle, readiness), {
    surface,
    locale: 'de',
    t: tDe,
  });
}

describe('getVehicleRowOperationalDisplay invariants A1-A8', () => {
  it('A1 Fleet Command tab count and row inclusion share business-state authority', () => {
    const fleetVehicles = [
      dashboardTestVehicle({
        id: 'avail-1',
        license: 'AVL 1',
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          reason: null,
          source: null,
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: NOW.toISOString(),
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
          isReliable: true,
        },
      }),
      dashboardTestVehicle({
        id: 'reserved-1',
        license: 'RSV 1',
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
          reason: null,
          source: null,
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: NOW.toISOString(),
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
          isReliable: true,
        },
      }),
    ];

    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles,
      now: NOW,
    });
    const tabCounts = resolveFleetTabCountsFromRuntime(runtime);
    const contexts = buildFleetVehicleContexts(fleetVehicles, () => null, {
      locale: 'de',
      getReadiness: (vehicleId) => {
        const state = runtime.vehicleStates.find((entry) => entry.vehicleId === vehicleId);
        return state
          ? {
              isReadyToRent: state.isReadyToRent,
              blockingReasonCodes: state.blockingReasonCodes,
            }
          : null;
      },
    });

    const availableContexts = applyFleetCommandFilters(contexts, { tab: 'Available' });
    expect(tabCounts.Available).toBe(availableContexts.length);
    expect(availableContexts.every((ctx) => ctx.rowOperationalProjection.businessState === 'AVAILABLE')).toBe(
      true,
    );
  });

  it('A2 Ready-to-Rent section count and row grouping share readiness authority', () => {
    const fleetVehicles = [
      dashboardTestVehicle({ id: 'ready', license: 'READY', cleaningStatus: 'Clean' }),
      dashboardTestVehicle({
        id: 'dirty',
        license: 'DIRTY',
        cleaningStatus: 'Needs Cleaning',
      }),
    ];

    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles,
      now: NOW,
    });
    const slice = runtime.slices['ready-to-rent'];
    const readyRows = slice.rows;
    const notReadyRows = slice.secondaryRows ?? [];

    expect(readyRows.every((row) => {
      const state = runtime.vehicleStates.find((entry) => entry.vehicleId === row.vehicleId);
      return state?.isReadyToRent === true;
    })).toBe(true);

    expect(notReadyRows.every((row) => {
      const state = runtime.vehicleStates.find((entry) => entry.vehicleId === row.vehicleId);
      return state?.isReadyToRent === false;
    })).toBe(true);
  });

  it('A3 readiness=false never renders green readiness-looking Verfügbar on Ready-to-Rent', () => {
    const vehicle = dashboardTestVehicle({
      id: 'not-ready',
      license: 'NOT READY',
      withCanonicalHealth: true,
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      cleaningStatus: 'Needs Cleaning',
    });
  const [runtime] = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle],
      now: NOW,
    });

    const display = displayFor(
      vehicle,
      'ready_to_rent',
      {
        isReadyToRent: runtime?.isReadyToRent ?? false,
        blockingReasonCodes: runtime?.blockingReasonCodes,
      },
    );

    expect(display.primaryRowStatusDimension).toBe('readiness');
    expect(display.primaryRowStatusTone).not.toBe('success');
    expect(display.primaryRowStatusLabel).not.toBe(tDe('fleet.operationalAvailability.available'));
    expect(display.primaryRowStatusLabel).toBe(tDe('fleet.rowProjection.readiness.notReady'));
  });

  it('A4 businessState=AVAILABLE does not imply readiness=true', () => {
    const vehicle = dashboardTestVehicle({
      id: 'avail-not-ready',
      withCanonicalHealth: true,
      cleaningStatus: 'Needs Cleaning',
    });

    const projection = projectionFor(vehicle, { isReadyToRent: false });
    expect(projection.businessState).toBe('AVAILABLE');
    expect(projection.readiness.isReadyToRent).toBe(false);
  });

  it('A5 operationalAvailability=AVAILABLE does not imply readiness=true', () => {
    const vehicle = dashboardTestVehicle({
      id: 'p02-avail-not-ready',
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      cleaningStatus: 'Needs Cleaning',
    });

    const projection = projectionFor(vehicle, { isReadyToRent: false });
    expect(projection.operationalAvailability.state).toBe(OPERATIONAL_AVAILABILITY_STATE.AVAILABLE);
    expect(projection.readiness.isReadyToRent).toBe(false);
  });

  it('A6 Fleet Command business AVAILABLE count may differ from Ready-to-Rent ready count', () => {
    const fleetVehicles = [
      dashboardTestVehicle({ id: 'ready', license: 'READY', cleaningStatus: 'Clean' }),
      dashboardTestVehicle({
        id: 'dirty',
        license: 'DIRTY',
        cleaningStatus: 'Needs Cleaning',
      }),
    ];

    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles,
      now: NOW,
    });
    const tabCounts = resolveFleetTabCountsFromRuntime(runtime);
    const readyCount = runtime.slices['ready-to-rent'].count;

    expect(tabCounts.Available).toBe(2);
    expect(readyCount).toBe(1);
    expect(tabCounts.Available).not.toBe(readyCount);
  });

  it('A7 consumer labels clearly identify different semantic dimensions', () => {
    const vehicle = dashboardTestVehicle({
      id: 'mixed',
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      withCanonicalHealth: true,
    });

    const fleetDisplay = displayFor(vehicle, 'fleet_command', { isReadyToRent: false });
    const readyDisplay = displayFor(vehicle, 'ready_to_rent', { isReadyToRent: false });

    expect(fleetDisplay.primaryRowStatusDimension).toBe('business');
    expect(readyDisplay.primaryRowStatusDimension).toBe('readiness');
    expect(fleetDisplay.business.localizationKey).toBe('fleet.businessState.available');
    expect(fleetDisplay.operational.localizationKey).toBe(
      'fleet.operationalAvailability.needsVerification',
    );
    expect(readyDisplay.readiness.localizationKey).toBe(
      'fleet.operationalAvailability.needsVerification',
    );
  });

  it('A8 no local consumer-specific raw-state translation for cut-over fields', () => {
    const vehicle = dashboardTestVehicle({
      id: 'ctx',
      withCanonicalHealth: true,
    });
    const projection = projectionFor(vehicle, { isReadyToRent: true });
    const display = getVehicleRowOperationalDisplay(projection, {
      surface: 'fleet_command',
      locale: 'en',
      t: tEn,
    });

    expect(display.businessLabel).toBe(tEn('fleet.businessState.available'));
    expect(display.operationalLabel).toBe(tEn('fleet.operationalAvailability.available'));
    expect(display.readinessLabel).toBe(tEn('fleet.rowProjection.readiness.ready'));
  });
});

describe('getVehicleRowOperationalDisplay readiness not-ready mapping', () => {
  it('maps NEEDS_VERIFICATION to operational needsVerification label', () => {
    const vehicle = dashboardTestVehicle({
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
    });
    const display = displayFor(vehicle, 'ready_to_rent', { isReadyToRent: false });
    expect(display.readinessLabel).toBe(tDe('fleet.operationalAvailability.needsVerification'));
    expect(display.readinessTone).toBe('watch');
  });

  it('maps UNAVAILABLE to blocked label', () => {
    const vehicle = dashboardTestVehicle({
      operationalAvailability: canonicalAvailability('UNAVAILABLE'),
    });
    const display = displayFor(vehicle, 'ready_to_rent', { isReadyToRent: false });
    expect(display.readinessLabel).toBe(tDe('fleet.rowProjection.readiness.blocked'));
    expect(display.readinessTone).toBe('critical');
  });

  it('maps ready vehicles to Bereit with success tone', () => {
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true, cleaningStatus: 'Clean' });
    const display = displayFor(vehicle, 'ready_to_rent', { isReadyToRent: true });
    expect(display.readinessLabel).toBe(tDe('fleet.rowProjection.readiness.ready'));
    expect(display.readinessTone).toBe('success');
  });
});

describe('six-vehicle production-shaped display matrix', () => {
  const cases: Array<{
    label: string;
    vehicle: VehicleData;
    readiness?: { isReadyToRent: boolean };
  }> = [
    {
      label: 'KS MX 2024',
      vehicle: dashboardTestVehicle({
        id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
        license: 'KS MX 2024',
        withCanonicalHealth: true,
      }),
      readiness: { isReadyToRent: true },
    },
    {
      label: 'KS MS 661',
      vehicle: dashboardTestVehicle({
        id: '35a33e73-9418-4bdf-9ee4-86cb2a62ad1e',
        license: 'KS MS 661',
        withCanonicalHealth: true,
      }),
      readiness: { isReadyToRent: true },
    },
    {
      label: 'KS FH 660E',
      vehicle: dashboardTestVehicle({
        id: '8db7c1c2-7e9a-4143-bb2f-6a05aed804d3',
        license: 'KS FH 660E',
        withCanonicalHealth: true,
      }),
      readiness: { isReadyToRent: true },
    },
    {
      label: 'HMÜ C 215',
      vehicle: dashboardTestVehicle({
        id: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
        license: 'HMÜ C 215',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      readiness: { isReadyToRent: false },
    },
    {
      label: 'WOB L 7503',
      vehicle: dashboardTestVehicle({
        id: 'wob-l-7503',
        license: 'WOB L 7503',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      readiness: { isReadyToRent: false },
    },
    {
      label: 'WOB L 9755',
      vehicle: dashboardTestVehicle({
        id: 'wob-l-9755',
        license: 'WOB L 9755',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      readiness: { isReadyToRent: false },
    },
  ];

  it.each(cases)('$label matrix row', ({ vehicle, readiness }) => {
    const projection = projectionFor(vehicle, readiness);
    const fleetDisplay = getVehicleRowOperationalDisplay(projection, {
      surface: 'fleet_command',
      locale: 'de',
      t: tDe,
    });
    const readyDisplay = getVehicleRowOperationalDisplay(projection, {
      surface: 'ready_to_rent',
      locale: 'de',
      t: tDe,
    });

    expect(fleetDisplay.primaryRowStatusDimension).toBe('business');
    expect(readyDisplay.primaryRowStatusDimension).toBe('readiness');

    if (readiness?.isReadyToRent) {
      expect(readyDisplay.primaryRowStatusTone).toBe('success');
      expect(readyDisplay.primaryRowStatusLabel).toBe(tDe('fleet.rowProjection.readiness.ready'));
    } else {
      expect(readyDisplay.primaryRowStatusTone).not.toBe('success');
      expect(readyDisplay.primaryRowStatusLabel).not.toBe(tDe('fleet.operationalAvailability.available'));
    }
  });
});
