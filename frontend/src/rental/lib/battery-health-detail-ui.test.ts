import { describe, expect, it } from 'vitest';
import type { BatteryEvidenceItem, BatteryHealthDetail, BatteryHealthSummary } from '../../lib/api';
import {
  buildBatteryMeasurementRows,
  buildRestingVoltageTrendPoints,
  labelBatteryMeasurementType,
  resolveCanonicalRestingVoltage,
  resolveCurrentLiveVoltage,
  resolveExteriorAmbientTemperature,
} from './battery-health-detail-ui';

describe('battery-health-detail-ui', () => {
  it('labels evidence value types in German', () => {
    expect(labelBatteryMeasurementType('RESTING_VOLTAGE_V')).toBe('12V-Ruhespannung');
    expect(labelBatteryMeasurementType('VOLTAGE_V')).toBe('Aktuelle Spannung');
    expect(labelBatteryMeasurementType('CHARGING_VOLTAGE_V')).toBe('Ladespannung');
    expect(labelBatteryMeasurementType('SOH_PERCENT', { scope: 'LV' })).toBe(
      'Geschätzter 12V-Batteriezustand',
    );
    expect(labelBatteryMeasurementType('SOH_PERCENT', { scope: 'HV' })).toBe('SOH');
  });

  it('separates resting vs live voltage resolution', () => {
    const summary = {
      lv: {
        restingVoltage: { valueV: 12.84 },
        telemetry: { voltageV: 14.1, restingVoltage: null },
      },
      currentState: { voltageV: 14.2, restingVoltage: 12.5 },
      currentTelemetry: { lvVoltageV: null },
    } as BatteryHealthSummary;

    expect(resolveCanonicalRestingVoltage(summary)).toBe(12.84);
    expect(resolveCurrentLiveVoltage(summary)).toBe(14.1);
  });

  it('ignores unrealistic voltages', () => {
    const summary = {
      lv: { restingVoltage: { valueV: 0 }, telemetry: { voltageV: -1 } },
      currentState: {},
      currentTelemetry: {},
    } as BatteryHealthSummary;
    expect(resolveCanonicalRestingVoltage(summary)).toBeNull();
    expect(resolveCurrentLiveVoltage(summary)).toBeNull();
  });

  it('builds resting-only trend from evidence', () => {
    const evidence: BatteryEvidenceItem[] = [
      {
        id: '1',
        observedAt: new Date().toISOString(),
        valueType: 'RESTING_VOLTAGE_V',
        value: 12.6,
        unit: 'V',
        sourceType: 'telemetry',
        provider: null,
        confidence: null,
        quality: null,
        documentExtractionId: null,
        serviceEventId: null,
      },
      {
        id: '2',
        observedAt: new Date().toISOString(),
        valueType: 'CHARGING_VOLTAGE_V',
        value: 14.4,
        unit: 'V',
        sourceType: 'telemetry',
        provider: null,
        confidence: null,
        quality: null,
        documentExtractionId: null,
        serviceEventId: null,
      },
    ];
    const points = buildRestingVoltageTrendPoints(evidence, 7, 'AGM');
    expect(points).toHaveLength(1);
    expect(points[0].voltageV).toBe(12.6);
  });

  it('builds measurement rows from evidence with labels', () => {
    const detail = {
      detail: {
        lv: {
          evidence: [
            {
              id: 'e1',
              observedAt: '2026-06-25T10:00:00.000Z',
              valueType: 'RESTING_VOLTAGE_V',
              value: 12.84,
              unit: 'V',
              sourceType: 'telemetry_derived',
              provider: 'DIMO',
              confidence: 'HIGH',
              quality: null,
              documentExtractionId: null,
              serviceEventId: null,
            },
          ],
        },
        hv: { evidence: [], chargingSessions: [], recentTrend: [] },
      },
    } as BatteryHealthDetail;

    const rows = buildBatteryMeasurementRows(detail, null);
    expect(rows[0].label).toBe('12V-Ruhespannung');
    expect(rows[0].valueText).toBe('12.84 V');
    expect(rows[0].metaText).toContain('DIMO');
  });

  it('resolves exterior ambient from latest trip outsideTemperatureStartC', () => {
    const ctx = resolveExteriorAmbientTemperature(
      [
        { id: 't1', vehicleId: 'v1', tripStatus: 'COMPLETED', startTime: '2026-06-20T08:00:00.000Z', outsideTemperatureStartC: 5 },
        { id: 't2', vehicleId: 'v1', tripStatus: 'COMPLETED', startTime: '2026-06-25T08:00:00.000Z', outsideTemperatureStartC: 18 },
      ] as any,
      null,
    );
    expect(ctx.valueC).toBe(18);
    expect(ctx.source).toBe('trip');
  });
});
