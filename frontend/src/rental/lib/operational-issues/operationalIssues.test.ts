import { describe, expect, it } from 'vitest';
import {
  choosePrimaryIssueSource,
  createVehicleIssueKey,
  formatVehicleIssueEntityLabel,
  formatUserFacingReasonLabel,
  getDefaultOperationalIssueVisibility,
  normalizeOperationalIssues,
  sanitizeUserFacingIssueText,
} from './index';
import type { RuntimeReasonLike, VehicleRuntimeStateLike } from './index';

function runtimeState(overrides: Partial<VehicleRuntimeStateLike> = {}): VehicleRuntimeStateLike {
  return {
    vehicleId: overrides.vehicleId ?? 'v1',
    license: overrides.license ?? 'KS MX 2024',
    make: overrides.make ?? 'Mercedes-Benz',
    model: overrides.model ?? 'C 63 AMG',
    year: overrides.year ?? 2016,
    displayName: overrides.displayName ?? 'KS MX 2024',
    warningReasons: overrides.warningReasons ?? [],
    criticalReasons: overrides.criticalReasons ?? [],
    blockReasons: overrides.blockReasons ?? [],
    notReadyReasons: overrides.notReadyReasons ?? [],
  };
}

function reason(overrides: Partial<RuntimeReasonLike> = {}): RuntimeReasonLike {
  return {
    id: overrides.id ?? 'r1',
    category: overrides.category ?? 'service',
    severity: overrides.severity ?? 'critical',
    title: overrides.title ?? 'Service ueberfaellig seit 117 Tagen',
    description: overrides.description,
    source: overrides.source ?? 'rental-health:service_compliance',
    blocking: overrides.blocking ?? true,
    preventsReady: overrides.preventsReady,
  };
}

describe('operational issue labels', () => {
  it('formats vehicle labels with license, make, model and year', () => {
    expect(
      formatVehicleIssueEntityLabel({
        license: 'KS MX 2024',
        make: 'Mercedes-Benz',
        model: 'C 63 AMG',
        year: 2016,
      }),
    ).toBe('KS MX 2024 · Mercedes-Benz C 63 AMG 2016');
  });

  it('uses documented vehicle label fallbacks', () => {
    expect(formatVehicleIssueEntityLabel({ license: 'KS FH 660E', make: 'Tesla', model: 'Model 3' })).toBe(
      'KS FH 660E · Tesla Model 3',
    );
    expect(formatVehicleIssueEntityLabel({ license: 'KS FH 660E' })).toBe('KS FH 660E');
    expect(formatVehicleIssueEntityLabel({ make: 'Audi', model: 'A4', year: 2016 })).toBe('Audi A4 2016');
    expect(formatVehicleIssueEntityLabel({})).toBe('Fahrzeug');
  });

  it('sanitizes technical source strings from user-facing text', () => {
    const text = sanitizeUserFacingIssueText(
      'Service dashboard-insight:SERVICE_OVERDUE rental-health:service_compliance vehicle-runtime UNKNOWN · UNKNOWN',
    );
    expect(text).toContain('Service');
    expect(text).not.toContain('dashboard-insight');
    expect(text).not.toContain('rental-health');
    expect(text).not.toContain('vehicle-runtime');
    expect(text).not.toContain('UNKNOWN');
  });

  it('formats raw sources and generic health text as user-facing reason labels', () => {
    expect(
      formatUserFacingReasonLabel({
        title: 'rental-health:service_compliance',
        source: 'rental-health:service_compliance',
        category: 'service',
        issueType: 'service_overdue',
      }),
    ).toBe('Service überfällig');
    expect(
      formatUserFacingReasonLabel({
        title: 'Service Window Available',
        source: 'dashboard-insight:SERVICE_WINDOW',
        category: 'service',
        issueType: 'service_window_available',
      }),
    ).toBe('Servicefenster verfügbar');
    expect(
      formatUserFacingReasonLabel({
        title: 'Critical vehicle health',
        category: 'health',
        source: 'dashboard-health-risk',
      }),
    ).toBe('Health prüfen');
  });
});

describe('operational issue keys and visibility', () => {
  it('creates vehicle keys independent of title/source', () => {
    expect(createVehicleIssueKey('v1', 'service_compliance', 'overdue')).toBe(
      'vehicle:v1:service_compliance:overdue',
    );
    expect(createVehicleIssueKey('v1', 'vehicle_health', 'battery_warning')).toBe(
      'vehicle:v1:health:battery_warning',
    );
  });

  it('keeps misuse out of vehicle health by default', () => {
    const visibility = getDefaultOperationalIssueVisibility('misuse', 'cold_engine_abuse');
    expect(visibility.vehicleTrips).toBe(true);
    expect(visibility.vehicleHealth).toBe(false);
    expect(visibility.debug).toBe(true);
  });

  it('keeps data quality and system debug out of dominant operative surfaces by default', () => {
    const dataQuality = getDefaultOperationalIssueVisibility('data_quality', 'module_data_delayed');
    const systemDebug = getDefaultOperationalIssueVisibility('system_debug', 'raw_source');
    expect(dataQuality.debug).toBe(true);
    expect(dataQuality.dashboardAttention).toBe(false);
    expect(dataQuality.vehicleHealth).toBe(false);
    expect(systemDebug.debug).toBe(true);
    expect(systemDebug.dashboardAttention).toBe(false);
  });
});

describe('operational issue source priority', () => {
  it('chooses runtime over dashboard insight and legacy for the same issue', () => {
    const primary = choosePrimaryIssueSource([
      { sourceType: 'legacy', debugLabel: 'old-helper' },
      { sourceType: 'dashboard_insight', rawType: 'SERVICE_OVERDUE' },
      { sourceType: 'runtime', debugLabel: 'vehicle-runtime' },
    ]);
    expect(primary.sourceType).toBe('runtime');
  });
});

describe('normalizeOperationalIssues', () => {
  it('dedupes service overdue with dashboard insight and service window context', () => {
    const issues = normalizeOperationalIssues({
      vehiclesById: {
        v1: { license: 'KS MX 2024', make: 'Mercedes-Benz', model: 'C 63 AMG', year: 2016 },
      },
      vehicleRuntimeStates: [
        runtimeState({
          vehicleId: 'v1',
          criticalReasons: [
            reason({
              id: 'runtime-service',
              title: 'Service ueberfaellig seit 117 Tagen',
              source: 'rental-health:service_compliance',
            }),
          ],
        }),
      ],
      dashboardInsights: [
        {
          id: 'insight-service',
          type: 'SERVICE_OVERDUE',
          severity: 'CRITICAL',
          title: 'dashboard-insight:SERVICE_OVERDUE',
          message: 'Service ueberfaellig',
          entityIds: ['v1'],
          isGrouped: false,
          groupCount: 1,
          priority: 1,
          createdAt: '2026-06-25T00:00:00.000Z',
        },
      ],
      predictiveInsights: [
        {
          id: 'predictive-window',
          type: 'SERVICE_WINDOW',
          severity: 'attention',
          title: 'Service Window Available',
          explanation: 'Freies Zeitfenster fuer Service',
          sourceData: 'predictive-operations vehicle=v1',
          vehicleId: 'v1',
        },
      ],
    });

    expect(issues).toHaveLength(1);
    const [issue] = issues;
    expect(issue.issueType).toBe('service_overdue');
    expect(issue.semanticKey).toBe('vehicle:v1:service_compliance:overdue');
    expect(issue.primarySource.sourceType).toBe('rental_health');
    expect(issue.supportingSources.some((source) => source.sourceType === 'dashboard_insight')).toBe(true);
    expect(issue.supportingSources.some((source) => source.sourceType === 'predictive_insight')).toBe(true);
    expect(issue.title).toBe('Service ueberfaellig seit 117 Tagen');
    expect(issue.title).not.toContain('rental-health');
    expect(issue.title).not.toContain('dashboard-insight');
    expect(issue.evidence?.some((item) => item.value.includes('predictive-operations'))).toBe(false);
  });

  it('merges by semantic key and keeps highest severity', () => {
    const issues = normalizeOperationalIssues({
      vehicleRuntimeStates: [
        runtimeState({
          vehicleId: 'v1',
          warningReasons: [
            reason({
              id: 'battery-warning',
              category: 'battery',
              severity: 'warning',
              title: 'Batterie pruefen',
              source: 'rental-health:battery',
              blocking: false,
            }),
          ],
          criticalReasons: [
            reason({
              id: 'battery-critical',
              category: 'battery',
              severity: 'critical',
              title: 'Batterie kritisch',
              source: 'dashboard-insight:BATTERY_CRITICAL',
              blocking: true,
            }),
          ],
        }),
      ],
    });
    const battery = issues.find((issue) => issue.issueType === 'battery_critical');
    expect(battery?.severity).toBe('critical');
  });

  it('maps cold-engine misuse cases to trips with concrete evidence and no raw enums', () => {
    const [issue] = normalizeOperationalIssues({
      misuseCases: [
        {
          id: 'case-1',
          type: 'COLD_ENGINE_ABUSE',
          title: 'COLD_ENGINE_ABUSE',
          description: 'COLD_ENGINE_HIGH_RPM',
          tripId: 'trip-1',
          vehicleId: 'v1',
          bookingId: 'booking-1',
          eventCount: 2,
          firstDetectedAt: '2026-06-25T08:15:00.000Z',
          evidenceSummary: {
            maxEngineRpm: 4200,
            maxThrottlePos: 78,
            maxCoolantTemp: 42,
            speedKmh: 46,
            durationMs: 8000,
            highFrequencyAvailable: true,
          },
        },
      ],
    });

    expect(issue.semanticKey).toBe('trip:trip-1:misuse:cold_engine_abuse');
    expect(issue.domain).toBe('misuse');
    expect(issue.title).toBe('Kaltmotor-Missbrauch erkannt');
    expect(issue.subtitle ?? '').not.toContain('COLD_ENGINE');
    expect(issue.visibility.vehicleTrips).toBe(true);
    expect(issue.visibility.vehicleHealth).toBe(false);
    expect(issue.visibility.bookingDetail).toBe(true);
    const evidence = Object.fromEntries((issue.evidence ?? []).map((item) => [item.label, `${item.value}${item.unit ? ` ${item.unit}` : ''}`]));
    expect(evidence['Drehzahl']).toBe('4200 rpm');
    expect(evidence['Gaspedal']).toBe('78 %');
    expect(evidence['Kühlmittel']).toBe('42 °C');
    expect(evidence['Geschwindigkeit']).toBe('46 km/h');
    expect(evidence['Dauer']).toBe('8 s');
    expect(evidence['Ereignisse']).toBe('2 Ereignisse');
  });

  it('maps impact cases to damage visibility, not vehicle health', () => {
    const [issue] = normalizeOperationalIssues({
      misuseCases: [
        {
          id: 'case-impact',
          type: 'POSSIBLE_IMPACT',
          tripId: 'trip-1',
          vehicleId: 'v1',
          eventCount: 1,
        },
      ],
    });

    expect(issue.domain).toBe('damage');
    expect(issue.issueType).toBe('impact_suspicion');
    expect(issue.visibility.vehicleDamages).toBe(true);
    expect(issue.visibility.vehicleTrips).toBe(true);
    expect(issue.visibility.vehicleHealth).toBe(false);
  });

  it('does not fabricate missing misuse evidence values', () => {
    const [issue] = normalizeOperationalIssues({
      misuseCases: [
        {
          id: 'case-empty',
          type: 'COLD_ENGINE_ABUSE',
          tripId: 'trip-1',
          eventCount: 0,
          evidenceSummary: {},
        },
      ],
    });

    expect(issue.evidence ?? []).toEqual([]);
  });
});
