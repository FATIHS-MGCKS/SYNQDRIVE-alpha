import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  DashboardWarningLightsResponse,
  RentalHealthModule,
  VehicleHealthResponse,
} from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  dashboardTestVehicle,
} from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { CompactFleetDrawerVehicleRow } from '../components/dashboard/CompactFleetDrawerVehicleRow';
import { FleetOperatorRow } from '../components/fleet-operator/FleetOperatorRow';
import { LanguageProvider } from '../i18n/LanguageContext';
import { buildFleetVehicleContexts } from './fleet-operator-panel';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  buildVehicleRowOperationalProjection,
} from './vehicle-row-operational-projection';
import {
  composeFleetDashboardWarningLightsAccessor,
  resolveDashboardWarningLightsFromRentalHealth,
} from './vehicle-row-health-consumer';
import {
  isOperationalAttentionReasonCode,
  resolveRowOperationalAttentionBadge,
  shouldSuppressHealthReasonBadge,
} from './vehicle-row-operational-attention';
import { de as deTranslations } from '../i18n/translations/de';
import { en as enTranslations } from '../i18n/translations/en';

vi.mock('../../lib/useAddress', () => ({
  useAddress: () => ({ address: null, loading: false }),
}));

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

function fleetVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return dashboardTestVehicle({
    id: 'veh-1',
    license: 'KS AB 123',
    withCanonicalHealth: true,
    ...overrides,
  });
}

function fleetContext(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null,
  readiness?: { isReadyToRent: boolean },
) {
  const [ctx] = buildFleetVehicleContexts([vehicle], () => health, {
    locale: 'de',
    getReadiness: readiness ? () => readiness : undefined,
  });
  return ctx!;
}

function renderFleetRow(ctx: ReturnType<typeof fleetContext>) {
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(FleetOperatorRow, {
        ctx,
        commandSeverity: 'warning',
        selected: false,
        onClick: () => {},
        onDetailClick: () => {},
        rowRef: () => {},
      }),
    ),
  );
}

function renderDrawerRow(input: {
  vehicle: VehicleData;
  health: VehicleHealthResponse | null;
  runtimeState?: { isReadyToRent: boolean; isCritical?: boolean; isWarning?: boolean };
}) {
  return renderToStaticMarkup(
    createElement(CompactFleetDrawerVehicleRow, {
      row: {
        id: 'row-1',
        vehicleId: input.vehicle.id,
        title: input.vehicle.license,
        subtitle: 'VW Golf',
        severity: 'warning',
      },
      vehicle: input.vehicle,
      health: input.health,
      runtimeState: input.runtimeState
        ? {
            vehicleId: input.vehicle.id,
            license: input.vehicle.license,
            displayName: input.vehicle.license,
            stationLabel: 'Kassel',
            operationalStatus: 'available',
            telemetryState: 'live',
            isReadyToRent: input.runtimeState.isReadyToRent,
            isBlocked: false,
            isCritical: input.runtimeState.isCritical ?? false,
            isWarning: input.runtimeState.isWarning ?? false,
            healthSeverity: 'warning',
            blockLevel: 'none',
            notReadyReasons: [],
          }
        : undefined,
      locale: 'de',
      onClose: () => {},
    }),
  );
}

function tDe(key: keyof typeof deTranslations) {
  return deTranslations[key] ?? key;
}

describe('vehicle-row-health-consumer', () => {
  it('reuses embedded dashboard_warning_lights from rental-health without extra accessor', () => {
    const lights = dashboardLights([]);
    const health = rentalHealth({}, { dashboard_warning_lights: lights });
    expect(resolveDashboardWarningLightsFromRentalHealth(health)).toBe(lights);

    const accessor = composeFleetDashboardWarningLightsAccessor(() => health);
    expect(accessor('veh-1')).toBe(lights);
  });

  it('does not introduce per-row network calls (structural accessor composition)', () => {
    const getHealth = vi.fn(() => rentalHealth({ tires: mod('warning', 'Tire watch') }));
    const accessor = composeFleetDashboardWarningLightsAccessor(getHealth);
    accessor('veh-1');
    accessor('veh-1');
    expect(getHealth).toHaveBeenCalledTimes(2);
  });
});

describe('FleetOperatorRow Stage 3B B1-B4', () => {
  it('B1 — no findings: no icon strip and no health reason text', () => {
    const html = renderFleetRow(fleetContext(fleetVehicle(), rentalHealth()));
    expect(html).not.toContain('role="list"');
    expect(html).not.toContain('Reifen beobachten');
  });

  it('B2 — TIRE warning: tire icon, no duplicate tire text', () => {
    const health = rentalHealth({ tires: mod('warning', 'Monitor tires') });
    const html = renderFleetRow(fleetContext(fleetVehicle(), health));
    expect(html).toContain('Tires — Warning');
    expect(html).not.toContain('Reifen beobachten');
    expect(html).not.toContain('Monitor tires');
  });

  it('B3 — TIRE + BATTERY + DTC all represented', () => {
    const health = rentalHealth({
      tires: mod('warning', 'Monitor tires'),
      battery: mod('warning', 'Battery low'),
      error_codes: mod('warning', '3 active fault codes'),
    });
    const html = renderFleetRow(fleetContext(fleetVehicle(), health));
    expect(html).toContain('Tires — Warning');
    expect(html).toContain('Battery — Warning');
    expect(html).toContain('3 active fault codes — Warning');
  });

  it('B4 — DTC + specific dashboard warning telltale', () => {
    const health = rentalHealth({
      error_codes: mod('warning', '2 active fault codes'),
    });
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
        reason: 'ABS active',
        action: 'inspect',
        rentalImpact: 'inspect_before_next_rental',
        isCurrentActive: true,
      },
    ]);
    const [ctx] = buildFleetVehicleContexts([fleetVehicle()], () => ({
      ...health,
      dashboard_warning_lights: lights,
    }));
    const html = renderFleetRow(ctx!);
    expect(html).toContain('2 active fault codes — Warning');
    expect(html).toContain('Dashboard warning — Warning');
  });
});

describe('CompactFleetDrawerVehicleRow Stage 3B B5-B8', () => {
  it('B5 — no findings: no icon strip', () => {
    const html = renderDrawerRow({
      vehicle: fleetVehicle(),
      health: rentalHealth(),
      runtimeState: { isReadyToRent: true },
    });
    expect(html).not.toContain('role="list"');
  });

  it('B6 — TIRE warning: tire icon, no old tire reason chip', () => {
    const html = renderDrawerRow({
      vehicle: fleetVehicle(),
      health: rentalHealth({ tires: mod('warning', 'Reifen beobachten') }),
      runtimeState: { isReadyToRent: false },
    });
    expect(html).toContain('Reifen — Warnung');
    expect(html).not.toContain('Reifen beobachten');
  });

  it('B7 — multi-finding represented with overflow contract', () => {
    const html = renderDrawerRow({
      vehicle: fleetVehicle(),
      health: rentalHealth({
        tires: mod('warning', 'Reifen beobachten'),
        battery: mod('critical', 'Voltage low'),
        brakes: mod('warning', 'Brake wear'),
        error_codes: mod('warning', '3 active fault codes'),
      }),
      runtimeState: { isReadyToRent: false, isWarning: true },
    });
    expect(html).toContain('Reifen — Warnung');
    expect(html).toContain('Batterie — Kritisch');
    expect(html).toContain('Bremsen — Warnung');
    expect(html).toContain('Fehlercodes — Warnung');
  });

  it('B8 — TIRE + TPMS telltale both represented', () => {
    const health = rentalHealth({ tires: mod('warning', 'Reifen beobachten') });
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
    const html = renderDrawerRow({
      vehicle: fleetVehicle(),
      health: { ...health, dashboard_warning_lights: lights },
      runtimeState: { isReadyToRent: false },
    });
    expect(html).toContain('Reifen — Warnung');
    expect(html).toMatch(/Reifendruck|Tire pressure|Warnleuchte/);
  });
});

describe('operational attention preservation B9-B12', () => {
  it('B9 — health icons + operational attention both preserved', () => {
    const vehicle = fleetVehicle({
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
    const health = rentalHealth({ tires: mod('warning', 'Monitor tires') });
    const html = renderFleetRow(fleetContext(vehicle, health));
    expect(html).toContain('Tires — Warning');
    expect(html).toContain('Connectivity verification required');
  });

  it('B10 — AUTHORIZATION_REQUIRED without health finding', () => {
    const vehicle = fleetVehicle({
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
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth()));
    expect(html).not.toContain('role="listitem"');
    expect(html).toContain('Connectivity verification required');
  });

  it('B11 — DEVICE_UNPLUGGED without health finding', () => {
    const vehicle = fleetVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        reasonCodes: ['DEVICE_UNPLUGGED'],
      }),
    });
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth()));
    expect(html).toContain('Device disconnected');
  });

  it('B12 — INTEGRATION_ERROR without health finding', () => {
    const vehicle = fleetVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'CRITICAL',
        reasonCodes: ['INTEGRATION_ERROR'],
      }),
    });
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth()));
    expect(html).toContain('Integration issue');
  });
});

describe('readiness and business semantics B13-B16', () => {
  it('B13 — readiness=false + health findings do not alter readiness badge', () => {
    const html = renderDrawerRow({
      vehicle: fleetVehicle(),
      health: rentalHealth({ tires: mod('warning', 'Reifen beobachten') }),
      runtimeState: { isReadyToRent: false },
    });
    expect(html).toContain('Nicht bereit');
    expect(html).toContain('Reifen — Warnung');
  });

  it('B14 — business AVAILABLE + health findings do not alter Fleet business badge', () => {
    const html = renderFleetRow(
      fleetContext(
        fleetVehicle({ status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE }),
        rentalHealth({ tires: mod('warning', 'Monitor tires') }),
      ),
    );
    expect(html).toContain('Free');
    expect(html).toContain('Tires — Warning');
  });

  it('B15 — aggregate health GOOD + no findings: good badge, no icons', () => {
    const vehicle = fleetVehicle({
      healthEvaluation: {
        condition: 'good',
        evaluability: 'EVALUABLE',
        pipelineAvailability: 'ready',
        generatedAt: NOW,
        healthEvidenceAt: NOW,
        anyModuleDataStale: false,
        source: 'test',
      },
    });
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth()));
    expect(html).toMatch(/Good|Gut/);
    expect(html).not.toContain('role="list"');
  });

  it('B16 — NOT_EVALUABLE does not fabricate warning/critical finding icons', () => {
    const vehicle = fleetVehicle({
      healthEvaluation: {
        condition: 'unknown',
        evaluability: 'NOT_EVALUABLE',
        pipelineAvailability: 'unavailable',
        generatedAt: NOW,
        healthEvidenceAt: null,
        anyModuleDataStale: false,
        source: 'test',
      },
    });
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth()));
    expect(html).toMatch(/Not evaluable|Nicht bewertbar/);
    expect(html).not.toContain('role="listitem"');
  });
});

describe('KS MX 2024 forensic matrix', () => {
  it('preserves multi-finding icons without single tire text collapse', () => {
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
        reason: 'Low tire pressure',
        action: 'inspect',
        rentalImpact: 'inspect_before_next_rental',
        isCurrentActive: true,
      },
    ]);

    const fleetHtml = renderFleetRow(
      fleetContext(vehicle, { ...health, dashboard_warning_lights: lights }),
    );
    const drawerHtml = renderDrawerRow({
      vehicle,
      health: { ...health, dashboard_warning_lights: lights },
      runtimeState: { isReadyToRent: false, isWarning: true },
    });

    expect(fleetHtml).toContain('Tires — Warning');
    expect(fleetHtml).toContain('Battery — Critical');
    expect(drawerHtml).toContain('role="list"');
    expect(drawerHtml).toContain('Aktive Gesundheitsbefunde');
    for (const html of [fleetHtml, drawerHtml]) {
      expect(html).not.toContain('Reifen beobachten');
      expect(html).not.toContain('Tread estimated');
    }
  });
});

describe('cross-surface fixture matrix', () => {
  const cases = [
    { name: 'healthy ready', modules: {}, readiness: true, expectIcons: false },
    { name: 'tire warning', modules: { tires: mod('warning') }, readiness: false, expectIcons: true },
    { name: 'brake critical', modules: { brakes: mod('critical') }, readiness: false, expectIcons: true },
    { name: 'battery warning', modules: { battery: mod('warning') }, readiness: false, expectIcons: true },
    { name: 'DTC x3', modules: { error_codes: mod('warning', '3 active fault codes') }, readiness: false, expectIcons: true },
    {
      name: 'ABS telltale',
      modules: {},
      lights: dashboardLights([
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
      ]),
      readiness: false,
      expectIcons: true,
    },
    {
      name: 'attention-only AUTHORIZATION_REQUIRED',
      modules: {},
      vehicle: fleetVehicle({
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
      readiness: false,
      expectIcons: false,
      expectAttention: true,
    },
  ] as const;

  for (const testCase of cases) {
    it(`matrix — ${testCase.name}`, () => {
      const vehicle = 'vehicle' in testCase ? testCase.vehicle : fleetVehicle();
      const health = rentalHealth(testCase.modules, {
        dashboard_warning_lights: 'lights' in testCase ? testCase.lights : undefined,
      });
      const projection = buildVehicleRowOperationalProjection({
        vehicle,
        rentalHealth: health,
        dashboardWarningLights: health.dashboard_warning_lights ?? null,
        readiness: { isReadyToRent: testCase.readiness },
        locale: 'de',
      });

      const fleetHtml = renderFleetRow(fleetContext(vehicle, health, { isReadyToRent: testCase.readiness }));
      const drawerHtml = renderDrawerRow({
        vehicle,
        health,
        runtimeState: { isReadyToRent: testCase.readiness },
      });

      const hasIcons = fleetHtml.includes('role="list"');
      expect(hasIcons).toBe(testCase.expectIcons);
      expect(drawerHtml.includes('role="list"')).toBe(testCase.expectIcons);
      expect(projection.activeHealthFindings.length > 0).toBe(testCase.expectIcons);

      if ('expectAttention' in testCase && testCase.expectAttention) {
        expect(fleetHtml).toContain('Connectivity verification required');
        expect(drawerHtml).toContain('Konnektivitätsprüfung erforderlich');
      }
    });
  }
});

describe('vehicle-row-operational-attention helpers', () => {
  it('classifies operational attention codes', () => {
    expect(isOperationalAttentionReasonCode('AUTHORIZATION_REQUIRED')).toBe(true);
    expect(isOperationalAttentionReasonCode('DEVICE_UNPLUGGED')).toBe(true);
    expect(isOperationalAttentionReasonCode('HEALTH_RENTAL_BLOCKED')).toBe(false);
  });

  it('suppresses health reason badge when findings are active (machine domain)', () => {
    expect(
      shouldSuppressHealthReasonBadge(
        {
          text: 'Reifen beobachten',
          tone: 'watch',
          code: 'rental_health:tires',
          domain: 'health',
        },
        [{ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning', reasonCode: 'x', source: 'rental_health', localizationKey: 'fleet.rowFinding.tire.warning' }],
      ),
    ).toBe(true);
  });

  it('resolveRowOperationalAttentionBadge prefers connectivity attention over health reason', () => {
    const projection = buildVehicleRowOperationalProjection({
      vehicle: fleetVehicle({
        connectivityRuntime: canonicalConnectivityRuntime({
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
          reasonCodes: ['DEVICE_UNPLUGGED'],
        }),
      }),
      rentalHealth: rentalHealth({ tires: mod('warning', 'Monitor tires') }),
      locale: 'en',
    });
    const badge = resolveRowOperationalAttentionBadge({
      projection,
      reasonBadge: {
        text: 'Monitor tires',
        tone: 'watch',
        code: 'rental_health:tires',
        domain: 'health',
      },
      t: (key) => enTranslations[key] ?? key,
    });
    expect(badge?.text).toBe('Device disconnected');
  });
});
