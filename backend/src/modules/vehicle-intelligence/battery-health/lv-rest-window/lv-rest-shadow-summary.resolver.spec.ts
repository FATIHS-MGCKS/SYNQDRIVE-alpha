import {
  BatteryMeasurementQuality,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { resolveLvRestShadowSummary } from './lv-rest-shadow-summary.resolver';

describe('resolveLvRestShadowSummary', () => {
  const vehicleId = 'veh-shadow-1';

  const prisma = {
    batteryMeasurementSession: {
      count: jest.fn().mockResolvedValue(3),
    },
    batteryMeasurement: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'm-valid-6h',
          type: BatteryMeasurementType.REST_6H,
          observedAt: new Date('2026-07-16T18:00:00.000Z'),
          numericValue: 12.6,
          quality: BatteryMeasurementQuality.VALID,
          context: { shadowMode: true },
        },
        {
          id: 'm-missed-60m',
          type: BatteryMeasurementType.REST_60M,
          observedAt: new Date('2026-07-16T12:00:00.000Z'),
          numericValue: null,
          quality: BatteryMeasurementQuality.MISSED,
          context: { shadowMode: true },
        },
        {
          id: 'm-wake-60m',
          type: BatteryMeasurementType.REST_60M,
          observedAt: new Date('2026-07-16T11:00:00.000Z'),
          numericValue: 14.1,
          quality: BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
          context: { shadowMode: true },
        },
        {
          id: 'm-legacy',
          type: BatteryMeasurementType.REST_60M,
          observedAt: new Date('2026-07-15T10:00:00.000Z'),
          numericValue: 12.5,
          quality: BatteryMeasurementQuality.VALID,
          context: {},
        },
      ]),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aggregates shadow-only REST measurements', async () => {
    const summary = await resolveLvRestShadowSummary(prisma as any, vehicleId);

    expect(prisma.batteryMeasurementSession.count).toHaveBeenCalledWith({
      where: {
        vehicleId,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
      },
    });

    expect(summary.vehicleId).toBe(vehicleId);
    expect(summary.restWindowCount).toBe(3);
    expect(summary.capture.rest60m).toEqual({
      targetType: 'REST_60M',
      scheduled: 2,
      captured: 1,
      missed: 1,
      captureRate: 50,
    });
    expect(summary.capture.rest6h.captured).toBe(1);
    expect(summary.wakeContaminationCount).toBe(1);
    expect(summary.lastValidMeasurement?.id).toBe('m-valid-6h');
    expect(summary.qualityDistribution.length).toBeGreaterThan(0);
  });
});
