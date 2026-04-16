import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';

/**
 * Health and readiness endpoints — publicly accessible, excluded from JWT auth.
 *
 * GET /health     — liveness: app process is alive
 * GET /readiness  — readiness: critical dependencies are reachable (Postgres, Redis)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
}
