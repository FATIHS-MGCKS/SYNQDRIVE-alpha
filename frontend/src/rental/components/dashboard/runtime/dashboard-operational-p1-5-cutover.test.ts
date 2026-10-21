/**
 * P1.5 — Dashboard / Fleet Readiness canonical cutover tests.
 */
import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../../../lib/api';
import { buildFleetVehicleUiProjection } from '../../../lib/fleet-vehicle-ui-projection';
import { resolveAvailabilityBadgeFromUi } from '../../../lib/fleet-p1-3-display';
import { VEHICLE_OPERATIONAL_STATUS } from '../../../lib/vehicle-operational-state';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  canonicalOperationalVehicle,
} from './dashboard-canonical-test-fixtures';
import {
  isCanonicalDashboardCriticalAttention,
  isDashboardOperationalAvailabilityReady,
  readDashboardOperationalAvailability,
} from './dashboard-operational-readiness';
import { buildDashboardRuntimeModel } from './dashboardSliceBuilder';
import { buildVehicleRuntimeStates } from './vehicleRuntimeStateBuilder';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function healthEvaluability(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
) {
  return {
    condition: 'good',
    evaluability,
    pipelineAvailability: 'ready',
    generatedAt: NOW.toISOString(),
    healthEvidenceAt: null,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
  };
}

function buildReadyVehicle(overrides: Parameters<typeof canonicalOperationalVehicle>[1] = {}) {
  return canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
    id: overrides.id ?? 'ready-v',
    license: overrides.license ?? 'READY 1',
    ...overrides,
    operationalAvailability:
      overrides.operationalAvailability ?? canonicalAvailability('AVAILABLE'),
    connectivityRuntime:
      overrides.connectivityRuntime ??
      canonicalConnectivityRuntime({
        vehicleId: overrides.id ?? 'ready-v',
        telemetryState: 'live',
        overallState: 'TELEMETRY_ACTIVE',
      }),
  });
}

function runtimeModelFor(vehicles: ReturnType<typeof buildReadyVehicle>[]) {
  return buildDashboardRuntimeModel({
    locale: 'de',
    fleetVehicles: vehicles,
    now: NOW,
  });
}

function readyCount(model: ReturnType<typeof buildDashboardRuntimeModel>) {
  return model.slices['ready-to-rent'].count;
}

describe('P1.5 dashboard operational readiness truth table', () => {
  it('1. business AVAILABLE + operational AVAILABLE + live => ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [buildReadyVehicle()],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('2. business AVAILABLE + operational AVAILABLE + standby => ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          connectivityRuntime: canonicalConnectivityRuntime({
            overallState: 'STANDBY',
            telemetryState: 'standby',
          }),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('3. business AVAILABLE + operational AVAILABLE + SOFT_OFFLINE => ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          connectivityRuntime: canonicalConnectivityRuntime({
            overallState: 'SOFT_OFFLINE',
            telemetryState: 'signal_delayed',
            attentionState: 'WATCH',
          }),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('4. business AVAILABLE + NEEDS_VERIFICATION => not ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
  });

  it('5. business AVAILABLE + UNKNOWN => not ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          operationalAvailability: canonicalAvailability('UNKNOWN'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
  });

  it('6. business AVAILABLE + UNAVAILABLE => not ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          operationalAvailability: canonicalAvailability('UNAVAILABLE'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
  });

  it('7. ACTIVE_RENTED + OFFLINE => remains active rented', () => {
    const model = runtimeModelFor([
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, {
        id: 'rented-offline',
        license: 'RENTED',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'rented-offline',
          overallState: 'OFFLINE',
          telemetryState: 'offline',
        }),
      }),
    ]);
    expect(model.slices['active-rented'].count).toBe(1);
    expect(model.slices['active-rented'].rows[0]?.vehicleId).toBe('rented-offline');
  });

  it('8. ACTIVE_RENTED + AUTHORIZATION_REQUIRED => active rented + attention', () => {
    const runtime = canonicalConnectivityRuntime({
      vehicleId: 'rented-auth',
      overallState: 'AUTHORIZATION_REQUIRED',
      providerLinkState: 'REAUTH_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
    });
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, {
      id: 'rented-auth',
      license: 'AUTH',
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: runtime,
    });
    const model = runtimeModelFor([vehicle]);
    expect(model.slices['active-rented'].count).toBe(1);
    const state = model.vehicleStates[0];
    expect(state?.operationalStatus).toBe('active_rented');
    expect(state?.criticalReasons.some((r) => r.source?.includes('AUTHORIZATION_REQUIRED'))).toBe(true);
  });

  it('9. RESERVED + offline => remains reserved', () => {
    const model = runtimeModelFor([
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.RESERVED, {
        id: 'reserved-offline',
        license: 'RES',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'reserved-offline',
          overallState: 'OFFLINE',
          telemetryState: 'offline',
        }),
      }),
    ]);
    const state = model.vehicleStates[0];
    expect(state?.operationalStatus).toBe('reserved');
    expect(state?.isReadyToRent).toBe(false);
  });

  it('10. MAINTENANCE business state => maintenance bucket', () => {
    const model = runtimeModelFor([
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, {
        id: 'maint',
        license: 'MAINT',
        operationalAvailability: canonicalAvailability('UNAVAILABLE'),
      }),
    ]);
    expect(model.slices['blocked-maintenance'].rows.map((r) => r.vehicleId)).toContain('maint');
  });

  it('11. DEVICE_UNPLUGGED + AVAILABLE business => not maintenance bucket', () => {
    const model = runtimeModelFor([
      buildReadyVehicle({
        id: 'unplugged',
        license: 'UNPLUG',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'unplugged',
          overallState: 'DEVICE_UNPLUGGED',
          physicalDeviceState: 'UNPLUGGED_CONFIRMED',
          attentionState: 'CRITICAL',
        }),
      }),
    ]);
    expect(model.slices['blocked-maintenance'].rows.map((r) => r.vehicleId)).not.toContain('unplugged');
    expect(model.slices['critical-alerts'].rows.map((r) => r.vehicleId)).toContain('unplugged');
  });

  it('12. AUTHORIZATION_REQUIRED + AVAILABLE business => not maintenance bucket', () => {
    const model = runtimeModelFor([
      buildReadyVehicle({
        id: 'auth',
        license: 'AUTH',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'auth',
          overallState: 'AUTHORIZATION_REQUIRED',
          providerLinkState: 'REAUTH_REQUIRED',
          attentionState: 'ACTION_REQUIRED',
        }),
      }),
    ]);
    expect(model.slices['blocked-maintenance'].rows.map((r) => r.vehicleId)).not.toContain('auth');
  });

  it('13. CRITICAL attention => critical alert', () => {
    const model = runtimeModelFor([
      buildReadyVehicle({
        id: 'crit',
        license: 'CRIT',
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'crit',
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
        }),
      }),
    ]);
    expect(model.slices['critical-alerts'].rows.map((r) => r.vehicleId)).toContain('crit');
  });

  it('14. WATCH attention => not critical by default', () => {
    const model = runtimeModelFor([
      buildReadyVehicle({
        id: 'watch',
        license: 'WATCH',
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'watch',
          overallState: 'SOFT_OFFLINE',
          attentionState: 'WATCH',
        }),
      }),
    ]);
    expect(model.slices['critical-alerts'].rows.map((r) => r.vehicleId)).not.toContain('watch');
    expect(model.vehicleStates[0]?.warningReasons.length).toBeGreaterThan(0);
  });

  it('15. PARTIALLY_EVALUABLE health + AVAILABLE => readiness follows P0.2', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          healthEvaluation: healthEvaluability('PARTIALLY_EVALUABLE'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('16. NOT_EVALUABLE health + AVAILABLE => readiness follows P0.2', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          healthEvaluation: healthEvaluability('NOT_EVALUABLE'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('17. legacy ONLINE + canonical NEEDS_VERIFICATION => not ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          onlineStatus: 'ONLINE',
          online: true,
          lastSignal: NOW.toISOString(),
          operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
  });

  it('18. legacy OFFLINE + canonical AVAILABLE => ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          onlineStatus: 'OFFLINE',
          online: false,
          lastSignal: '2010-01-01T00:00:00.000Z',
          signalAgeMs: 999_999_999,
          operationalAvailability: canonicalAvailability('AVAILABLE'),
          connectivityRuntime: canonicalConnectivityRuntime({
            overallState: 'STANDBY',
            telemetryState: 'standby',
          }),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('19. old timestamp + canonical AVAILABLE => ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          lastSignal: '2010-01-01T00:00:00.000Z',
          signalAgeMs: 999_999_999,
          onlineStatus: 'OFFLINE',
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('20. fresh timestamp + canonical UNAVAILABLE => not ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        buildReadyVehicle({
          lastSignal: NOW.toISOString(),
          onlineStatus: 'ONLINE',
          operationalAvailability: canonicalAvailability('UNAVAILABLE'),
        }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
  });
});

describe('P1.5 dashboard count-level regression', () => {
  const mixedFleet = () =>
    runtimeModelFor([
      buildReadyVehicle({ id: 'r1', license: 'R1' }),
      buildReadyVehicle({
        id: 'r2',
        license: 'R2',
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'r2',
          overallState: 'STANDBY',
          telemetryState: 'standby',
        }),
      }),
      buildReadyVehicle({
        id: 'not-ready-verify',
        license: 'NRV',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, {
        id: 'ar1',
        license: 'AR1',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'ar1',
          overallState: 'SOFT_OFFLINE',
          telemetryState: 'signal_delayed',
          attentionState: 'WATCH',
        }),
      }),
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, {
        id: 'maint1',
        license: 'MNT',
        operationalAvailability: canonicalAvailability('UNAVAILABLE'),
      }),
      buildReadyVehicle({
        id: 'crit1',
        license: 'CR1',
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'crit1',
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
        }),
      }),
    ]);

  it('asserts exact Ready to Rent and Active Rented counts', () => {
    const model = mixedFleet();
    expect(readyCount(model)).toBe(3);
    expect(model.slices['ready-to-rent'].rows.length).toBe(3);
    expect(model.slices['active-rented'].count).toBe(1);
    expect(model.slices['blocked-maintenance'].count).toBe(1);
    expect(model.slices['critical-alerts'].count).toBe(2);
  });

  it('legacy timestamp/onlineStatus changes do not alter canonical KPI counts', () => {
    const baseline = mixedFleet();
    const mutated = runtimeModelFor([
      buildReadyVehicle({
        id: 'r1',
        license: 'R1',
        lastSignal: '2000-01-01T00:00:00.000Z',
        onlineStatus: 'OFFLINE',
        signalAgeMs: 999_999_999,
      }),
      buildReadyVehicle({
        id: 'r2',
        license: 'R2',
        lastSignal: '2000-01-01T00:00:00.000Z',
        onlineStatus: 'OFFLINE',
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'r2',
          overallState: 'STANDBY',
          telemetryState: 'standby',
        }),
      }),
      buildReadyVehicle({
        id: 'not-ready-verify',
        license: 'NRV',
        lastSignal: NOW.toISOString(),
        onlineStatus: 'ONLINE',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, {
        id: 'ar1',
        license: 'AR1',
        lastSignal: '2000-01-01T00:00:00.000Z',
        onlineStatus: 'OFFLINE',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'ar1',
          overallState: 'SOFT_OFFLINE',
          telemetryState: 'signal_delayed',
          attentionState: 'WATCH',
        }),
      }),
      canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, {
        id: 'maint1',
        license: 'MNT',
        operationalAvailability: canonicalAvailability('UNAVAILABLE'),
      }),
      buildReadyVehicle({
        id: 'crit1',
        license: 'CR1',
        lastSignal: NOW.toISOString(),
        onlineStatus: 'ONLINE',
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'crit1',
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
        }),
      }),
    ]);

    expect(readyCount(mutated)).toBe(readyCount(baseline));
    expect(mutated.slices['active-rented'].count).toBe(baseline.slices['active-rented'].count);
    expect(mutated.slices['blocked-maintenance'].count).toBe(baseline.slices['blocked-maintenance'].count);
    expect(mutated.slices['critical-alerts'].count).toBe(baseline.slices['critical-alerts'].count);
  });

  it('changing operationalAvailability updates Ready-to-Rent count', () => {
    const before = runtimeModelFor([buildReadyVehicle({ id: 'flip', license: 'FLIP' })]);
    expect(readyCount(before)).toBe(1);

    const after = runtimeModelFor([
      buildReadyVehicle({
        id: 'flip',
        license: 'FLIP',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
    ]);
    expect(readyCount(after)).toBe(0);
  });

  it('click-through ready slice rows match count', () => {
    const model = mixedFleet();
    const slice = model.slices['ready-to-rent'];
    expect(slice.count).toBe(slice.rows.length);
    expect(slice.rows.map((row) => row.vehicleId).sort()).toEqual(['crit1', 'r1', 'r2']);
  });
});

describe('P1.5 cross-surface fleet consistency', () => {
  it('dashboard ready aligns with fleet operational availability badge', () => {
    const vehicle = buildReadyVehicle({ id: 'cross', license: 'CROSS' });
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const badge = resolveAvailabilityBadgeFromUi(ui, vehicle);
    expect(ui.availability.presentation?.state).toBe('AVAILABLE');
    expect(isDashboardOperationalAvailabilityReady(vehicle)).toBe(true);
    expect(readDashboardOperationalAvailability(vehicle)).toBe('AVAILABLE');

    const [state] = buildVehicleRuntimeStates({ fleetVehicles: [vehicle], now: NOW });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('NEEDS_VERIFICATION in fleet list is not counted ready on dashboard', () => {
    const vehicle = buildReadyVehicle({
      id: 'cross-nv',
      license: 'NV',
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
    });
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const badge = resolveAvailabilityBadgeFromUi(ui, vehicle);
    expect(ui.availability.presentation?.state).toBe('NEEDS_VERIFICATION');
    expect(badge.isUnknown).toBe(false);
    const model = runtimeModelFor([vehicle]);
    expect(readyCount(model)).toBe(0);
  });
});

describe('P1.5 canonical attention helpers', () => {
  it('does not treat WATCH alone as critical', () => {
    const vehicle = buildReadyVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        attentionState: 'WATCH',
        overallState: 'SOFT_OFFLINE',
      }),
    });
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    expect(isCanonicalDashboardCriticalAttention(vehicle.connectivityRuntime, ui)).toBe(false);
  });

  it('treats CRITICAL attention as critical', () => {
    const runtime = canonicalConnectivityRuntime({
      attentionState: 'CRITICAL',
      overallState: 'DEVICE_UNPLUGGED',
    });
    const vehicle = buildReadyVehicle({ connectivityRuntime: runtime });
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    expect(isCanonicalDashboardCriticalAttention(runtime, ui)).toBe(true);
  });

  it('does not escalate overallState OFFLINE without canonical critical attention', () => {
    const runtime = canonicalConnectivityRuntime({
      attentionState: 'WATCH',
      overallState: 'OFFLINE',
      telemetryState: 'offline',
    });
    const vehicle = buildReadyVehicle({ connectivityRuntime: runtime });
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    expect(isCanonicalDashboardCriticalAttention(runtime, ui)).toBe(false);
  });
});

describe('P1.5 connectivity vs P0.2 readiness authority (no second state machine)', () => {
  function stateFor(overrides: Parameters<typeof buildReadyVehicle>[0] = {}) {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [buildReadyVehicle(overrides)],
      now: NOW,
    });
    return state;
  }

  it('A. DEVICE_UNPLUGGED + P0.2 AVAILABLE + CRITICAL => READY + critical alert', () => {
    const vehicle = buildReadyVehicle({
      id: 'a',
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'a',
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    const model = runtimeModelFor([vehicle]);
    const state = model.vehicleStates[0];
    expect(state?.isReadyToRent).toBe(true);
    expect(model.slices['ready-to-rent'].rows.map((r) => r.vehicleId)).toContain('a');
    expect(model.slices['critical-alerts'].rows.map((r) => r.vehicleId)).toContain('a');
  });

  it('B. DEVICE_UNPLUGGED + P0.2 UNAVAILABLE => NOT READY (P0.2 authority)', () => {
    const state = stateFor({
      operationalAvailability: canonicalAvailability('UNAVAILABLE'),
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    expect(state?.isReadyToRent).toBe(false);
    expect(
      state?.notReadyReasons.some((r) => r.source === 'canonical:operational-availability:unavailable'),
    ).toBe(true);
  });

  it('C. INTEGRATION_ERROR + P0.2 AVAILABLE => READY + attention may exist', () => {
    const state = stateFor({
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.criticalReasons.some((r) => r.source?.startsWith('canonical:connectivity:'))).toBe(true);
  });

  it('D. INTEGRATION_ERROR + P0.2 NEEDS_VERIFICATION => NOT READY', () => {
    const state = stateFor({
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(state?.isReadyToRent).toBe(false);
    expect(
      state?.notReadyReasons.some((r) => r.source === 'canonical:operational-availability:needs-verification'),
    ).toBe(true);
  });

  it('E. AUTHORIZATION_REQUIRED + P0.2 AVAILABLE => READY', () => {
    const state = stateFor({
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.isBlocked).toBe(false);
  });

  it('F. OFFLINE + P0.2 AVAILABLE => READY', () => {
    const state = stateFor({
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'OFFLINE',
        telemetryState: 'offline',
        attentionState: 'NONE',
      }),
    });
    expect(state?.isReadyToRent).toBe(true);
  });

  it('G. OFFLINE + P0.2 NEEDS_VERIFICATION => NOT READY', () => {
    const state = stateFor({
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'OFFLINE',
        telemetryState: 'offline',
        attentionState: 'WATCH',
      }),
    });
    expect(state?.isReadyToRent).toBe(false);
  });
});

describe('P1.5 canonical attention severity (dashboard alerts)', () => {
  function criticalAlertIds(vehicle: ReturnType<typeof buildReadyVehicle>) {
    return runtimeModelFor([vehicle]).slices['critical-alerts'].rows.map((r) => r.vehicleId);
  }

  function vehicleState(vehicle: ReturnType<typeof buildReadyVehicle>) {
    return runtimeModelFor([vehicle]).vehicleStates[0];
  }

  it('1. AUTHORIZATION_REQUIRED + ACTION_REQUIRED => critical alert', () => {
    const v = buildReadyVehicle({
      id: 'att-1',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-1',
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(criticalAlertIds(v)).toContain('att-1');
  });

  it('2. AUTHORIZATION_REQUIRED + WATCH => warning, NOT critical', () => {
    const v = buildReadyVehicle({
      id: 'att-2',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-2',
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'WATCH',
      }),
    });
    expect(criticalAlertIds(v)).not.toContain('att-2');
    expect(vehicleState(v)?.warningReasons.some((r) => r.source?.startsWith('canonical:connectivity:watch'))).toBe(
      true,
    );
  });

  it('3. AUTHORIZATION_REQUIRED + NONE => NOT critical from overallState alone', () => {
    const v = buildReadyVehicle({
      id: 'att-3',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-3',
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'NONE',
      }),
    });
    expect(criticalAlertIds(v)).not.toContain('att-3');
    expect(isCanonicalDashboardCriticalAttention(v.connectivityRuntime)).toBe(false);
  });

  it('4. OFFLINE + WATCH => warning, not critical', () => {
    const v = buildReadyVehicle({
      id: 'att-4',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-4',
        overallState: 'OFFLINE',
        telemetryState: 'offline',
        attentionState: 'WATCH',
      }),
    });
    expect(criticalAlertIds(v)).not.toContain('att-4');
    expect(vehicleState(v)?.warningReasons.length).toBeGreaterThan(0);
  });

  it('5. OFFLINE + CRITICAL => critical', () => {
    const v = buildReadyVehicle({
      id: 'att-5',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-5',
        overallState: 'OFFLINE',
        telemetryState: 'offline',
        attentionState: 'CRITICAL',
      }),
    });
    expect(criticalAlertIds(v)).toContain('att-5');
  });

  it('6. DEVICE_UNPLUGGED + CRITICAL => critical', () => {
    const v = buildReadyVehicle({
      id: 'att-6',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-6',
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    expect(criticalAlertIds(v)).toContain('att-6');
  });

  it('7. DEVICE_UNPLUGGED + WATCH => warning per canonical attention, not enum escalation', () => {
    const v = buildReadyVehicle({
      id: 'att-7',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-7',
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'WATCH',
      }),
    });
    expect(criticalAlertIds(v)).not.toContain('att-7');
    expect(isCanonicalDashboardCriticalAttention(v.connectivityRuntime)).toBe(false);
    expect(vehicleState(v)?.warningReasons.some((r) => r.source?.startsWith('canonical:connectivity:watch'))).toBe(
      true,
    );
  });

  it('8. INTEGRATION_ERROR + ACTION_REQUIRED => critical', () => {
    const v = buildReadyVehicle({
      id: 'att-8',
      connectivityRuntime: canonicalConnectivityRuntime({
        vehicleId: 'att-8',
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(criticalAlertIds(v)).toContain('att-8');
  });
});

describe('P1.5 blocked/maintenance separation regression', () => {
  it('connectivity attention states do not enter blocked-maintenance', () => {
    const model = runtimeModelFor([
      buildReadyVehicle({
        id: 'auth',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'auth',
          overallState: 'AUTHORIZATION_REQUIRED',
          attentionState: 'ACTION_REQUIRED',
        }),
      }),
      buildReadyVehicle({
        id: 'unplug',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'unplug',
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
        }),
      }),
      buildReadyVehicle({
        id: 'integration',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'integration',
          overallState: 'INTEGRATION_ERROR',
          attentionState: 'ACTION_REQUIRED',
        }),
      }),
      buildReadyVehicle({
        id: 'verify',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
        connectivityRuntime: canonicalConnectivityRuntime({
          vehicleId: 'verify',
          overallState: 'OFFLINE',
          attentionState: 'WATCH',
        }),
      }),
    ]);
    const blocked = model.slices['blocked-maintenance'].rows.map((r) => r.vehicleId);
    expect(blocked).toEqual([]);
  });
});
