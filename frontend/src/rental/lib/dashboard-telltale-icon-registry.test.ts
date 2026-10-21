import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import tellTaleBatteryIcon from '../../assets/icons/telltale/battery.svg';
import tellTaleBrakePadIcon from '../../assets/icons/telltale/brake-pad.svg';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import tellTaleOilIcon from '../../assets/icons/telltale/oil.svg';
import tellTaleTirePressureIcon from '../../assets/icons/telltale/tire-pressure.svg';
import { DashboardTelltaleIcon } from '../components/health/DashboardTelltaleIcon';
import { VehicleHealthFindingIcons } from '../components/health/VehicleHealthFindingIcons';
import {
  DASHBOARD_TELLTALE_GENERIC_ICON_NAME,
  KNOWN_DASHBOARD_TELLTALE_KEYS,
  resolveDashboardTelltaleIcon,
  resolveDashboardTelltaleIconSrc,
} from './dashboard-warning-lights-display';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  type ActiveHealthFinding,
} from './vehicle-row-operational-projection';
import {
  aggregateActiveHealthFindingsForDisplay,
  resolveVehicleHealthFindingPresentation,
} from './vehicle-health-finding-presentation';

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

function renderFindings(findings: ActiveHealthFinding[]): string {
  return renderToStaticMarkup(
    createElement(VehicleHealthFindingIcons, { findings, locale: 'de', maxVisible: 8 }),
  );
}

describe('dashboard telltale icon registry (T1–T12)', () => {
  it('T1 — DTC resolves to CEL icon', () => {
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 2 }),
    );
    expect(presentation.iconSrc).toBe(tellTaleCelIcon);
    expect(presentation.findingType).toBe(ACTIVE_HEALTH_FINDING_TYPE.DTC);
  });

  it('T2 — check_engine_light dashboard telltale resolves to CEL', () => {
    expect(resolveDashboardTelltaleIconSrc('check_engine_light')).toBe(tellTaleCelIcon);
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'check_engine_light' },
      }),
    );
    expect(presentation.iconSrc).toBe(tellTaleCelIcon);
    expect(presentation.findingType).toBe(ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING);
  });

  it('T3 — engine_limp_mode resolves to CEL powertrain vocabulary', () => {
    expect(resolveDashboardTelltaleIconSrc('engine_limp_mode')).toBe(tellTaleCelIcon);
  });

  it('T4 — tire_pressure_warning resolves to TPMS icon', () => {
    expect(resolveDashboardTelltaleIconSrc('tire_pressure_warning')).toBe(tellTaleTirePressureIcon);
  });

  it('T5 — battery_warning_light resolves to battery telltale icon', () => {
    expect(resolveDashboardTelltaleIconSrc('battery_warning_light')).toBe(tellTaleBatteryIcon);
  });

  it('T6 — brake_lining_wear_pre_warning resolves to brake-pad icon', () => {
    expect(resolveDashboardTelltaleIconSrc('brake_lining_wear_pre_warning')).toBe(tellTaleBrakePadIcon);
  });

  it('T7 — engine_oil_level resolves to oil icon', () => {
    expect(resolveDashboardTelltaleIconSrc('engine_oil_level')).toBe(tellTaleOilIcon);
  });

  it('T8 — ABS warning uses generic dashboard-warning fallback, not CEL', () => {
    expect(resolveDashboardTelltaleIconSrc('abs_warning')).toBeNull();
    const resolution = resolveDashboardTelltaleIcon('abs_warning');
    expect(resolution.kind).toBe('generic');
    expect(resolution.genericIconName).toBe(DASHBOARD_TELLTALE_GENERIC_ICON_NAME);
    const html = renderToStaticMarkup(
      createElement(DashboardTelltaleIcon, { telltaleKey: 'abs_warning', className: 'w-4 h-4' }),
    );
    expect(html).not.toContain(tellTaleCelIcon);
    expect(html).toContain('lucide-triangle-alert');
  });

  it('T9 — completely unknown telltale uses generic fallback, not CEL', () => {
    expect(resolveDashboardTelltaleIconSrc('esc_stability_control')).toBeNull();
    const presentation = resolveVehicleHealthFindingPresentation(
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'esc_stability_control' },
      }),
    );
    expect(presentation.iconKind).toBe('lucide');
    expect(presentation.lucideIconName).toBe('alert-triangle');
    expect(presentation.iconSrc).toBe('');
    const html = renderFindings([
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'esc_stability_control' },
      }),
    ]);
    expect(html).not.toContain(tellTaleCelIcon);
    expect(html).toContain('lucide-triangle-alert');
  });

  it('T10 — DTC + unknown dashboard warning resolve to distinct icon identities', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 1 }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'abs_warning' },
      }),
    ]);
    const dtc = aggregated.find((item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    const telltale = aggregated.find(
      (item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );
    expect(dtc?.iconSrc).toBe(tellTaleCelIcon);
    expect(telltale?.iconKind).toBe('lucide');
    expect(telltale?.lucideIconName).toBe('alert-triangle');
    expect(dtc?.iconSrc).not.toBe(telltale?.iconSrc);
  });

  it('T11 — DTC + check-engine telltale remain distinct findings despite shared CEL asset', () => {
    const aggregated = aggregateActiveHealthFindingsForDisplay([
      finding({ type: ACTIVE_HEALTH_FINDING_TYPE.DTC, severity: 'critical', count: 1 }),
      finding({
        type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
        severity: 'warning',
        metadata: { telltaleKey: 'check_engine_light' },
      }),
    ]);
    expect(aggregated).toHaveLength(2);
    const dtc = aggregated.find((item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.DTC);
    const celTelltale = aggregated.find(
      (item) => item.findingType === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
    );
    expect(dtc?.iconSrc).toBe(tellTaleCelIcon);
    expect(celTelltale?.iconSrc).toBe(tellTaleCelIcon);
    expect(dtc?.stableKey).not.toBe(celTelltale?.stableKey);
    expect(dtc?.domainLabelKey).toBe('fleet.healthFinding.domain.dtc');
    expect(celTelltale?.domainLabelKey).toBe('fleet.healthFinding.telltale.checkEngineLight');
  });

  it('T12 — Vehicle Detail live telltale consumers use canonical registry', () => {
    const consumerPaths = [
      '../components/DashboardWarningLightsPanel.tsx',
      '../components/DashboardWarningLightsQuickView.tsx',
      '../components/health/DashboardWarningLightsDetailDrawer.tsx',
    ];
    for (const relativePath of consumerPaths) {
      const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
      expect(source).toContain('DashboardTelltaleIcon');
      expect(source).not.toMatch(/resolveDashboardTelltaleIconSrc\s*\(/);
    }
    expect(KNOWN_DASHBOARD_TELLTALE_KEYS).toEqual([
      'engine_oil_level',
      'engine_limp_mode',
      'check_engine_light',
      'brake_lining_wear_pre_warning',
      'tire_pressure_warning',
      'battery_warning_light',
    ]);
  });
});
