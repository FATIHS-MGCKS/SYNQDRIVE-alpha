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
      batteryV2RestShadowTotal: { inc: jest.fn() },
      batteryV2RestCaptureTotal: { inc: jest.fn() },
      batteryV2RestMissedTotal: { inc: jest.fn() },
      batteryV2RestContaminationTotal: { inc: jest.fn() },
    };

    recordLvRestShadowMeasurementMetrics(metrics as any, {
      targetType: 'REST_60M',
      quality: 'CONTAMINATED_BY_WAKE' as BatteryMeasurementQuality,
    });

    expect(metrics.batteryV2RestShadowTotal.inc).toHaveBeenCalledWith({
      window: '60m',
      quality: 'CONTAMINATED_BY_WAKE',
    });
    expect(metrics.batteryV2RestCaptureTotal.inc).toHaveBeenCalledWith({ window: '60m' });
    expect(metrics.batteryV2RestContaminationTotal.inc).toHaveBeenCalled();
    expect(metrics.batteryV2RestMissedTotal.inc).not.toHaveBeenCalled();
  });

  it('records missed counter without capture when quality is MISSED', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';

    const metrics = {
      batteryV2RestShadowTotal: { inc: jest.fn() },
      batteryV2RestCaptureTotal: { inc: jest.fn() },
      batteryV2RestMissedTotal: { inc: jest.fn() },
      batteryV2RestContaminationTotal: { inc: jest.fn() },
    };

    recordLvRestShadowMeasurementMetrics(metrics as any, {
      targetType: 'REST_6H',
      quality: 'MISSED' as BatteryMeasurementQuality,
    });

    expect(metrics.batteryV2RestMissedTotal.inc).toHaveBeenCalledWith({ window: '6h' });
    expect(metrics.batteryV2RestCaptureTotal.inc).not.toHaveBeenCalled();
  });

  it('does not record metrics when shadow flag is disabled', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';

    const metrics = {
      batteryV2RestShadowTotal: { inc: jest.fn() },
      batteryV2RestCaptureTotal: { inc: jest.fn() },
      batteryV2RestMissedTotal: { inc: jest.fn() },
      batteryV2RestContaminationTotal: { inc: jest.fn() },
    };

    recordLvRestShadowMeasurementMetrics(metrics as any, {
      targetType: 'REST_60M',
      quality: 'VALID' as BatteryMeasurementQuality,
    });

    expect(metrics.batteryV2RestShadowTotal.inc).not.toHaveBeenCalled();
  });
});
