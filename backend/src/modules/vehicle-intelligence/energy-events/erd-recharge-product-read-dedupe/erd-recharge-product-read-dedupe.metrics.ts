import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { RechargeProductReadDedupeMetricResult } from './erd-recharge-product-read-dedupe';

@Injectable()
export class ErdRechargeProductReadDedupeMetricsService {
  readonly dedupeTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    this.dedupeTotal = new Counter({
      name: 'synqdrive_erd_recharge_product_read_dedupe_total',
      help: 'Product-read RECHARGE dedupe decisions (bounded labels)',
      labelNames: ['result'],
      registers: [this.tripMetrics.registry],
    });
  }

  recordResults(results: RechargeProductReadDedupeMetricResult[]): void {
    for (const result of results) {
      this.dedupeTotal.inc({ result });
    }
  }
}
