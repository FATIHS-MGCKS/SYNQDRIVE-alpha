import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import tellTaleTirePressureIcon from '../../assets/icons/telltale/tire-pressure.svg';
import tellTaleBatteryIcon from '../../assets/icons/telltale/battery.svg';
import vhBrakeIcon from '../../assets/icons/vehicle-health/brake.svg';
import vhMotorFilterIcon from '../../assets/icons/vehicle-health/motor-filter.svg';
import vhCarBatteryIcon from '../../assets/icons/vehicle-health/car-battery.svg';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { dashboardTestVehicle } from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { VehicleHealthFindingIcons } from '../components/health/VehicleHealthFindingIcons';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  buildActiveHealthFindings,
  buildVehicleRowOperationalProjection,
  type ActiveHealthFinding,
} from './vehicle-row-operational-projection';
import {
  aggregateActiveHealthFindingsForDisplay,
  buildVehicleHealthFindingAccessibleLabel,
  resolveVehicleHealthFindingPresentation,
  splitAggregatedFindingsForDisplay,
} from './vehicle-health-finding-presentation';

function tDe(key: TranslationKey, vars?: Record<string, string | number>): string {
  let value = de[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(replacement));
    }
  }
  return value;
}

function finding(
  overrides: Partial<ActiveHealthFinding> & Pick<ActiveHealthFinding, 'type' | 'severity'>,
): ActiveHealthFinding {
  return {
    reasonCode: `test:${overrides.type}`,
    source: 'rental_health',
    localizationKey: 'fleet.rowFinding.tire.warning',
    ...overrides,
  };
}

describe('resolveVehicleHealthFindingPresentation icon assets', () => {
  it('maps TIRE to vehicle-health motor-filter icon', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
    );
    expect(presentation.iconSrc).toBe(vhMotorFilterIcon);
    expect(presentation.iconClassName).toBe('rotate-90');
  });

  it('maps BRAKE to vehicle-health brake icon', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BRAKE, severity: 'critical' }),
    );
    expect(presentation.iconSrc).toBe(vhBrakeIcon);
  });

  it('maps BATTERY to vehicle-health car-battery icon', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BATTERY, severity: 'warning' }),
    );
    expect(presentation.iconSrc).toBe(vhCarBatteryIcon);
  });

  it('maps DTC to cel.svg', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 3 }),
    );
    expect(presentation.iconSrc).toBe(tellTaleCelIcon);
    expect(presentation.count).toBe(3);
  });

  it('maps known dashboard warning telltales to specific assets', () => {
    const tpms = resolveVehicleHealthFindingPresentation(
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
    );
    expect(tpms.iconSrc).toBe(tellTaleTirePressureIcon);
    expect(tpms.telltaleKey).toBe('tire_pressure_warning');
  });

  it('uses cel.svg fallback for unknown telltale keys', () => {
    const unknown = resolveVehicleHealthFindingPresentation(
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'unsupported_abs_module' },
      }),
    );
    expect(unknown.iconSrc).toBe(tellTaleCelIcon);
    expect(unknown.domainLabelKey).toBe('fleet.healthFinding.telltale.unknown');
  });
});

describe('aggregateActiveHealthFindingsForDisplay', () => {
  it('aggregates DTC count and preserves distinct dashboard telltales', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 1 }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DTC,
        severity: 'critical',
        count: 2,
        reasonCode: 'rental_health:error_codes:2',
      }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'critical',
        metadata: { telltaleKey: 'battery_warning_light' },
      }),
    ]);

    const dtc = aggregated.find((item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    const telltales = aggregated.filter(
      (item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );

    expect(dtc?.count).toBe(3);
    expect(telltales).toHaveLength(2);
    expect(telltales.map((item) => item.telltaleKey).sort()).toEqual([
      'battery_warning_light',
      'tire_pressure_warning',
    ]);
  });

  it('deduplicates duplicate dashboard telltales', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'critical',
        metadata: { telltaleKey: 'tire_pressure_warning' },
        reasonCode: 'dashboard_warning:tire_pressure_warning:dup',
      }),
    ]);

    expect(
      aggregated.filter((item) => item.telltaleKey === 'tire_pressure_warning'),
    ).toHaveLength(1);
    expect(
      aggregated.find((item) => item.telltaleKey === 'tire_pressure_warning')?.severity,
    ).toBe('critical');
  });

  it('preserves TIRE health finding and TPMS telltale as distinct evidence', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
    ]);

    expect(aggregated).toHaveLength(2);
    expect(aggregated.some((item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.TIRE)).toBe(
      true,
    );
    expect(aggregated.some((item) => item.telltaleKey === 'tire_pressure_warning')).toBe(true);
  });

  it('orders critical findings before warnings', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BRAKE, severity: 'critical' }),
    ]);
    expect(aggregated[0]?.findingType).toBe(ACTIVE_HEALTH_FINDING_TYPE.BRAKE);
  });
});

describe('VehicleHealthFindingIcons H1-H16', () => {
  function render(findings: ActiveHealthFinding[], maxVisible = 5) {
    return renderToStaticMarkup(
      createElement(VehicleHealthFindingIcons, {
        findings,
        maxVisible,
        locale: 'de',
        t: tDe,
      }),
    );
  }

  function listItemCount(html: string): number {
    return (html.match(/role="listitem"/g) ?? []).length;
  }

  it('H1 empty findings render nothing', () => {
    expect(render([])).toBe('');
  });

  it('H2 TIRE warning renders tire icon with warning tone', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
    ]);
    expect(html).toContain('Reifen — Warnung');
    expect(html).toContain('rotate-90');
    expect(html).toContain('var(--status-watch)');
    expect(listItemCount(html)).toBe(1);
  });

  it('H3 BRAKE critical renders brake icon with critical tone', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BRAKE, severity: 'critical' }),
    ]);
    expect(html).toContain('Bremsen — Kritisch');
    expect(html).toContain('var(--status-critical)');
    expect(listItemCount(html)).toBe(1);
  });

  it('H4 BATTERY warning renders battery icon with warning tone', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BATTERY, severity: 'warning' }),
    ]);
    expect(html).toContain('Batterie — Warnung');
    expect(html).toContain('var(--status-watch)');
    expect(listItemCount(html)).toBe(1);
  });

  it('H5 DTC critical count=3 renders one icon with count badge', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 3 }),
    ]);
    expect(html).toContain('>3<');
    expect(html).toContain('3 aktive Fehlercodes — Kritisch');
    expect(listItemCount(html)).toBe(1);
  });

  it('H6 known dashboard warning uses specific telltale icon', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'battery_warning_light' },
      }),
    );
    const html = render([
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'battery_warning_light' },
      }),
    ]);
    expect(presentation.iconSrc).toBe(tellTaleBatteryIcon);
    expect(html).toContain('Batterie-Warnleuchte — Warnung');
  });

  it('H7 two different telltales are both preserved', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'battery_warning_light' },
      }),
    ]);
    expect(aggregated).toHaveLength(2);
  });

  it('H8 duplicate same telltale dedupes to one icon', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
        reasonCode: 'dup',
      }),
    ]);
    expect(aggregated).toHaveLength(1);
  });

  it('H9 unknown telltale uses cel fallback without losing finding', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'unknown_abs' },
      }),
    );
    const html = render([
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'unknown_abs' },
      }),
    ]);
    expect(presentation.iconSrc).toBe(tellTaleCelIcon);
    expect(html).toContain('Warnleuchte — Warnung');
    expect(listItemCount(html)).toBe(1);
  });

  it('H10 TIRE + BRAKE + BATTERY + DTC all render', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BRAKE, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BATTERY, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 1 }),
    ]);
    expect(html).toContain('Reifen — Warnung');
    expect(html).toContain('Bremsen — Warnung');
    expect(html).toContain('Batterie — Warnung');
    expect(html).toContain('Fehlercodes — Kritisch');
    expect(listItemCount(html)).toBe(4);
  });

  it('H11 TIRE health finding + TPMS telltale both render', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
    ]);
    expect(html).toContain('Reifen — Warnung');
    expect(html).toContain('Reifendruck — Warnung');
    expect(listItemCount(html)).toBe(2);
  });

  it('H12 BATTERY health finding + battery telltale both render', () => {
    const html = render([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BATTERY, severity: 'warning' }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'battery_warning_light' },
      }),
    ]);
    expect(html).toContain('Batterie — Warnung');
    expect(html).toContain('Batterie-Warnleuchte — Warnung');
    expect(listItemCount(html)).toBe(2);
  });

  it('H13 critical findings ordered before warnings in aggregation', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 1 }),
    ]);
    expect(aggregated[0]?.findingType).toBe(ACTIVE_HEALTH_FINDING_TYPE.DTC);
  });

  it('H14 overflow renders deterministic visible subset and +N indicator', () => {
    const findings = [
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BRAKE, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BATTERY, severity: 'warning' }),
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 1 }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'tire_pressure_warning' },
      }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'battery_warning_light' },
      }),
    ];
    const aggregated = aggregateActiveHealthFindingsForDisplay(findings);
    const split = splitAggregatedFindingsForDisplay(aggregated, 4);
    expect(split.visible.length).toBe(3);
    expect(split.overflow.length).toBe(3);

    const html = render(findings, 4);
    expect(html).toContain('+3');
    expect(html).toContain('weitere');
  });

  it('H15 icons expose localized accessible labels', () => {
    const label = buildVehicleHealthFindingAccessibleLabel(
      resolveVehicleHealthFindingPresentation(
        finding({ type: ACTIVE_HEALTH_FINDING_TYPE.TIRE, severity: 'warning' }),
      ),
      { locale: 'de', t: tDe },
    );
    expect(label).toBe('Reifen — Warnung');
  });

  it('H16 machine behavior does not depend on rendered locale strings', () => {
    const base = finding({ type: ACTIVE_HEALTH_FINDING_TYPE.BRAKE, severity: 'critical' });
    const dePresentation = resolveVehicleHealthFindingPresentation(base, { locale: 'de' });
    const enPresentation = resolveVehicleHealthFindingPresentation(base, { locale: 'en' });
    expect(dePresentation.iconSrc).toBe(enPresentation.iconSrc);
    expect(dePresentation.tone).toBe(enPresentation.tone);
    expect(dePresentation.stableKey).toBe(enPresentation.stableKey);
    expect(en['fleet.healthFinding.domain.brake']).toBe('Brakes');
  });
});

describe('KS MX 2024 production-shaped fixture', () => {
  it('represents all active findings with overflow contract', () => {
    const vehicle = dashboardTestVehicle({
      id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
      license: 'KS MX 2024',
      withCanonicalHealth: true,
    });

    const health = {
      vehicle_id: vehicle.id,
      organization_id: 'org-1',
      overall_state: 'critical',
      rental_blocked: false,
      blocking_reasons: [],
      modules: {
        tires: {
          state: 'warning',
          reason: 'Tread estimated below watch threshold',
          last_updated_at: '2026-08-26T12:00:00.000Z',
          data_stale: false,
        },
        battery: {
          state: 'critical',
          reason: 'Voltage 12.17 V below threshold',
          last_updated_at: '2026-08-26T12:00:00.000Z',
          data_stale: false,
        },
        brakes: {
          state: 'warning',
          reason: 'Brake wear watch',
          last_updated_at: '2026-08-26T12:00:00.000Z',
          data_stale: false,
        },
        error_codes: {
          state: 'warning',
          reason: '2 active fault codes',
          last_updated_at: '2026-08-26T12:00:00.000Z',
          data_stale: false,
        },
        service_compliance: {
          state: 'critical',
          reason: 'Service overdue by 50 days',
          last_updated_at: '2026-08-26T12:00:00.000Z',
          data_stale: false,
        },
        complaints: { state: 'good', reason: '', last_updated_at: '2026-08-26T12:00:00.000Z', data_stale: false },
        vehicle_alerts: { state: 'good', reason: '', last_updated_at: '2026-08-26T12:00:00.000Z', data_stale: false },
      },
      generated_at: '2026-08-26T12:00:00.000Z',
    };

    const dashboardWarningLights = {
      vehicleId: vehicle.id,
      provider: 'HIGH_MOBILITY' as const,
      connectionStatus: 'connected' as const,
      supportStatus: 'supported' as const,
      freshness: 'fresh' as const,
      overallStatus: 'warning' as const,
      lastObservedAt: '2026-08-26T12:00:00.000Z',
      message: 'Active telltales',
      rentalHealthReady: true,
      lights: [
        {
          key: 'tire_pressure_warning',
          label: 'Tire pressure',
          state: 'active' as const,
          severity: 'warning' as const,
          supported: true,
          observedAt: '2026-08-26T12:00:00.000Z',
          sourceSignal: 'tire_pressure_warning',
          sourceTimestamp: '2026-08-26T12:00:00.000Z',
          reason: 'Low tire pressure',
          action: 'inspect',
          rentalImpact: 'inspect_before_next_rental',
          isCurrentActive: true,
        },
      ],
    };

    const projection = buildVehicleRowOperationalProjection({
      vehicle,
      rentalHealth: health,
      dashboardWarningLights,
      locale: 'de',
    });

    const inputTypes = projection.activeHealthFindings.map((item) => item.type);
    expect(inputTypes).toEqual(
      expect.arrayContaining([
        ACTIVE_HEALTH_FINDING_TYPE.DTC,
        ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
        ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
        ACTIVE_HEALTH_FINDING_TYPE.TIRE,
        ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
        ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      ]),
    );
    expect(projection.activeHealthFindings.length).toBeGreaterThanOrEqual(6);

    const resolved = aggregateActiveHealthFindingsForDisplay(projection.activeHealthFindings);
    const split = splitAggregatedFindingsForDisplay(resolved, 5);

    expect(resolved.map((item) => item.findingType)).toEqual(
      expect.arrayContaining([
        ACTIVE_HEALTH_FINDING_TYPE.DTC,
        ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
        ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
        ACTIVE_HEALTH_FINDING_TYPE.TIRE,
        ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
        ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      ]),
    );
    expect(split.visible.length + split.overflow.length).toBe(resolved.length);
    expect(resolved.length).toBeGreaterThanOrEqual(6);
  });
});
