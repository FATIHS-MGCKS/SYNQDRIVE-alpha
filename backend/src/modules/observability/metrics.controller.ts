import {
  Controller,
  Get,
  Header,
  HttpException,
  UseGuards,
} from '@nestjs/common';
import { TripMetricsService } from './trip-metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

/**
 * MetricsController
 *
 * Exposes Prometheus metrics at GET /api/v1/metrics.
 * Protected by MetricsAuthGuard (METRICS_BEARER_TOKEN in production).
 * Intended for internal Prometheus scraping only — never expose publicly.
 */
@Controller('metrics')
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: TripMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    try {
      const body = await this.metrics.getMetrics();
      this.metrics.metricsEndpointRequests.inc({ result: 'success' });
      return body;
    } catch (err: unknown) {
      this.metrics.metricsEndpointRequests.inc({ result: 'error' });
      if (err instanceof HttpException) {
        throw err;
      }
      throw err;
    }
  }
}
