import type { BatteryMeasurementQuality } from '@prisma/client';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
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

  const window = input.targetType === 'REST_6H' ? '6h' : '60m';
  metrics.batteryV2RestShadowTotal.inc({
    window,
    quality: input.quality,
  });

  if (input.quality === 'MISSED') {
    metrics.batteryV2RestMissedTotal.inc({ window });
    return;
  }

  metrics.batteryV2RestCaptureTotal.inc({ window });

  if (isLvRestShadowContaminationQuality(input.quality)) {
    metrics.batteryV2RestContaminationTotal.inc({
      window,
      quality: input.quality,
    });
  }
}
