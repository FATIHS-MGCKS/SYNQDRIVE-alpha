import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { TripMetricsService } from './trip-metrics.service';
import { MetricsAccessGuard } from './metrics-access.guard';

/**
 * MetricsController
 *
 * Exposes Prometheus GET /api/v1/metrics.
 * Protected by MetricsAccessGuard (METRICS_ENABLED / token / optional IP allowlist).
 * JWT auth is intentionally not used — scrapers authenticate via METRICS_TOKEN.
 */
@Controller('metrics')
@UseGuards(MetricsAccessGuard)
export class MetricsController {
  constructor(private readonly metrics: TripMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}
