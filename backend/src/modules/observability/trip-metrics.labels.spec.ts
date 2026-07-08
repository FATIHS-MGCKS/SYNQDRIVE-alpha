import { TripMetricsService } from './trip-metrics.service';
import { FORBIDDEN_PROMETHEUS_LABELS } from './metrics-access.util';

const forbidden = new Set<string>(FORBIDDEN_PROMETHEUS_LABELS);

describe('TripMetricsService Prometheus label policy', () => {
  it('does not register high-cardinality entity id labels', () => {
    const service = new TripMetricsService();
    const metrics = service.registry.getMetricsAsArray();

    for (const metric of metrics) {
      const labelNames = (metric as { labelNames?: string[] }).labelNames ?? [];
      for (const label of labelNames) {
        expect(forbidden.has(label)).toBe(false);
      }
    }
  });
});
