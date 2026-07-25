import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';
import { OperatorHealthService } from '@modules/operator-observability/operator-health.service';

/**
 * Health and readiness endpoints — publicly accessible, excluded from JWT auth.
 *
 * GET /health     — liveness: app process is alive
 * GET /readiness  — readiness: critical dependencies are reachable (Postgres, Redis)
 * GET /operator   — operator surfaces: queue/storage/outbox health
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly operatorHealth: OperatorHealthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  async readiness() {
    return this.healthService.checkReadiness();
  }

  @Get('operator')
  async operator() {
    return this.operatorHealth.getHealth();
  }
}
