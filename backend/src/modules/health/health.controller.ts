import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

/**
 * Health and readiness endpoints — publicly accessible, excluded from JWT auth.
 *
 * GET /health              — liveness: app process is alive (no dependency I/O)
 * GET /health/readiness    — hard dependencies for traffic routing (503 when not ready)
 * GET /health/dependencies — full application dependency map (all integrations)
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
  async readiness(@Res() res: Response) {
    const result = await this.healthService.checkReadiness();
    const statusCode = result.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json(result);
  }

  @Get('dependencies')
  async dependencies() {
    return this.healthService.checkApplicationHealth();
  }
}
