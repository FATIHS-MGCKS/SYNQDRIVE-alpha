import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { LegacyFragmentProductReadMetricResult } from './erd-recharge-legacy-fragment-product-read';

@Injectable()
export class ErdRechargeLegacyFragmentProductReadMetricsService {
  readonly decisionsTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    this.decisionsTotal = new Counter({
      name: 'synqdrive_erd_recharge_legacy_fragment_product_read_total',
      help: 'Legacy RECHARGE fragment product-read collapse decisions (bounded labels)',
      labelNames: ['result'],
      registers: [this.tripMetrics.registry],
    });
  }

  recordResults(results: LegacyFragmentProductReadMetricResult[]): void {
    for (const result of results) {
      this.decisionsTotal.inc({ result });
    }
  }
}
