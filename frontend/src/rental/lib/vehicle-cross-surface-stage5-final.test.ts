/**
 * Stage 5 — FINAL cross-surface production readiness gate.
 *
 * One canonical fixture matrix (M1–M25) asserted against the shared projection
 * used by Fleet Command / Ready-to-Rent (fleet projection) and Vehicle Detail
 * (detail projection). Same truth — different density only.
 *
 * Additional gates:
 * - S1–S4: no duplicate health text when canonical finding icons render
 * - D1–D5: attention != health != readiness domain independence
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  DashboardWarningLightsResponse,
  RentalHealthModule,
  VehicleHealthResponse,
} from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  dashboardTestVehicle,
} from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { FleetOperatorRow } from '../components/fleet-operator/FleetOperatorRow';
import { CompactFleetDrawerVehicleRow } from '../components/dashboard/CompactFleetDrawerVehicleRow';
import { LanguageProvider } from '../i18n/LanguageContext';
import { buildFleetVehicleContexts } from './fleet-operator-panel';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  buildVehicleRowOperationalProjection,
  type VehicleRowOperationalProjection,
} from './vehicle-row-operational-projection';
import { buildVehicleDetailRowOperationalProjection } from './vehicle-detail-row-projection';
import { resolveVehicleHealthFindingPresentation } from './vehicle-health-finding-presentation';
import { isOperationalAttentionReasonCode } from './fleet-reason-badge-domain';

vi.mock('../../lib/useAddress', () => ({
  useAddress: () => ({ address: null, loading: false }),
}));

const NOW = '2026-08-26T12:00:00.000Z';

function mod(state: RentalHealthModule['state'], reason = ''): RentalHealthModule {
  return { state, reason, last_updated_at: NOW, data_stale: false };
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

function telltale(
  key: string,
  severity: 'warning' | 'critical' = 'warning',
): DashboardWarningLightsResponse['lights'][number] {
  return {
    key,
    label: key,
    state: 'active',
    severity,
    supported: true,
    observedAt: NOW,
    sourceSignal: key,
    sourceTimestamp: NOW,
    reason: key,
    action: 'inspect',
    rentalImpact: 'inspect_before_next_rental',
    isCurrentActive: true,
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

function healthEvaluation(
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

interface MatrixSurfaces {
  fleet: VehicleRowOperationalProjection;
  detail: VehicleRowOperationalProjection;
}

/** Build all three surfaces from ONE fixture (Ready-to-Rent shares the fleet projection). */
function surfaces(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null,
  readiness?: { isReadyToRent: boolean; blockingReasonCodes?: string[] } | null,
): MatrixSurfaces {
  const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'en' });
  const fleet = buildVehicleRowOperationalProjection({
    vehicle,
    uiProjection: ui,
    rentalHealth: health,
    readiness: readiness ?? null,
    dashboardWarningLights: health?.dashboard_warning_lights ?? null,
    locale: 'en',
  });
  const detail = buildVehicleDetailRowOperationalProjection({
    vehicle,
    rentalHealth: health,
    locale: 'en',
  });
  return { fleet, detail };
}

function findingTypes(p: VehicleRowOperationalProjection): string[] {
  return p.activeHealthFindings.map((f) => f.type).sort();
}

/** Cross-surface agreement: same canonical dimensions, no reinterpretation. */
function expectSurfacesAgree({ fleet, detail }: MatrixSurfaces) {
  expect(detail.businessState).toBe(fleet.businessState);
  expect(detail.operationalAvailability.state).toBe(fleet.operationalAvailability.state);
  expect(detail.healthEvaluability).toBe(fleet.healthEvaluability);
  expect(detail.healthCondition.state).toBe(fleet.healthCondition.state);
  expect(findingTypes(detail)).toEqual(findingTypes(fleet));
  expect(detail.attention.state).toBe(fleet.attention.state);
  expect(detail.attention.primaryReasonCode).toBe(fleet.attention.primaryReasonCode);
}

describe('Stage 5 final fixture matrix M1-M25', () => {
  it('M1 — healthy / evaluable / ready', () => {
    const s = surfaces(
      dashboardTestVehicle({ withCanonicalHealth: true }),
      rentalHealth({}, { overall_state: 'good' }),
      { isReadyToRent: true },
    );
    expectSurfacesAgree(s);
    expect(s.fleet.businessState).toBe('AVAILABLE');
    expect(s.fleet.operationalAvailability.state).toBe('AVAILABLE');
    expect(s.fleet.readiness.isReadyToRent).toBe(true);
    expect(s.fleet.healthEvaluability).toBe('EVALUABLE');
    expect(s.fleet.healthCondition.state).toBe('good');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
    expect(s.fleet.attention.primaryReasonCode).toBeNull();
  });

  it('M2 — business AVAILABLE + readiness false stay independent', () => {
    const s = surfaces(
      dashboardTestVehicle({ withCanonicalHealth: true }),
      rentalHealth({}, { overall_state: 'good' }),
      { isReadyToRent: false, blockingReasonCodes: ['CHECKLIST_INCOMPLETE'] },
    );
    expectSurfacesAgree(s);
    expect(s.fleet.businessState).toBe('AVAILABLE');
    expect(s.fleet.readiness.isReadyToRent).toBe(false);
    expect(s.fleet.readiness.authorityPresent).toBe(true);
    expect(s.fleet.healthCondition.state).toBe('good');
  });

  it('M3 — operationalAvailability AVAILABLE + readiness false stay independent', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        operationalAvailability: canonicalAvailability('AVAILABLE'),
      }),
      rentalHealth({}, { overall_state: 'good' }),
      { isReadyToRent: false },
    );
    expectSurfacesAgree(s);
    expect(s.fleet.operationalAvailability.state).toBe('AVAILABLE');
    expect(s.fleet.readiness.isReadyToRent).toBe(false);
  });

  it('M4 — NEEDS_VERIFICATION availability', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION', {
          attention: 'ACTION_REQUIRED',
          primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
        }),
      }),
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.operationalAvailability.state).toBe('NEEDS_VERIFICATION');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M5 — UNAVAILABLE availability', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        operationalAvailability: canonicalAvailability('UNAVAILABLE', {
          primaryReason: 'MANUAL_BLOCK',
        }),
      }),
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.operationalAvailability.state).toBe('UNAVAILABLE');
  });

  it('M6 — TIRE warning finding', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('warning', 'EVALUABLE'),
      }),
      rentalHealth({ tires: mod('warning', 'Tread low') }),
    );
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([ACTIVE_HEALTH_FINDING_TYPE.TIRE]);
    expect(s.fleet.activeHealthFindings[0]!.severity).toBe('warning');
  });

  it('M7 — BRAKE critical finding', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('critical', 'EVALUABLE'),
      }),
      rentalHealth({ brakes: mod('critical', 'Pads worn') }, { overall_state: 'critical' }),
    );
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([ACTIVE_HEALTH_FINDING_TYPE.BRAKE]);
    expect(s.fleet.activeHealthFindings[0]!.severity).toBe('critical');
  });

  it('M8 — BATTERY warning finding', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('warning', 'EVALUABLE'),
      }),
      rentalHealth({ battery: mod('warning', 'Voltage low') }),
    );
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([ACTIVE_HEALTH_FINDING_TYPE.BATTERY]);
  });

  it('M9 — DTC x3 preserves count', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('warning', 'EVALUABLE'),
      }),
      rentalHealth({ error_codes: mod('warning', '3 active fault codes') }),
    );
    expectSurfacesAgree(s);
    const dtc = s.fleet.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    expect(dtc?.count).toBe(3);
    const detailDtc = s.detail.activeHealthFindings.find(
      (f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC,
    );
    expect(detailDtc?.count).toBe(3);
  });

  it('M10 — known check-engine telltale uses CEL vocabulary as DASHBOARD_WARNING', () => {
    const health = rentalHealth(
      {},
      { dashboard_warning_lights: dashboardLights([telltale('check_engine_light')]) },
    );
    const s = surfaces(dashboardTestVehicle({ withCanonicalHealth: true }), health);
    expectSurfacesAgree(s);
    const finding = s.fleet.activeHealthFindings.find(
      (f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );
    expect(finding?.metadata?.telltaleKey).toBe('check_engine_light');
    const presentation = resolveVehicleHealthFindingPresentation(finding!, { locale: 'en' });
    expect(presentation.iconSrc).toBe(tellTaleCelIcon);
    expect(presentation.findingType).toBe(ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING);
  });

  it('M11 — unknown dashboard telltale uses generic fallback, never CEL', () => {
    const health = rentalHealth(
      {},
      { dashboard_warning_lights: dashboardLights([telltale('esc_warning')]) },
    );
    const s = surfaces(dashboardTestVehicle({ withCanonicalHealth: true }), health);
    expectSurfacesAgree(s);
    const finding = s.fleet.activeHealthFindings.find(
      (f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );
    const presentation = resolveVehicleHealthFindingPresentation(finding!, { locale: 'en' });
    expect(presentation.iconKind).toBe('lucide');
    expect(presentation.lucideIconName).toBe('alert-triangle');
    expect(presentation.iconSrc).not.toBe(tellTaleCelIcon);
  });

  it('M12 — DTC + unknown telltale remain two findings with distinct icon identities', () => {
    const health = rentalHealth(
      { error_codes: mod('warning', '2 active fault codes') },
      { dashboard_warning_lights: dashboardLights([telltale('abs_warning')]) },
    );
    const s = surfaces(dashboardTestVehicle({ withCanonicalHealth: true }), health);
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([
      ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      ACTIVE_HEALTH_FINDING_TYPE.DTC,
    ]);
    const dtc = s.fleet.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    const warn = s.fleet.activeHealthFindings.find(
      (f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );
    const dtcPres = resolveVehicleHealthFindingPresentation(dtc!, { locale: 'en' });
    const warnPres = resolveVehicleHealthFindingPresentation(warn!, { locale: 'en' });
    expect(dtcPres.iconSrc).toBe(tellTaleCelIcon);
    expect(warnPres.iconKind).toBe('lucide');
    expect(warnPres.lucideIconName).toBe('alert-triangle');
  });

  it('M13 — DTC + check-engine telltale: shared CEL vocabulary, distinct findings', () => {
    const health = rentalHealth(
      { error_codes: mod('warning', '2 active fault codes') },
      { dashboard_warning_lights: dashboardLights([telltale('check_engine_light')]) },
    );
    const s = surfaces(dashboardTestVehicle({ withCanonicalHealth: true }), health);
    expectSurfacesAgree(s);
    expect(s.fleet.activeHealthFindings).toHaveLength(2);
    const dtc = s.fleet.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    const cel = s.fleet.activeHealthFindings.find(
      (f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );
    expect(dtc).toBeDefined();
    expect(cel).toBeDefined();
    expect(dtc!.reasonCode).not.toBe(cel!.reasonCode);
  });

  it('M14 — TIRE + TPMS both preserved (no cross-domain dedupe)', () => {
    const health = rentalHealth(
      { tires: mod('warning', 'Tread low') },
      { dashboard_warning_lights: dashboardLights([telltale('tire_pressure_warning')]) },
    );
    const s = surfaces(dashboardTestVehicle({ withCanonicalHealth: true }), health);
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([
      ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      ACTIVE_HEALTH_FINDING_TYPE.TIRE,
    ]);
  });

  it('M15 — BATTERY + battery telltale both preserved', () => {
    const health = rentalHealth(
      { battery: mod('warning', 'Voltage low') },
      { dashboard_warning_lights: dashboardLights([telltale('battery_warning_light')]) },
    );
    const s = surfaces(dashboardTestVehicle({ withCanonicalHealth: true }), health);
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([
      ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
      ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    ]);
  });

  it('M16 — KS MX multi-finding shape: full set preserved on all surfaces', () => {
    const health = rentalHealth(
      {
        tires: mod('warning', 'Tread estimated below watch threshold'),
        battery: mod('critical', 'Voltage 12.17 V below threshold'),
        brakes: mod('warning', 'Brake wear watch'),
        error_codes: mod('warning', '2 active fault codes'),
        service_compliance: mod('critical', 'Service overdue by 50 days'),
      },
      { dashboard_warning_lights: dashboardLights([telltale('tire_pressure_warning')]) },
    );
    const vehicle = dashboardTestVehicle({
      id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
      license: 'KS MX 2024',
      withCanonicalHealth: true,
      healthEvaluation: healthEvaluation('warning', 'EVALUABLE'),
    });
    const s = surfaces(vehicle, health, { isReadyToRent: false });
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([
      ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
      ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
      ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      ACTIVE_HEALTH_FINDING_TYPE.DTC,
      ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
      ACTIVE_HEALTH_FINDING_TYPE.TIRE,
    ]);
    const dtc = s.fleet.activeHealthFindings.find((f) => f.type === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    expect(dtc?.count).toBe(2);
    expect(s.fleet.businessState).toBe('AVAILABLE');
    expect(s.fleet.readiness.isReadyToRent).toBe(false);
    expect(s.fleet.healthCondition.state).toBe('warning');
  });

  it('M17 — NOT_EVALUABLE: not good, no fabricated findings', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('unknown', 'NOT_EVALUABLE'),
      }),
      null,
    );
    expectSurfacesAgree(s);
    expect(s.fleet.healthEvaluability).toBe('NOT_EVALUABLE');
    expect(s.fleet.healthCondition.state).not.toBe('good');
    expect(s.fleet.healthCondition.state).not.toBe('critical');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M18 — PARTIALLY_EVALUABLE: not forced good, no fabricated findings', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('unknown', 'PARTIALLY_EVALUABLE'),
      }),
      rentalHealth({}, { overall_state: 'unknown' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.healthEvaluability).toBe('PARTIALLY_EVALUABLE');
    expect(s.fleet.healthCondition.state).not.toBe('good');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M19 — AUTHORIZATION_REQUIRED: attention, no health finding', () => {
    const s = surfaces(
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
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.connectivity.overallState).toBe('AUTHORIZATION_REQUIRED');
    expect(isOperationalAttentionReasonCode(s.fleet.attention.primaryReasonCode)).toBe(true);
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M20 — DEVICE_UNPLUGGED: attention, no health finding', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        connectivityRuntime: canonicalConnectivityRuntime({
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
          reasonCodes: ['DEVICE_UNPLUGGED'],
        }),
      }),
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.connectivity.overallState).toBe('DEVICE_UNPLUGGED');
    expect(s.fleet.attention.state).toBe('CRITICAL');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M21 — INTEGRATION_ERROR: attention, no health finding', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        connectivityRuntime: canonicalConnectivityRuntime({
          overallState: 'INTEGRATION_ERROR',
          attentionState: 'CRITICAL',
          reasonCodes: ['INTEGRATION_ERROR'],
        }),
      }),
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.connectivity.overallState).toBe('INTEGRATION_ERROR');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M22 — health critical + operational attention: both preserved', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('critical', 'EVALUABLE'),
        connectivityRuntime: canonicalConnectivityRuntime({
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
          reasonCodes: ['DEVICE_UNPLUGGED'],
        }),
      }),
      rentalHealth({ brakes: mod('critical', 'Pads worn') }, { overall_state: 'critical' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.healthCondition.state).toBe('critical');
    expect(s.fleet.connectivity.overallState).toBe('DEVICE_UNPLUGGED');
    expect(findingTypes(s.fleet)).toEqual([ACTIVE_HEALTH_FINDING_TYPE.BRAKE]);
  });

  it('M23 — rental_blocked + findings: findings not lost', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('critical', 'EVALUABLE'),
      }),
      rentalHealth(
        { battery: mod('critical', 'Battery critical') },
        {
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['Battery critical — recharge/check'],
        },
      ),
      { isReadyToRent: false, blockingReasonCodes: ['HEALTH_RENTAL_BLOCKED'] },
    );
    expectSurfacesAgree(s);
    expect(findingTypes(s.fleet)).toEqual([ACTIVE_HEALTH_FINDING_TYPE.BATTERY]);
    expect(s.fleet.readiness.isReadyToRent).toBe(false);
    expect(s.fleet.readiness.blockingReasonCodes).toContain('HEALTH_RENTAL_BLOCKED');
  });

  it('M24 — legacy healthStatus contradicts canonical health: canonical wins', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('good', 'EVALUABLE'),
        healthStatus: 'Critical Health',
      }),
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.healthCondition.state).toBe('good');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('M25 — legacy onlineStatus contradicts canonical connectivity: canonical wins', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        onlineStatus: 'OFFLINE',
        isFresh: false,
        lastSignal: '2026-08-20T00:00:00.000Z',
        connectivityRuntime: canonicalConnectivityRuntime({
          overallState: 'TELEMETRY_ACTIVE',
          attentionState: 'NONE',
        }),
      }),
      rentalHealth({}, { overall_state: 'good' }),
    );
    expectSurfacesAgree(s);
    expect(s.fleet.connectivity.overallState).toBe('TELEMETRY_ACTIVE');
    expect(s.fleet.attention.primaryReasonCode).toBeNull();
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });
});

function fleetContext(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null,
) {
  const [ctx] = buildFleetVehicleContexts([vehicle], () => health, { locale: 'de' });
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

function renderDrawerRow(vehicle: VehicleData, health: VehicleHealthResponse | null) {
  return renderToStaticMarkup(
    createElement(CompactFleetDrawerVehicleRow, {
      row: {
        id: 'row-1',
        vehicleId: vehicle.id,
        title: vehicle.license,
        subtitle: 'VW Golf',
        severity: 'warning',
      },
      vehicle,
      health,
      locale: 'de',
      onClose: () => {},
    }),
  );
}

describe('Stage 5 no duplicate health text S1-S4', () => {
  it('S1 — TIRE only: tire icon, no tire reason text (Fleet + Ready-to-Rent)', () => {
    const vehicle = dashboardTestVehicle({ id: 'veh-1', withCanonicalHealth: true });
    const health = rentalHealth({ tires: mod('warning', 'Monitor tires') });
    const fleetHtml = renderFleetRow(fleetContext(vehicle, health));
    expect(fleetHtml).toMatch(/Reifen — Warnung|Tires — Warning/);
    expect(fleetHtml).not.toContain('Reifen beobachten');
    expect(fleetHtml).not.toContain('Monitor tires');
    const drawerHtml = renderDrawerRow(vehicle, health);
    expect(drawerHtml).toMatch(/Reifen — Warnung|Tires — Warning/);
    expect(drawerHtml).not.toContain('Reifen beobachten');
    expect(drawerHtml).not.toContain('Monitor tires');
  });

  it('S2 — TIRE + AUTHORIZATION_REQUIRED: tire icon + auth attention', () => {
    const vehicle = dashboardTestVehicle({
      id: 'veh-1',
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
    const html = renderFleetRow(
      fleetContext(vehicle, rentalHealth({ tires: mod('warning', 'Monitor tires') })),
    );
    expect(html).toMatch(/Reifen — Warnung|Tires — Warning/);
    expect(html).toMatch(/Verbindungsprüfung erforderlich|Connectivity verification required/);
    expect(html).not.toContain('Monitor tires');
  });

  it('S3 — DTC + DEVICE_UNPLUGGED: DTC icon + device attention', () => {
    const vehicle = dashboardTestVehicle({
      id: 'veh-1',
      withCanonicalHealth: true,
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        reasonCodes: ['DEVICE_UNPLUGGED'],
      }),
    });
    const html = renderFleetRow(
      fleetContext(vehicle, rentalHealth({ error_codes: mod('warning', '2 active fault codes') })),
    );
    expect(html).toMatch(/2 aktive Fehlercodes|2 active fault codes/);
    expect(html).toMatch(/Gerät getrennt|Device disconnected/);
  });

  it('S4 — BRAKE + INTEGRATION_ERROR: brake icon + integration attention', () => {
    const vehicle = dashboardTestVehicle({
      id: 'veh-1',
      withCanonicalHealth: true,
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'CRITICAL',
        reasonCodes: ['INTEGRATION_ERROR'],
      }),
    });
    const html = renderFleetRow(
      fleetContext(vehicle, rentalHealth({ brakes: mod('critical', 'Pads worn') })),
    );
    expect(html).toMatch(/Bremsen — Kritisch|Brakes — Critical/);
    expect(html).toMatch(/Integrationsproblem|Integration issue/);
    expect(html).not.toContain('Pads worn');
  });
});

describe('Stage 5 domain independence D1-D5', () => {
  it('D1 — AVAILABLE + DEVICE_UNPLUGGED + CRITICAL attention: business Free stays, attention shown, health not fabricated', () => {
    const vehicle = dashboardTestVehicle({
      id: 'veh-1',
      withCanonicalHealth: true,
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        reasonCodes: ['DEVICE_UNPLUGGED'],
      }),
    });
    const s = surfaces(vehicle, rentalHealth({}, { overall_state: 'good' }), {
      isReadyToRent: false,
      blockingReasonCodes: ['DEVICE_UNPLUGGED'],
    });
    expect(s.fleet.businessState).toBe('AVAILABLE');
    expect(s.fleet.readiness.isReadyToRent).toBe(false);
    expect(s.fleet.healthCondition.state).toBe('good');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
    expect(s.fleet.attention.state).toBe('CRITICAL');
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth({}, { overall_state: 'good' })));
    expect(html).toMatch(/Frei|Free/);
    expect(html).toMatch(/Gerät getrennt|Device disconnected/);
  });

  it('D2 — AVAILABLE + AUTHORIZATION_REQUIRED: attention shown, no fake health icon', () => {
    const vehicle = dashboardTestVehicle({
      id: 'veh-1',
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
    const html = renderFleetRow(fleetContext(vehicle, rentalHealth({}, { overall_state: 'good' })));
    expect(html).not.toContain('role="listitem"');
    expect(html).toMatch(/Verbindungsprüfung erforderlich|Connectivity verification required/);
  });

  it('D3 — health critical + connectivity healthy: no fake connectivity attention', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('critical', 'EVALUABLE'),
      }),
      rentalHealth({ brakes: mod('critical') }, { overall_state: 'critical' }),
    );
    expect(s.fleet.healthCondition.state).toBe('critical');
    expect(s.fleet.connectivity.overallState).toBe('TELEMETRY_ACTIVE');
    expect(s.fleet.attention.primaryReasonCode).toBeNull();
  });

  it('D4 — readiness false + health good: no fake health warning', () => {
    const s = surfaces(
      dashboardTestVehicle({ withCanonicalHealth: true }),
      rentalHealth({}, { overall_state: 'good' }),
      { isReadyToRent: false, blockingReasonCodes: ['CHECKLIST_INCOMPLETE'] },
    );
    expect(s.fleet.readiness.isReadyToRent).toBe(false);
    expect(s.fleet.healthCondition.state).toBe('good');
    expect(s.fleet.activeHealthFindings).toHaveLength(0);
  });

  it('D5 — health warning + readiness true: warning visible, readiness stays true', () => {
    const s = surfaces(
      dashboardTestVehicle({
        withCanonicalHealth: true,
        healthEvaluation: healthEvaluation('warning', 'EVALUABLE'),
      }),
      rentalHealth({ tires: mod('warning') }),
      { isReadyToRent: true },
    );
    expect(s.fleet.healthCondition.state).toBe('warning');
    expect(findingTypes(s.fleet)).toEqual([ACTIVE_HEALTH_FINDING_TYPE.TIRE]);
    expect(s.fleet.readiness.isReadyToRent).toBe(true);
  });
});
