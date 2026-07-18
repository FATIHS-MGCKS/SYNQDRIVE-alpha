import { CleaningStatus, VehicleStatus } from '@prisma/client';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  deriveTelemetryConnectionState,
  projectVehicleRuntimeFlags,
} from './vehicle-runtime-state.resolver';
import type { VehicleRuntimeProjectionInput } from './vehicle-runtime-state.contract';

const EVALUATED_AT = '2026-07-15T12:00:00.000Z';

function runtimeInput(
  overrides: Partial<VehicleRuntimeProjectionInput> = {},
): VehicleRuntimeProjectionInput {
  return {
    vehicleId: 'v1',
    vehicleStatus: VehicleStatus.AVAILABLE,
    cleaningStatus: CleaningStatus.CLEAN,
    operational: {
      token: 'AVAILABLE',
      reason: null,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
      maintenanceReason: null,
    },
    telemetry: {
      lastSignalAt: EVALUATED_AT,
      signalAgeMs: 60_000,
    },
    health: null,
    ...overrides,
  };
}

function health(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  return {
    vehicle_id: 'v1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      tires: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      brakes: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      error_codes: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      service_compliance: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      complaints: { state: 'n_a', reason: '', last_updated_at: null, data_stale: false },
      vehicle_alerts: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
    },
    generated_at: EVALUATED_AT,
    ...overrides,
  };
}

describe('vehicle-runtime-state.resolver', () => {
  it('marks clean available vehicle as ready for renting', () => {
    const flags = projectVehicleRuntimeFlags(runtimeInput(), { evaluatedAt: EVALUATED_AT });
    expect(flags.isReadyForRenting).toBe(true);
    expect(flags.isNotReady).toBe(false);
    expect(flags.isBlockedOrMaintenance).toBe(false);
    expect(flags.isWarning).toBe(false);
  });

  it('keeps dirty available vehicle not-ready without blocking', () => {
    const flags = projectVehicleRuntimeFlags(
      runtimeInput({ cleaningStatus: CleaningStatus.NEEDS_CLEANING }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(flags.isReadyForRenting).toBe(false);
    expect(flags.isNotReady).toBe(true);
    expect(flags.isBlockedOrMaintenance).toBe(false);
    expect(flags.isWarning).toBe(true);
  });

  it('treats maintenance as blocked and not warning-by-default', () => {
    const flags = projectVehicleRuntimeFlags(
      runtimeInput({
        operational: {
          token: 'MAINTENANCE',
          reason: 'SCHEDULED_SERVICE',
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
          isReliable: true,
          maintenanceReason: 'SCHEDULED_SERVICE',
        },
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(flags.isBlockedOrMaintenance).toBe(true);
    expect(flags.isCritical).toBe(true);
    expect(flags.isWarning).toBe(false);
  });

  it('detects compliance blocker separately from generic warning', () => {
    const flags = projectVehicleRuntimeFlags(
      runtimeInput({
        health: health({
          rental_blocked: true,
          blocking_reasons: ['TÜV überfällig'],
          modules: {
            ...health().modules,
            service_compliance: {
              state: 'critical',
              reason: 'TÜV überfällig',
              last_updated_at: EVALUATED_AT,
              data_stale: false,
            },
          },
        }),
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(flags.hasComplianceBlocker).toBe(true);
    expect(flags.isBlockedOrMaintenance).toBe(true);
    expect(flags.isWarning).toBe(false);
  });

  it('counts health warning without treating warning as blocked', () => {
    const flags = projectVehicleRuntimeFlags(
      runtimeInput({
        health: health({
          overall_state: 'warning',
          modules: {
            ...health().modules,
            tires: {
              state: 'warning',
              reason: 'Tread low',
              last_updated_at: EVALUATED_AT,
              data_stale: false,
            },
          },
        }),
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(flags.hasHealthWarning).toBe(true);
    expect(flags.isWarning).toBe(true);
    expect(flags.isBlockedOrMaintenance).toBe(false);
  });

  it('marks telemetry offline as blocker and telemetry-offline KPI', () => {
    const flags = projectVehicleRuntimeFlags(
      runtimeInput({
        telemetry: {
          lastSignalAt: '2026-07-10T12:00:00.000Z',
          signalAgeMs: null,
        },
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(deriveTelemetryConnectionState(
      { lastSignalAt: '2026-07-10T12:00:00.000Z', signalAgeMs: null },
      EVALUATED_AT,
    )).toBe('offline');
    expect(flags.isTelemetryOffline).toBe(true);
    expect(flags.isBlockedOrMaintenance).toBe(true);
  });

  it('returns unknown flags when operational snapshot is missing', () => {
    const flags = projectVehicleRuntimeFlags(
      runtimeInput({ operational: null }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(flags.known).toBe(false);
    expect(flags.isReadyForRenting).toBe(false);
  });
});
