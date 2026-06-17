import { describe, expect, it } from 'vitest';
import type { DashboardWarningLight, DashboardWarningLightsResponse } from '../../lib/api';
import {
  lightStateLabel,
  resolveTelltalePanelPresentation,
  sortDashboardLights,
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
  it('not connected → Nicht verbunden badge', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({ connectionStatus: 'not_connected', supportStatus: 'not_connected' }),
    );
    expect(p.badgeLabel).toBe('Nicht verbunden');
    expect(p.showConfirmedOff).toBe(false);
    expect(p.summaryText).toContain('keine OEM/HM-Warnleuchtenquelle');
  });

  it('no data → Wartet auf Daten', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({ supportStatus: 'no_data', freshness: 'no_data' }),
    );
    expect(p.badgeLabel).toBe('Wartet auf Daten');
    expect(p.showConfirmedOff).toBe(false);
  });

  it('not supported → Nicht unterstützt', () => {
    const p = resolveTelltalePanelPresentation(envelope({ supportStatus: 'not_supported' }));
    expect(p.badgeLabel).toBe('Nicht unterstützt');
  });

  it('stale → Daten veraltet', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({ freshness: 'stale', lastObservedAt: '2026-01-01T10:00:00.000Z' }),
    );
    expect(p.badgeLabel).toBe('Daten veraltet');
  });

  it('critical active → Kritische Warnung', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({
        overallStatus: 'critical',
        lights: [
          light({
            key: 'engine_limp_mode',
            label: 'Motorwarnung / Notlauf',
            state: 'active',
            severity: 'critical',
          }),
        ],
      }),
    );
    expect(p.badgeLabel).toBe('Kritische Warnung');
    expect(p.activeCriticalCount).toBe(1);
  });

  it('warning active', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({
        overallStatus: 'warning',
        lights: [
          light({
            key: 'brake_lining_wear_pre_warning',
            label: 'Bremsbelag',
            state: 'active',
            severity: 'warning',
          }),
        ],
      }),
    );
    expect(p.badgeLabel).toBe('Warnung aktiv');
  });

  it('good → confirmed off only when backend says good', () => {
    const p = resolveTelltalePanelPresentation(envelope({ overallStatus: 'good' }));
    expect(p.showConfirmedOff).toBe(true);
    expect(p.badgeLabel).toContain('Keine aktiven');
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

  it('inactive HM uses backend message', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({
        connectionStatus: 'not_connected',
        supportStatus: 'not_connected',
        message: 'HM Health-Verknüpfung ist nicht aktiv. Warnleuchten können erst nach Aktivierung angezeigt werden.',
      }),
    );
    expect(p.badgeLabel).toBe('Telematik inaktiv');
    expect(p.summaryText).toContain('nicht aktiv');
    expect(p.showConfirmedOff).toBe(false);
  });

  it('off_confirmed overall shows confirmed off banner', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({
        overallStatus: 'good',
        supportStatus: 'supported',
        freshness: 'fresh',
        connectionStatus: 'connected',
      }),
    );
    expect(p.showConfirmedOff).toBe(true);
  });

  it('active critical presentation', () => {
    const p = resolveTelltalePanelPresentation(
      envelope({
        overallStatus: 'critical',
        connectionStatus: 'connected',
        supportStatus: 'supported',
        lights: [
          light({
            key: 'engine_limp_mode',
            label: 'Motorwarnung / Notlauf',
            state: 'active',
            severity: 'critical',
          }),
        ],
      }),
    );
    expect(p.badgeLabel).toContain('Kritisch');
    expect(p.showConfirmedOff).toBe(false);
  });
});
