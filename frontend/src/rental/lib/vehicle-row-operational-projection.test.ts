import { describe, expect, it } from 'vitest';
import type {
  DashboardWarningLightsResponse,
  RentalHealthModule,
  VehicleConnectivityRuntimeState,
  VehicleHealthResponse,
} from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  canonicalHealthEvaluability,
  dashboardTestVehicle,
} from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { buildVehicleRuntimeStates } from '../components/dashboard/runtime/vehicleRuntimeStateBuilder';
import { resolveReasonBadgeFromUi } from './fleet-p1-3-display';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';
import { HEALTH_EVALUABILITY_STATE } from './fleet-health-evaluation/types';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  buildActiveHealthFindings,
  buildVehicleRowOperationalProjection,
} from './vehicle-row-operational-projection';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function mod(
  state: RentalHealthModule['state'],
  reason = '',
  overrides: Partial<RentalHealthModule> = {},
): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: NOW.toISOString(),
    data_stale: false,
    ...overrides,
  };
}

function rentalHealth(
  modules: Partial<VehicleHealthResponse['modules']> = {},
): VehicleHealthResponse {
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'warning',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: mod('good'),
      tires: mod('good'),
      brakes: mod('good'),
      error_codes: mod('good'),
      service_compliance: mod('good'),
      complaints: mod('good'),
      vehicle_alerts: mod('good'),
      ...modules,
    },
    generated_at: NOW.toISOString(),
  };
}

function projectionFor(
  vehicle: VehicleData,
  options: {
    health?: VehicleHealthResponse | null;
    readiness?: { isReadyToRent: boolean; blockingReasonCodes?: string[] };
    dashboardWarningLights?: DashboardWarningLightsResponse | null;
  } = {},
) {
  return buildVehicleRowOperationalProjection({
    vehicle,
    rentalHealth: options.health ?? null,
    readiness: options.readiness ?? null,
    dashboardWarningLights: options.dashboardWarningLights ?? null,
    locale: 'de',
  });
}

describe('buildVehicleRowOperationalProjection fixtures', () => {
  it('A. healthy ready vehicle', () => {
    const vehicle = dashboardTestVehicle({
      id: 'healthy-ready',
      cleaningStatus: 'Clean',
      withCanonicalHealth: true,
    });
    const [runtime] = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle],
      now: NOW,
    });

    const projection = projectionFor(vehicle, {
      health: rentalHealth(),
      readiness: {
        isReadyToRent: runtime?.isReadyToRent ?? false,
      },
    });

    expect(projection.businessState).toBe('AVAILABLE');
    expect(projection.operationalAvailability.state).toBe(OPERATIONAL_AVAILABILITY_STATE.AVAILABLE);
    expect(projection.readiness.isReadyToRent).toBe(true);
    expect(projection.readiness.authorityPresent).toBe(true);
    expect(projection.activeHealthFindings).toHaveLength(0);
  });

  it('B. business AVAILABLE + operationalAvailability AVAILABLE + readiness FALSE remain separate', () => {
    const vehicle = dashboardTestVehicle({
      id: 'avail-not-ready',
      cleaningStatus: 'Dirty',
      withCanonicalHealth: true,
    });

    const projection = projectionFor(vehicle, {
      health: rentalHealth(),
      readiness: { isReadyToRent: false, blockingReasonCodes: ['cleaning:not_clean'] },
    });

    expect(projection.businessState).toBe('AVAILABLE');
    expect(projection.operationalAvailability.state).toBe(OPERATIONAL_AVAILABILITY_STATE.AVAILABLE);
    expect(projection.readiness.isReadyToRent).toBe(false);
    expect(projection.readiness.blockingReasonCodes).toContain('cleaning:not_clean');
  });

  it('C. NEEDS_VERIFICATION vehicle preserves P0.2 state', () => {
    const vehicle = dashboardTestVehicle({
      id: 'needs-verification',
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
    });

    const projection = projectionFor(vehicle, {
      readiness: { isReadyToRent: false, blockingReasonCodes: ['p0.2:needs_verification'] },
    });

    expect(projection.operationalAvailability.state).toBe(
      OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
    );
    expect(projection.operationalAvailability.localizationKey).toBe(
      'fleet.operationalAvailability.needsVerification',
    );
    expect(projection.readiness.isReadyToRent).toBe(false);
  });

  it('D. NOT_EVALUABLE health vehicle', () => {
    const vehicle = dashboardTestVehicle({
      id: 'not-evaluable',
      healthEvaluation: canonicalHealthEvaluability('NOT_EVALUABLE', {
        condition: 'unknown',
      }),
    });

    const projection = projectionFor(vehicle);
    expect(projection.healthEvaluability).toBe(HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE);
    expect(projection.healthCondition.state).toBe('unknown');
  });

  it('E. KS MX 2024-shaped multi-finding vehicle preserves ALL active findings', () => {
    const vehicle = dashboardTestVehicle({
      id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
      license: 'KS MX 2024',
      withCanonicalHealth: true,
    });

    const health = rentalHealth({
      tires: mod('warning', 'Tread estimated below watch threshold'),
      battery: mod('critical', 'Voltage 12.17 V below threshold'),
      brakes: mod('warning', 'Brake wear watch'),
      error_codes: mod('warning', '2 active fault codes'),
      service_compliance: mod('critical', 'Service overdue by 50 days'),
    });

    const dashboardWarningLights: DashboardWarningLightsResponse = {
      vehicleId: vehicle.id,
      provider: 'HIGH_MOBILITY',
      connectionStatus: 'connected',
      supportStatus: 'supported',
      freshness: 'fresh',
      overallStatus: 'warning',
      lastObservedAt: NOW.toISOString(),
      message: 'Active telltales',
      rentalHealthReady: true,
      lights: [
        {
          key: 'tire_pressure',
          label: 'Tire pressure',
          state: 'active',
          severity: 'warning',
          supported: true,
          observedAt: NOW.toISOString(),
          sourceSignal: 'tire_pressure_warning',
          sourceTimestamp: NOW.toISOString(),
          reason: 'Low tire pressure',
          action: 'inspect',
          rentalImpact: 'inspect_before_next_rental',
          isCurrentActive: true,
        },
      ],
    };

    const findings = buildActiveHealthFindings({ rentalHealth: health, dashboardWarningLights });

    expect(findings.map((f) => f.type)).toEqual(
      expect.arrayContaining([
        ACTIVE_HEALTH_FINDING_TYPE.DTC,
        ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
        ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
        ACTIVE_HEALTH_FINDING_TYPE.TIRE,
        ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
        ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      ]),
    );
    expect(findings.length).toBeGreaterThanOrEqual(6);

    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const singleReason = resolveReasonBadgeFromUi(ui, 'warning');
    expect(findings.length).toBeGreaterThan(singleReason ? 1 : 0);
  });

  it('F. no-findings healthy vehicle has zero activeHealthFindings', () => {
    const vehicle = dashboardTestVehicle({ id: 'no-findings', withCanonicalHealth: true });
    const projection = projectionFor(vehicle, { health: rentalHealth() });
    expect(projection.activeHealthFindings).toHaveLength(0);
  });
});

describe('contract invariants C1-C10', () => {
  it('C1 businessState does not overwrite operationalAvailability', () => {
    const vehicle = dashboardTestVehicle({
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
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
    });

    const projection = projectionFor(vehicle);
    expect(projection.businessState).toBe('AVAILABLE');
    expect(projection.operationalAvailability.state).toBe(
      OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
    );
  });

  it('C2 operationalAvailability does not overwrite readiness', () => {
    const vehicle = dashboardTestVehicle({
      operationalAvailability: canonicalAvailability('UNAVAILABLE'),
    });
    const projection = projectionFor(vehicle, {
      readiness: { isReadyToRent: true },
    });
    expect(projection.operationalAvailability.state).toBe(OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE);
    expect(projection.readiness.isReadyToRent).toBe(true);
  });

  it('C3 readiness false preserved when operationalAvailability is AVAILABLE', () => {
    const vehicle = dashboardTestVehicle({
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      withCanonicalHealth: true,
    });
    const projection = projectionFor(vehicle, {
      readiness: { isReadyToRent: false },
    });
    expect(projection.operationalAvailability.state).toBe(OPERATIONAL_AVAILABILITY_STATE.AVAILABLE);
    expect(projection.readiness.isReadyToRent).toBe(false);
  });

  it('C4 connectivity offline does not fabricate health condition', () => {
    const vehicle = dashboardTestVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'OFFLINE',
        telemetryState: 'offline',
        attentionState: 'WATCH',
      }) as VehicleConnectivityRuntimeState,
      healthEvaluation: canonicalHealthEvaluability('NOT_EVALUABLE', { condition: 'unknown' }),
    });

    const projection = projectionFor(vehicle);
    expect(projection.connectivity.overallState).toBe('OFFLINE');
    expect(projection.healthCondition.state).toBe('unknown');
    expect(projection.activeHealthFindings).toHaveLength(0);
  });

  it('C5 health condition does not fabricate readiness', () => {
    const vehicle = dashboardTestVehicle({
      healthEvaluation: canonicalHealthEvaluability('EVALUABLE', { condition: 'critical' }),
      withCanonicalHealth: true,
    });
    const projection = projectionFor(vehicle, {
      readiness: { isReadyToRent: true },
    });
    expect(projection.healthCondition.state).toBe('critical');
    expect(projection.readiness.isReadyToRent).toBe(true);
  });

  it('C6 multiple simultaneous health findings survive normalization', () => {
    const findings = buildActiveHealthFindings({
      rentalHealth: rentalHealth({
        tires: mod('warning', 'watch'),
        battery: mod('warning', 'low'),
        brakes: mod('warning', 'check'),
        error_codes: mod('critical', '3 active fault codes'),
      }),
    });
    expect(findings.length).toBe(4);
    expect(new Set(findings.map((f) => f.type)).size).toBe(4);
  });

  it('C7 no finding produces no placeholder finding', () => {
    const findings = buildActiveHealthFindings({ rentalHealth: rentalHealth() });
    expect(findings).toEqual([]);
  });

  it('C8 finding severity comes from canonical module semantics', () => {
    const findings = buildActiveHealthFindings({
      rentalHealth: rentalHealth({
        service_compliance: mod('critical', 'Service overdue'),
        tires: mod('warning', 'Monitor tread'),
      }),
    });
    const service = findings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.SERVICE);
    const tire = findings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.TIRE);
    expect(service?.severity).toBe('critical');
    expect(tire?.severity).toBe('warning');
  });

  it('C9 rendered localized strings are not machine authority', () => {
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const projection = projectionFor(vehicle, {
      health: rentalHealth({ tires: mod('warning', 'Reifen beobachten') }),
    });
    const tireFinding = projection.activeHealthFindings.find(
      (f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.TIRE,
    );
    expect(tireFinding?.reasonCode).not.toBe('Reifen beobachten');
    expect(tireFinding?.localizationKey).toMatch(/^fleet\.rowFinding\./);
    expect(tireFinding?.reasonCode).toMatch(/^rental_health:tires:/);
  });

  it('C10 activeHealthFindings does not collapse to a single primary reason', () => {
    const health = rentalHealth({
      error_codes: mod('critical', '2 active fault codes'),
      tires: mod('warning', 'Monitor tires'),
      battery: mod('warning', 'Check battery'),
    });

    const findings = buildActiveHealthFindings({ rentalHealth: health });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const singleReason = resolveReasonBadgeFromUi(ui, 'warning');

    expect(findings.length).toBe(3);
    expect(singleReason === null || findings.length > 1).toBe(true);
    expect(findings.some((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC)).toBe(true);
    expect(findings.some((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.TIRE)).toBe(true);
    expect(findings.some((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.BATTERY)).toBe(true);
  });
});

describe('production-shaped vehicle fixtures', () => {
  const cases: Array<{
    label: string;
    vehicle: VehicleData;
    readiness?: { isReadyToRent: boolean };
    assert: (projection: ReturnType<typeof buildVehicleRowOperationalProjection>) => void;
  }> = [
    {
      label: 'KS MX 2024',
      vehicle: dashboardTestVehicle({
        id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
        license: 'KS MX 2024',
        withCanonicalHealth: true,
      }),
      assert: (projection) => {
        expect(projection.businessState).toBe('AVAILABLE');
      },
    },
    {
      label: 'KS MS 661',
      vehicle: dashboardTestVehicle({
        id: '35a33e73-9418-4bdf-9ee4-86cb2a62ad1e',
        license: 'KS MS 661',
        withCanonicalHealth: true,
      }),
      assert: (projection) => {
        expect(projection.operationalAvailability.state).toBe(OPERATIONAL_AVAILABILITY_STATE.AVAILABLE);
      },
    },
    {
      label: 'KS FH 660E',
      vehicle: dashboardTestVehicle({
        id: '8db7c1c2-7e9a-4143-bb2f-6a05aed804d3',
        license: 'KS FH 660E',
        withCanonicalHealth: true,
      }),
      assert: (projection) => {
        expect(projection.businessState).toBe('AVAILABLE');
      },
    },
    {
      label: 'HMÜ C 215',
      vehicle: dashboardTestVehicle({
        id: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
        license: 'HMÜ C 215',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      readiness: { isReadyToRent: false },
      assert: (projection) => {
        expect(projection.operationalAvailability.state).toBe(
          OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION,
        );
        expect(projection.readiness.isReadyToRent).toBe(false);
      },
    },
    {
      label: 'WOB L 7503',
      vehicle: dashboardTestVehicle({
        id: 'wob-l-7503',
        license: 'WOB L 7503',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      readiness: { isReadyToRent: false },
      assert: (projection) => {
        expect(projection.businessState).toBe('AVAILABLE');
        expect(projection.readiness.isReadyToRent).toBe(false);
      },
    },
    {
      label: 'WOB L 9755',
      vehicle: dashboardTestVehicle({
        id: 'wob-l-9755',
        license: 'WOB L 9755',
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      }),
      readiness: { isReadyToRent: false },
      assert: (projection) => {
        expect(projection.operationalAvailability.localizationKey).toBe(
          'fleet.operationalAvailability.needsVerification',
        );
      },
    },
  ];

  it.each(cases)('$label projection shape', ({ vehicle, readiness, assert }) => {
    const projection = projectionFor(vehicle, { readiness });
    assert(projection);
    expect(projection.vehicleId).toBe(vehicle.id);
  });
});

describe('buildFleetVehicleContexts integration', () => {
  it('exposes rowOperationalProjection alongside existing display context', async () => {
    const { buildFleetVehicleContexts } = await import('./fleet-operator-panel');
    const vehicle = dashboardTestVehicle({ id: 'ctx-1', withCanonicalHealth: true });
    const [ctx] = buildFleetVehicleContexts([vehicle], () => rentalHealth(), {
      locale: 'de',
      getReadiness: () => ({ isReadyToRent: false, blockingReasonCodes: ['test:block'] }),
    });

    expect(ctx.uiProjection.vehicleId).toBe('ctx-1');
    expect(ctx.rowOperationalProjection.vehicleId).toBe('ctx-1');
    expect(ctx.rowOperationalProjection.readiness.authorityPresent).toBe(true);
    expect(ctx.rowOperationalProjection.readiness.isReadyToRent).toBe(false);
  });
});
