import { describe, expect, it } from 'vitest';
import type {
  DashboardWarningLightsResponse,
  RentalHealthModule,
  VehicleHealthResponse,
} from '../../lib/api';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  dashboardTestVehicle,
} from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import { resolveDashboardTelltaleIconSrc } from './dashboard-warning-lights-display';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import tellTaleTirePressureIcon from '../../assets/icons/telltale/tire-pressure.svg';
import vhBrakeIcon from '../../assets/icons/vehicle-health/brake.svg';
import vhMotorFilterIcon from '../../assets/icons/vehicle-health/motor-filter.svg';
import vhCarBatteryIcon from '../../assets/icons/vehicle-health/car-battery.svg';
import {
  aggregateActiveHealthFindingsForDisplay,
  resolveVehicleHealthFindingPresentation,
} from './vehicle-health-finding-presentation';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  buildVehicleRowOperationalProjection,
} from './vehicle-row-operational-projection';
import {
  buildVehicleDetailRowOperationalProjection,
  hasVehicleDetailCanonicalHealthEvaluation,
  resolveVehicleDetailCanonicalHealthDisplay,
} from './vehicle-detail-row-projection';
import { isOperationalAttentionReasonCode } from './fleet-reason-badge-domain';
import { en as enTranslations } from '../i18n/translations/en';

const NOW = '2026-08-26T12:00:00.000Z';

function mod(
  state: RentalHealthModule['state'],
  reason = '',
): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: NOW,
    data_stale: false,
  };
}

function rentalHealth(
  modules: Partial<VehicleHealthResponse['modules']> = {},
  extras: Partial<VehicleHealthResponse> = {},
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
    generated_at: NOW,
    ...extras,
  };
}

function dashboardLights(
  lights: DashboardWarningLightsResponse['lights'],
): DashboardWarningLightsResponse {
  return {
    vehicleId: 'veh-1',
    provider: 'HIGH_MOBILITY',
    connectionStatus: 'connected',
    supportStatus: 'supported',
    freshness: 'fresh',
    overallStatus: 'warning',
    lastObservedAt: NOW,
    message: 'Active telltales',
    rentalHealthReady: true,
    lights,
  };
}

function fleetHealthEvaluation(
  condition: 'good' | 'warning' | 'critical' | 'unknown',
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
) {
  return {
    condition,
    evaluability,
    pipelineAvailability: 'ready' as const,
    generatedAt: NOW,
    healthEvidenceAt: NOW,
    anyModuleDataStale: false,
    source: 'test',
  };
}

function crossSurfaceProjections(
  vehicle: ReturnType<typeof dashboardTestVehicle>,
  health: VehicleHealthResponse | null,
  locale: 'en' | 'de' = 'en',
) {
  const ui = buildFleetVehicleUiProjection(vehicle, { locale });
  const fleetDisplay = resolveFleetVehicleDisplayState(vehicle, {
    rentalHealth: health,
    locale,
    uiProjection: ui,
    t: (key) => enTranslations[key] ?? key,
  });
  const detailProjection = buildVehicleDetailRowOperationalProjection({
    vehicle,
    rentalHealth: health,
    locale,
  });
  const fleetProjection = buildVehicleRowOperationalProjection({
    vehicle,
    rentalHealth: health,
    dashboardWarningLights: health?.dashboard_warning_lights ?? null,
    locale,
    uiProjection: ui,
  });
  const detailHealth = resolveVehicleDetailCanonicalHealthDisplay(vehicle, { locale });
  return { fleetDisplay, detailProjection, fleetProjection, detailHealth };
}

function findingTypes(projection: ReturnType<typeof buildVehicleRowOperationalProjection>) {
  return projection.activeHealthFindings.map((f) => f.type).sort();
}

describe('Vehicle Detail row alignment V1-V16', () => {
  it('V1 — P0.4 GOOD matches Fleet aggregate', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('good', 'EVALUABLE'),
    });
    const { fleetDisplay, detailHealth } = crossSurfaceProjections(vehicle, rentalHealth());
    expect(detailHealth?.status).toBe('good');
    expect(fleetDisplay.healthDisplay.status).toBe('good');
    expect(detailHealth?.label).toBe(fleetDisplay.healthDisplay.label);
  });

  it('V2 — P0.4 WARNING matches Fleet aggregate', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('warning', 'EVALUABLE'),
    });
    const { fleetDisplay, detailHealth } = crossSurfaceProjections(
      vehicle,
      rentalHealth({ tires: mod('warning') }),
    );
    expect(detailHealth?.status).toBe('warning');
    expect(fleetDisplay.healthDisplay.status).toBe('warning');
  });

  it('V3 — P0.4 CRITICAL matches Fleet aggregate', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('critical', 'EVALUABLE'),
    });
    const { fleetDisplay, detailHealth } = crossSurfaceProjections(
      vehicle,
      rentalHealth({ brakes: mod('critical') }),
    );
    expect(detailHealth?.status).toBe('critical');
    expect(fleetDisplay.healthDisplay.status).toBe('critical');
  });

  it('V4 — NOT_EVALUABLE does not show healthy fallback', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('good', 'NOT_EVALUABLE'),
    });
    const { fleetDisplay, detailHealth, detailProjection } = crossSurfaceProjections(
      vehicle,
      rentalHealth({ tires: mod('warning') }),
    );
    expect(detailProjection.healthEvaluability).toBe('NOT_EVALUABLE');
    expect(detailHealth?.status).toBe('unknown');
    expect(detailHealth?.label).not.toMatch(/Good|Gut/i);
    expect(fleetDisplay.healthDisplay.status).toBe('unknown');
    expect(fleetDisplay.healthDisplay.isEvaluable).toBe(false);
  });

  it('V5 — TIRE warning same semantic finding and icon vocabulary', () => {
    const health = rentalHealth({ tires: mod('warning') });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection } = crossSurfaceProjections(vehicle, health);
    const tire = fleetProjection.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.TIRE);
    expect(tire?.severity).toBe('warning');
    const presentation = resolveVehicleHealthFindingPresentation(tire!, { locale: 'en' });
    expect(presentation.iconKind).toBe('vehicle_health_svg');
    expect(presentation.iconSrc).toBe(vhMotorFilterIcon);
  });

  it('V6 — BRAKE critical same semantic finding', () => {
    const health = rentalHealth({ brakes: mod('critical') });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection } = crossSurfaceProjections(vehicle, health);
    const brake = fleetProjection.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.BRAKE);
    expect(brake?.severity).toBe('critical');
    const presentation = resolveVehicleHealthFindingPresentation(brake!, { locale: 'en' });
    expect(presentation.iconSrc).toBe(vhBrakeIcon);
  });

  it('V7 — BATTERY warning same semantic finding', () => {
    const health = rentalHealth({ battery: mod('warning') });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection } = crossSurfaceProjections(vehicle, health);
    const battery = fleetProjection.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.BATTERY);
    expect(battery?.severity).toBe('warning');
    const presentation = resolveVehicleHealthFindingPresentation(battery!, { locale: 'en' });
    expect(presentation.iconSrc).toBe(vhCarBatteryIcon);
  });

  it('V8 — DTC x3 remains DTC domain', () => {
    const health = rentalHealth({ error_codes: mod('warning', '3 active fault codes') });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection } = crossSurfaceProjections(vehicle, health);
    const dtc = fleetProjection.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    expect(dtc).toBeDefined();
    expect(dtc?.count).toBe(3);
    const presentation = resolveVehicleHealthFindingPresentation(dtc!, { locale: 'en' });
    expect(presentation.iconSrc).toBe(tellTaleCelIcon);
    expect(fleetProjection.activeHealthFindings.some((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING)).toBe(
      false,
    );
  });

  it('V9 — ABS telltale uses canonical registry', () => {
    const lights = dashboardLights([
      {
        key: 'abs_warning',
        label: 'ABS',
        state: 'active',
        severity: 'warning',
        supported: true,
        observedAt: NOW,
        sourceSignal: 'abs_warning',
        sourceTimestamp: NOW,
        reason: 'ABS',
        action: 'inspect',
        rentalImpact: 'inspect_before_next_rental',
        isCurrentActive: true,
      },
    ]);
    expect(resolveDashboardTelltaleIconSrc('abs_warning')).toBe(tellTaleCelIcon);
    const health = rentalHealth({}, { dashboard_warning_lights: lights });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection } = crossSurfaceProjections(vehicle, health);
    expect(findingTypes(fleetProjection)).toContain(ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING);
  });

  it('V10 — DTC + ABS both preserved separately', () => {
    const lights = dashboardLights([
      {
        key: 'abs_warning',
        label: 'ABS',
        state: 'active',
        severity: 'warning',
        supported: true,
        observedAt: NOW,
        sourceSignal: 'abs_warning',
        sourceTimestamp: NOW,
        reason: 'ABS',
        action: 'inspect',
        rentalImpact: 'inspect_before_next_rental',
        isCurrentActive: true,
      },
    ]);
    const health = rentalHealth(
      { error_codes: mod('warning', '2 active fault codes') },
      { dashboard_warning_lights: lights },
    );
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection, detailProjection } = crossSurfaceProjections(vehicle, health);
    expect(findingTypes(fleetProjection).sort()).toEqual(findingTypes(detailProjection).sort());
    expect(findingTypes(fleetProjection)).toEqual(
      expect.arrayContaining([ACTIVE_HEALTH_FINDING_TYPE.DTC, ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING]),
    );
  });

  it('V11 — TIRE + TPMS both preserved', () => {
    const lights = dashboardLights([
      {
        key: 'tire_pressure_warning',
        label: 'TPMS',
        state: 'active',
        severity: 'warning',
        supported: true,
        observedAt: NOW,
        sourceSignal: 'tire_pressure_warning',
        sourceTimestamp: NOW,
        reason: 'Low pressure',
        action: 'inspect',
        rentalImpact: 'inspect_before_next_rental',
        isCurrentActive: true,
      },
    ]);
    const health = rentalHealth({ tires: mod('warning') }, { dashboard_warning_lights: lights });
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const { fleetProjection } = crossSurfaceProjections(vehicle, health);
    expect(findingTypes(fleetProjection)).toEqual(
      expect.arrayContaining([ACTIVE_HEALTH_FINDING_TYPE.TIRE, ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING]),
    );
  });

  it('V12 — AUTHORIZATION_REQUIRED is operational attention not health finding', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
        reasonCodes: ['AUTHORIZATION_REQUIRED'],
      }),
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION', {
        attention: 'ACTION_REQUIRED',
        primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
      }),
    });
    const { detailProjection } = crossSurfaceProjections(vehicle, rentalHealth());
    expect(isOperationalAttentionReasonCode(detailProjection.attention.primaryReasonCode)).toBe(true);
    expect(detailProjection.activeHealthFindings).toHaveLength(0);
  });

  it('V13 — DEVICE_UNPLUGGED attention separate from health', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        reasonCodes: ['DEVICE_UNPLUGGED'],
      }),
    });
    const { detailProjection } = crossSurfaceProjections(vehicle, rentalHealth());
    expect(detailProjection.connectivity.overallState).toBe('DEVICE_UNPLUGGED');
    expect(detailProjection.activeHealthFindings).toHaveLength(0);
  });

  it('V14 — PARTIALLY_EVALUABLE does not fabricate missing module health', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('unknown', 'PARTIALLY_EVALUABLE'),
    });
    const { detailProjection, detailHealth } = crossSurfaceProjections(
      vehicle,
      rentalHealth({ tires: mod('good'), brakes: mod('good') }),
    );
    expect(detailProjection.healthEvaluability).toBe('PARTIALLY_EVALUABLE');
    expect(detailHealth?.isEvaluable).toBe(false);
    expect(detailHealth?.status).not.toBe('good');
  });

  it('V15 — KS MX multi-finding same semantic set across surfaces', () => {
    const vehicle = dashboardTestVehicle({
      id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
      license: 'KS MX 2024',
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('warning', 'EVALUABLE'),
    });
    const health = rentalHealth({
      tires: mod('warning', 'Tread estimated below watch threshold'),
      battery: mod('critical', 'Voltage 12.17 V below threshold'),
      brakes: mod('warning', 'Brake wear watch'),
      error_codes: mod('warning', '2 active fault codes'),
      service_compliance: mod('critical', 'Service overdue by 50 days'),
    });
    const lights = dashboardLights([
      {
        key: 'tire_pressure_warning',
        label: 'Tire pressure',
        state: 'active',
        severity: 'warning',
        supported: true,
        observedAt: NOW,
        sourceSignal: 'tire_pressure_warning',
        sourceTimestamp: NOW,
        reason: 'Low pressure',
        action: 'inspect',
        rentalImpact: 'inspect_before_next_rental',
        isCurrentActive: true,
      },
    ]);
    const fullHealth = { ...health, dashboard_warning_lights: lights };
    const { fleetProjection, detailProjection } = crossSurfaceProjections(vehicle, fullHealth);
    expect(findingTypes(fleetProjection).sort()).toEqual(findingTypes(detailProjection).sort());
    expect(fleetProjection.activeHealthFindings.length).toBeGreaterThanOrEqual(5);
    const aggregated = aggregateActiveHealthFindingsForDisplay(fleetProjection.activeHealthFindings, { locale: 'en' });
    expect(aggregated.length).toBeGreaterThanOrEqual(5);
  });

  it('V16 — canonical P0.4 wins over disagreeing Rental Health overall_state', () => {
    const vehicle = dashboardTestVehicle({
      withCanonicalHealth: true,
      healthEvaluation: fleetHealthEvaluation('good', 'EVALUABLE'),
    });
    const disagreeingHealth = rentalHealth({
      tires: mod('critical', 'Should not override P0.4 aggregate'),
      brakes: mod('critical'),
      battery: mod('critical'),
      error_codes: mod('critical'),
      service_compliance: mod('critical'),
    });
    const { fleetDisplay, detailHealth } = crossSurfaceProjections(vehicle, disagreeingHealth);
    expect(detailHealth?.status).toBe('good');
    expect(fleetDisplay.healthDisplay.status).toBe('good');
    expect(hasVehicleDetailCanonicalHealthEvaluation(vehicle)).toBe(true);
  });
});

describe('cross-surface fixture matrix (Stage 4)', () => {
  const cases = [
    { name: 'healthy/evaluable', modules: {}, eval: fleetHealthEvaluation('good', 'EVALUABLE') },
    { name: 'tire warning', modules: { tires: mod('warning') }, eval: fleetHealthEvaluation('warning', 'EVALUABLE') },
    { name: 'NOT_EVALUABLE', modules: {}, eval: fleetHealthEvaluation('good', 'NOT_EVALUABLE') },
    {
      name: 'AUTHORIZATION_REQUIRED only',
      modules: {},
      eval: fleetHealthEvaluation('good', 'EVALUABLE'),
      vehicle: () =>
        dashboardTestVehicle({
          withCanonicalHealth: true,
          connectivityRuntime: canonicalConnectivityRuntime({
            overallState: 'AUTHORIZATION_REQUIRED',
            attentionState: 'ACTION_REQUIRED',
            reasonCodes: ['AUTHORIZATION_REQUIRED'],
          }),
          operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION', {
            attention: 'ACTION_REQUIRED',
            primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
          }),
        }),
    },
  ] as const;

  for (const testCase of cases) {
    it(`matrix — ${testCase.name}`, () => {
      const vehicle =
        'vehicle' in testCase && testCase.vehicle
          ? testCase.vehicle()
          : dashboardTestVehicle({
              withCanonicalHealth: true,
              healthEvaluation: testCase.eval,
            });
      const health = rentalHealth(testCase.modules);
      const { fleetProjection, detailProjection, fleetDisplay, detailHealth } = crossSurfaceProjections(
        vehicle,
        health,
      );
      expect(detailProjection.healthEvaluability).toBe(fleetProjection.healthEvaluability);
      expect(detailProjection.healthCondition.state).toBe(fleetProjection.healthCondition.state);
      expect(detailProjection.operationalAvailability.state).toBe(fleetProjection.operationalAvailability.state);
      expect(findingTypes(detailProjection).sort()).toEqual(findingTypes(fleetProjection).sort());
      if (detailHealth) {
        expect(detailHealth.status).toBe(fleetDisplay.healthDisplay.status);
        expect(detailHealth.label).toBe(fleetDisplay.healthDisplay.label);
      }
    });
  }
});
