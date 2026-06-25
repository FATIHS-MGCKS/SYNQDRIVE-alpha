import { describe, expect, it } from 'vitest';
import type { DashboardWarningLight, DashboardWarningLightsResponse } from '../../lib/api';
import {
  countActiveTelltales,
  countHistoricalTelltales,
  deriveTelltaleDisplayCategory,
  isBatteryTelltaleActive,
  isTelltaleCurrentlyActive,
  isTelltaleProviderConnected,
  resolveSourceFooter,
  resolveTelltalePanelPresentation,
  sortDashboardLights,
  telltaleShortLabel,
  telltaleShortTextFromLight,
  telltaleTileStatusLabel,
} from './dashboard-warning-lights-display';

function light(partial: Partial<DashboardWarningLight> & Pick<DashboardWarningLight, 'key' | 'label'>): DashboardWarningLight {
  return {
    state: 'no_event_yet',
    severity: 'unknown',
    supported: null,
    observedAt: null,
    sourceSignal: null,
    sourceTimestamp: null,
    reason: '',
    action: '',
    rentalImpact: 'none',
    ...partial,
  };
}

function envelope(
  partial: Partial<DashboardWarningLightsResponse>,
): DashboardWarningLightsResponse {
  return {
    vehicleId: 'v1',
    provider: 'HIGH_MOBILITY',
    connectionStatus: 'connected',
    supportStatus: 'supported',
    freshness: 'fresh',
    overallStatus: 'unknown',
    lastObservedAt: null,
    message: '',
    lights: [],
    rentalHealthReady: true,
    ...partial,
  };
}

describe('dashboard-warning-lights-display', () => {
  it('not connected → Nicht verbunden badge + subline', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({ connectionStatus: 'not_connected', supportStatus: 'not_connected' }),
    );
    expect(p.badgeLabel).toBe('Nicht verbunden');
    expect(p.summaryText).toBe('Fahrzeug nicht mit HM/OEM Health verbunden.');
    expect(p.isConnected).toBe(false);
    expect(resolveSourceFooter(envelope({ connectionStatus: 'not_connected' }))).toBe(
      'Keine HM/OEM-Verbindung',
    );
  });

  it('connected + all inactive → Alles klar', () => {
    const p = resolveTelltalePanelPresentation(envelope({ overallStatus: 'good' }));
    expect(p.badgeLabel).toBe('Alles klar');
    expect(p.summaryText).toBe('Keine aktiven Warnleuchten erkannt.');
    expect(p.showConfirmedOff).toBe(true);
  });

  it('one active battery warning → Warnung aktiv', () => {
    const data = envelope({
      overallStatus: 'warning',
      lights: [
        light({
          key: 'battery_warning_light',
          label: 'Batterie',
          state: 'active',
          severity: 'warning',
        }),
      ],
    });
    const p = resolveTelltalePanelPresentation(data);
    expect(p.badgeLabel).toBe('Warnung aktiv');
    expect(p.activeCount).toBe(1);
    expect(telltaleTileStatusLabel(data.lights[0], true)).toBe('Aktiv');
  });

  it('critical active also maps to Warnung aktiv (not separate critical badge)', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({
        overallStatus: 'critical',
        lights: [
          light({
            key: 'engine_limp_mode',
            label: 'Notlauf',
            state: 'active',
            severity: 'critical',
          }),
        ],
      }),
    );
    expect(p.badgeLabel).toBe('Warnung aktiv');
    expect(telltaleTileStatusLabel(
      light({ key: 'engine_limp_mode', label: 'Notlauf', state: 'active', severity: 'critical' }),
      true,
    )).toBe('Kritisch');
  });

  it('stale / no_data → Veraltet or Unbekannt (not Datenbasis badge)', () => {
    const stale = resolveTelltalePanelPresentation(
      envelope({ freshness: 'stale', lastObservedAt: '2026-01-01T10:00:00.000Z' }),
    );
    expect(stale.badgeLabel).toBe('Veraltet');
    expect(stale.summaryText).toContain('zu alt');

    const noData = resolveTelltalePanelPresentation(
      envelope({ supportStatus: 'no_data', freshness: 'no_data' }),
    );
    expect(noData.badgeLabel).toBe('Unbekannt');
  });

  it('provider error → Unbekannt', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({ connectionStatus: 'provider_error', freshness: 'error' }),
    );
    expect(p.badgeLabel).toBe('Unbekannt');
  });

  it('sorts critical active lights first', () => {
    const sorted = sortDashboardLights([
      light({ key: 'a', label: 'B', state: 'off_confirmed', severity: 'info' }),
      light({ key: 'b', label: 'A', state: 'active', severity: 'warning' }),
      light({ key: 'c', label: 'C', state: 'active', severity: 'critical' }),
    ]);
    expect(sorted[0].severity).toBe('critical');
    expect(sorted[1].severity).toBe('warning');
  });

  it('short labels for canonical telltales', () => {
    expect(telltaleShortLabel('engine_oil_level')).toBe('Motoröl');
    expect(telltaleShortLabel('engine_limp_mode')).toBe('Notlauf');
    expect(telltaleShortLabel('brake_lining_wear_pre_warning')).toBe('Bremsbelag');
    expect(telltaleShortLabel('tire_pressure_warning')).toBe('Reifendruck');
    expect(telltaleShortLabel('battery_warning_light')).toBe('Batterie');
  });

  it('tile status is em-dash when not connected', () => {
    const l = light({ key: 'battery_warning_light', label: 'Batterie', state: 'active', severity: 'warning' });
    expect(telltaleTileStatusLabel(l, false)).toBe('—');
  });

  it('battery telltale active only from read model, not legacy indicator alone when read model exists', () => {
    const telltales = envelope({
      lights: [
        light({ key: 'battery_warning_light', label: 'Batterie', state: 'off_confirmed', severity: 'info' }),
      ],
    });
    expect(isBatteryTelltaleActive(telltales, true)).toBe(false);
    expect(isBatteryTelltaleActive(telltales, false)).toBe(false);
  });

  it('countActiveTelltales counts only active state', () => {
    expect(
      countActiveTelltales([
        light({ key: 'a', label: 'A', state: 'active', severity: 'warning' }),
        light({ key: 'b', label: 'B', state: 'off_confirmed', severity: 'info' }),
      ]),
    ).toBe(1);
  });

  it('stale envelope does not count legacy active lights as current', () => {
    const data = envelope({
      freshness: 'stale',
      lights: [
        light({
          key: 'battery_warning_light',
          label: 'Batterie',
          state: 'active',
          severity: 'warning',
        }),
      ],
    });
    expect(countActiveTelltales(data.lights, data.freshness)).toBe(0);
    expect(resolveTelltalePanelPresentation(data).badgeLabel).toBe('Veraltet');
    expect(isBatteryTelltaleActive(data, true)).toBe(false);
  });

  it('stale light state is not counted as active', () => {
    const staleLight = light({
      key: 'battery_warning_light',
      label: 'Batterie',
      state: 'stale',
      severity: 'unknown',
    });
    expect(isTelltaleCurrentlyActive(staleLight, 'fresh')).toBe(false);
    expect(telltaleShortTextFromLight(staleLight)).toBe('Veraltet');
  });

  it('isTelltaleProviderConnected requires connected status', () => {
    expect(isTelltaleProviderConnected(envelope({ connectionStatus: 'connected' }))).toBe(true);
    expect(isTelltaleProviderConnected(envelope({ connectionStatus: 'not_connected' }))).toBe(false);
  });

  it('historical battery (stale + isHistorical) is not active and shows Historisch', () => {
    const battery = light({
      key: 'battery_warning_light',
      label: 'Batterie',
      state: 'stale',
      severity: 'warning',
      isHistorical: true,
      isCurrentActive: false,
      observedAt: '2026-01-01T10:00:00.000Z',
    });
    const data = envelope({ lights: [battery] });
    expect(deriveTelltaleDisplayCategory(battery, data.freshness)).toBe('historical');
    expect(countActiveTelltales(data.lights, data.freshness)).toBe(0);
    expect(countHistoricalTelltales(data.lights, data.freshness)).toBe(1);
    const p = resolveTelltalePanelPresentation(data);
    expect(p.badgeLabel).toBe('Historisch');
    expect(p.activeCount).toBe(0);
    expect(telltaleTileStatusLabel(battery, true, data.freshness)).toBe('Historisch');
    expect(telltaleShortTextFromLight(battery, data.freshness)).toBe('Historisch');
  });

  it('fresh off_confirmed battery is not counted as active or historical', () => {
    const battery = light({
      key: 'battery_warning_light',
      label: 'Batterie',
      state: 'off_confirmed',
      severity: 'info',
      isHistorical: false,
      isCurrentActive: false,
    });
    const data = envelope({ overallStatus: 'good', lights: [battery] });
    expect(deriveTelltaleDisplayCategory(battery, data.freshness)).toBe('off_confirmed');
    expect(countHistoricalTelltales(data.lights, data.freshness)).toBe(0);
    expect(resolveTelltalePanelPresentation(data).badgeLabel).toBe('Alles klar');
  });
});
