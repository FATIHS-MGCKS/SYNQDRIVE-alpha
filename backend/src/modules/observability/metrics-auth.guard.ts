import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Protects GET /api/v1/metrics with a static bearer token.
 *
 * Production: METRICS_BEARER_TOKEN must be set — otherwise the endpoint
 * returns 503 (never publicly scrapeable by accident).
 *
 * Development: when the token is unset, access is allowed for local debugging
 * only. Prometheus scrape configs should still send Authorization in prod.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly logger = new Logger(MetricsAuthGuard.name);
  private warnedOpenDev = false;

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_BEARER_TOKEN?.trim();

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'Metrics endpoint disabled: METRICS_BEARER_TOKEN is not configured',
        );
      }
      if (!this.warnedOpenDev) {
        this.warnedOpenDev = true;
        this.logger.warn(
          'METRICS_BEARER_TOKEN is unset — /metrics is open in non-production. Set a token before exposing this host.',
        );
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token === expected) {
      return true;
    }

    throw new UnauthorizedException('Invalid or missing metrics bearer token');
  }
}
