import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { Dtc02ObservabilityService } from './dtc02-observability.service';

describe('Dtc02ObservabilityService', () => {
  it('initializes metrics and records without throwing when handles are broken', () => {
    const tripMetrics = new TripMetricsService();
    const service = new Dtc02ObservabilityService(tripMetrics);
    service.onModuleInit();
    expect(() => {
      service.recordSchedulerTick('success');
      service.recordFanOutSkip('REGISTRY_LIFECYCLE_EXCLUDED');
      service.recordPollOutcome('legacy', 'legacy_success');
      service.recordWebhookPhase('received');
    }).not.toThrow();
  });

  it('swallows metric errors (processing must not fail)', () => {
    const service = new Dtc02ObservabilityService(undefined);
    expect(() => service.recordSchedulerTick('success')).not.toThrow();
  });
});
