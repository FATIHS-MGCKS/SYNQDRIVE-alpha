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
 * Production / staging: METRICS_BEARER_TOKEN must be set — otherwise 503.
 *
 * Local development only: when METRICS_ALLOW_OPEN_IN_DEV=true and NODE_ENV is
 * not production, an unset token allows open access for debugging.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly logger = new Logger(MetricsAuthGuard.name);
  private warnedOpenDev = false;

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_BEARER_TOKEN?.trim();
    const isProduction = process.env.NODE_ENV === 'production';
    const allowOpenInDev =
      !isProduction && process.env.METRICS_ALLOW_OPEN_IN_DEV === 'true';

    if (!expected) {
      if (isProduction || !allowOpenInDev) {
        throw new ServiceUnavailableException(
          'Metrics endpoint disabled: METRICS_BEARER_TOKEN is not configured',
        );
      }
      if (!this.warnedOpenDev) {
        this.warnedOpenDev = true;
        this.logger.warn(
          'METRICS_ALLOW_OPEN_IN_DEV=true — /metrics is open without a bearer token. Do not use on shared/staging hosts.',
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
