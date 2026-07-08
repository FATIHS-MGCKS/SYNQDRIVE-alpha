import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { MetricsAuthGuard } from './metrics-auth.guard';

function makeContext(authHeader?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  } as any;
}

describe('MetricsAuthGuard', () => {
  const ORIGINAL_TOKEN = process.env.METRICS_BEARER_TOKEN;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_OPEN_DEV = process.env.METRICS_ALLOW_OPEN_IN_DEV;

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = ORIGINAL_TOKEN;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_OPEN_DEV === undefined) delete process.env.METRICS_ALLOW_OPEN_IN_DEV;
    else process.env.METRICS_ALLOW_OPEN_IN_DEV = ORIGINAL_OPEN_DEV;
  });

  it('requires bearer token when METRICS_BEARER_TOKEN is set', () => {
    process.env.METRICS_BEARER_TOKEN = 'secret-metrics-token';
    const guard = new MetricsAuthGuard();
    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
    expect(guard.canActivate(makeContext('Bearer secret-metrics-token'))).toBe(true);
  });

  it('returns 503 in production when token is not configured', () => {
    delete process.env.METRICS_BEARER_TOKEN;
    delete process.env.METRICS_ALLOW_OPEN_IN_DEV;
    process.env.NODE_ENV = 'production';
    const guard = new MetricsAuthGuard();
    expect(() => guard.canActivate(makeContext())).toThrow(ServiceUnavailableException);
  });

  it('returns 503 in staging when token is unset even if not production', () => {
    delete process.env.METRICS_BEARER_TOKEN;
    delete process.env.METRICS_ALLOW_OPEN_IN_DEV;
    process.env.NODE_ENV = 'staging';
    const guard = new MetricsAuthGuard();
    expect(() => guard.canActivate(makeContext())).toThrow(ServiceUnavailableException);
  });

  it('allows open access in development only when METRICS_ALLOW_OPEN_IN_DEV=true', () => {
    delete process.env.METRICS_BEARER_TOKEN;
    process.env.NODE_ENV = 'development';
    process.env.METRICS_ALLOW_OPEN_IN_DEV = 'true';
    const guard = new MetricsAuthGuard();
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('blocks development without explicit METRICS_ALLOW_OPEN_IN_DEV', () => {
    delete process.env.METRICS_BEARER_TOKEN;
    delete process.env.METRICS_ALLOW_OPEN_IN_DEV;
    process.env.NODE_ENV = 'development';
    const guard = new MetricsAuthGuard();
    expect(() => guard.canActivate(makeContext())).toThrow(ServiceUnavailableException);
  });

  it('rejects wrong bearer token when METRICS_BEARER_TOKEN is set', () => {
    process.env.METRICS_BEARER_TOKEN = 'secret-metrics-token';
    const guard = new MetricsAuthGuard();
    expect(() => guard.canActivate(makeContext('Bearer wrong'))).toThrow(
      UnauthorizedException,
    );
  });
});
