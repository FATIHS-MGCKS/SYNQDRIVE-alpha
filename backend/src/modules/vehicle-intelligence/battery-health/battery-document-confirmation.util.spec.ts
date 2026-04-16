import { BatteryEvidenceScope } from '@prisma/client';
import {
  normalizeBatteryDocumentConfirm,
} from './battery-document-confirmation.util';

describe('normalizeBatteryDocumentConfirm', () => {
  it('defaults to LV measurement scope and kind', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const normalized = normalizeBatteryDocumentConfirm({}, now);

    expect(normalized.scope).toBe(BatteryEvidenceScope.LV);
    expect(normalized.recordKind).toBe('measurement');
    expect(normalized.isReplacement).toBe(false);
    expect(normalized.observedAt.toISOString()).toBe(now.toISOString());
  });

  it('resolves HV replacement from explicit recordKind', () => {
    const normalized = normalizeBatteryDocumentConfirm({
      scope: 'hv',
      recordKind: 'replacement',
      eventDate: '2026-02-02T10:00:00.000Z',
      sohPercent: '87.5',
      odometerKm: '123456',
    });

    expect(normalized.scope).toBe(BatteryEvidenceScope.HV);
    expect(normalized.recordKind).toBe('replacement');
    expect(normalized.isReplacement).toBe(true);
    expect(normalized.observedAt.toISOString()).toBe('2026-02-02T10:00:00.000Z');
    expect(normalized.sohPercent).toBe(87.5);
    expect(normalized.odometerKm).toBe(123456);
  });

  it('accepts alternate scope aliases and numeric strings', () => {
    const normalized = normalizeBatteryDocumentConfirm({
      batteryScope: 'traction',
      serviceKind: 'battery_service',
      voltageV: '12.44',
      restingVoltage: '12.61',
      crankingVoltage: '10.91',
      chargingVoltage: '14.11',
      temperatureC: '7',
    });

    expect(normalized.scope).toBe(BatteryEvidenceScope.HV);
    expect(normalized.isReplacement).toBe(true);
    expect(normalized.voltageV).toBeCloseTo(12.44, 3);
    expect(normalized.restingVoltage).toBeCloseTo(12.61, 3);
    expect(normalized.crankingVoltage).toBeCloseTo(10.91, 3);
    expect(normalized.chargingVoltage).toBeCloseTo(14.11, 3);
    expect(normalized.temperatureC).toBe(7);
  });
});
