import { Controller, Get, Header } from '@nestjs/common';
import { TripMetricsService } from './trip-metrics.service';

/**
 * MetricsController
 *
 * Exposes the Prometheus /metrics endpoint.
 * No authentication — metrics are intended for internal scraping only.
 * In production, ensure this endpoint is not publicly accessible.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: TripMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}
