import { BatteryMeasurementQuality } from '@prisma/client';
import { recordLvRestShadowMeasurementMetrics } from './lv-rest-shadow-metrics';

describe('lv-rest-shadow-metrics', () => {
  const originalEnv = process.env.BATTERY_V2_REST_SHADOW_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BATTERY_V2_REST_SHADOW_ENABLED;
    } else {
      process.env.BATTERY_V2_REST_SHADOW_ENABLED = originalEnv;
    }
  });

  it('records capture, missed, and contamination counters when shadow is enabled', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';

    const metrics = {
      batteryRestMeasurementsTotal: { inc: jest.fn() },
      batteryRestMissedTotal: { inc: jest.fn() },
      batteryRestContaminatedTotal: { inc: jest.fn() },
    };

    recordLvRestShadowMeasurementMetrics(metrics as any, {
      targetType: 'REST_60M',
      quality: 'CONTAMINATED_BY_WAKE' as BatteryMeasurementQuality,
    });

    expect(metrics.batteryRestMeasurementsTotal.inc).toHaveBeenCalledWith({
      window: '60m',
      quality: 'CONTAMINATED_BY_WAKE',
    });
    expect(metrics.batteryRestContaminatedTotal.inc).toHaveBeenCalledWith({
      window: '60m',
    });
    expect(metrics.batteryRestMissedTotal.inc).not.toHaveBeenCalled();
  });

  it('records missed counter when quality is MISSED', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';

    const metrics = {
      batteryRestMeasurementsTotal: { inc: jest.fn() },
      batteryRestMissedTotal: { inc: jest.fn() },
      batteryRestContaminatedTotal: { inc: jest.fn() },
    };

    recordLvRestShadowMeasurementMetrics(metrics as any, {
      targetType: 'REST_6H',
      quality: 'MISSED' as BatteryMeasurementQuality,
    });

    expect(metrics.batteryRestMissedTotal.inc).toHaveBeenCalledWith({ window: '6h' });
  });

  it('does not record metrics when shadow flag is disabled', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';

    const metrics = {
      batteryRestMeasurementsTotal: { inc: jest.fn() },
      batteryRestMissedTotal: { inc: jest.fn() },
      batteryRestContaminatedTotal: { inc: jest.fn() },
    };

    recordLvRestShadowMeasurementMetrics(metrics as any, {
      targetType: 'REST_60M',
      quality: 'VALID' as BatteryMeasurementQuality,
    });

    expect(metrics.batteryRestMeasurementsTotal.inc).not.toHaveBeenCalled();
  });
});
