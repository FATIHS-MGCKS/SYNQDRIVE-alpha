import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetricsConfigShape } from '@config/metrics.config';
import {
  evaluateMetricsAccess,
  resolveMetricsClientIp,
} from './metrics-access.util';

/**
 * Protects GET /api/v1/metrics independently from JWT auth.
 * Scrapers use METRICS_TOKEN (Bearer or X-Metrics-Token), not user sessions.
 */
@Injectable()
export class MetricsAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();

    const metricsConfig = this.config.get<MetricsConfigShape>('metrics');
    if (!metricsConfig) {
      throw new NotFoundException();
    }

    const decision = evaluateMetricsAccess(metricsConfig, {
      clientIp: resolveMetricsClientIp({
        xForwardedFor: request.headers['x-forwarded-for'],
        remoteAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      }),
      authorizationHeader:
        typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : null,
      metricsTokenHeader:
        typeof request.headers['x-metrics-token'] === 'string'
          ? request.headers['x-metrics-token']
          : null,
    });

    if (decision.allowed) {
      return true;
    }

    if (decision.statusCode === 404) {
      throw new NotFoundException();
    }

    throw new ForbiddenException('Metrics access denied');
  }
}
