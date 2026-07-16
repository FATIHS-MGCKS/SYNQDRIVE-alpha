import { InsightSeverity } from '@prisma/client';
import {
  mapHealthSummaryBatteryModule,
  mapHealthSummaryBatteryNarrative,
  mapRentalBatteryModule,
  requireCanonicalBattery,
  resolveBatteryAlertCandidate,
  type CanonicalBatteryHealthSummary,
} from './canonical-battery-read.adapter';

function baseSummary(
  partial: Partial<CanonicalBatteryHealthSummary> = {},
): CanonicalBatteryHealthSummary {
  return {
    vehicleId: 'veh-1',
    generatedAt: '2026-06-13T10:00:00.000Z',
    support: { lv: true, hv: false },
    condition: 'good',
    currentState: {
      lastChecked: '2026-06-13T09:00:00.000Z',
    },
    lv: {
      status: 'ready',
      healthStatus: 'GOOD',
      condition: 'good',
      restingVoltage: {
        valueV: 12.7,
        status: 'GOOD',
        measurementContext: 'RESTING',
      },
      estimatedHealth: {
        status: 'GOOD',
        decisionCapable: true,
        displayMode: 'BARS',
      },
      telemetry: {
        crank: {
          operationalStatus: 'GOOD',
          diagnosticStatus: 'GOOD',
        },
      },
      freshness: { observedAt: '2026-06-13T09:00:00.000Z' },
    },
    canonical: {
      resolvedAt: '2026-06-13T10:00:00.000Z',
      liveState: {
        lv: { observedAt: '2026-06-13T09:00:00.000Z', values: { voltageV: 12.7 } },
      },
      lv: { assessment: { estimatedHealthScore: 82 } },
    },
    ...partial,
  } as CanonicalBatteryHealthSummary;
}

describe('canonical-battery-read.adapter', () => {
  it('requireCanonicalBattery returns canonical slice', () => {
    const summary = baseSummary();
    expect(requireCanonicalBattery(summary)?.resolvedAt).toBe('2026-06-13T10:00:00.000Z');
    expect(requireCanonicalBattery(null)).toBeNull();
  });

  it('mapRentalBatteryModule maps GOOD aggregate to good', () => {
    const mod = mapRentalBatteryModule({ summary: baseSummary() });
    expect(mod.state).toBe('good');
    expect(mod.source).toBe('canonical_battery');
  });

  it('mapRentalBatteryModule suppresses unsafe legacy publication', () => {
    const mod = mapRentalBatteryModule({
      summary: baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'WARNING',
          estimatedHealth: {
            status: 'WARNING',
            decisionCapable: false,
            displayMode: 'BARS',
          },
          legacyPublicationSafety: { decisionCapable: false },
        },
      } as Partial<CanonicalBatteryHealthSummary>),
    });
    expect(mod.state).toBe('unknown');
  });

  it('mapHealthSummaryBatteryNarrative uses aggregate status not score bands', () => {
    const battery = mapHealthSummaryBatteryModule(
      baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'WARNING',
          healthPercent: 90,
        },
      } as Partial<CanonicalBatteryHealthSummary>),
    );
    const narrative = mapHealthSummaryBatteryNarrative(battery);
    expect(narrative.watchpoint).toContain('niedrig');
    expect(narrative.maintenancePriority).toBe('medium');
  });

  it('resolveBatteryAlertCandidate surfaces LV CRITICAL resting', () => {
    const alert = resolveBatteryAlertCandidate(
      baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          restingVoltage: {
            valueV: 11.2,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
          },
        },
      } as Partial<CanonicalBatteryHealthSummary>),
      {
        id: 'veh-1',
        make: 'VW',
        model: 'ID.3',
        licensePlate: 'B-XY 1',
        homeStationId: null,
      },
      new Date('2026-06-13T10:00:00.000Z'),
    );
    expect(alert?.severity).toBe(InsightSeverity.CRITICAL);
    expect(alert?.reason).toContain('Ruhespannung');
  });

  it('resolveBatteryAlertCandidate returns null for GOOD vehicles', () => {
    const alert = resolveBatteryAlertCandidate(
      baseSummary(),
      {
        id: 'veh-1',
        make: 'VW',
        model: 'Golf',
        licensePlate: null,
        homeStationId: null,
      },
      new Date('2026-06-13T10:00:00.000Z'),
    );
    expect(alert).toBeNull();
  });
});
