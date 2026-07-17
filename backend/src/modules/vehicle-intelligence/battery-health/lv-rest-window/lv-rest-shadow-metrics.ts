import type { BatteryMeasurementQuality } from '@prisma/client';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordBatteryRestMeasurement,
  toBatteryRestWindowLabel,
} from '../observability/battery-v2-prometheus.metrics';
import {
  isLvRestShadowContaminationQuality,
  isLvRestShadowModeActive,
} from './lv-rest-shadow.policy';

export type LvRestShadowTargetWindow = 'REST_60M' | 'REST_6H';

export function recordLvRestShadowMeasurementMetrics(
  metrics: TripMetricsService,
  input: {
    targetType: LvRestShadowTargetWindow;
    quality: BatteryMeasurementQuality;
  },
): void {
  if (!isLvRestShadowModeActive()) {
    return;
  }

  recordBatteryRestMeasurement(metrics, {
    window: toBatteryRestWindowLabel(input.targetType),
    quality: input.quality,
  });

  if (
    input.quality !== 'MISSED' &&
    isLvRestShadowContaminationQuality(input.quality)
  ) {
    // contamination counter incremented inside recordBatteryRestMeasurement
  }
}
