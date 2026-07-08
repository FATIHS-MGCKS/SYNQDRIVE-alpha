import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsAccessGuard } from './metrics-access.guard';
import type { MetricsConfigShape } from '@config/metrics.config';

function makeGuard(config: MetricsConfigShape): MetricsAccessGuard {
  const configService = {
    get: (key: string) => (key === 'metrics' ? config : undefined),
  } as unknown as ConfigService;
  return new MetricsAccessGuard(configService);
}

function makeContext(headers: Record<string, string>, ip = '127.0.0.1') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        ip,
        socket: { remoteAddress: ip },
      }),
    }),
  } as any;
}

describe('MetricsAccessGuard', () => {
  it('throws NotFoundException when metrics are disabled', () => {
    const guard = makeGuard({
      enabled: false,
      requireToken: false,
      token: null,
      allowedIps: [],
    });
    expect(() => guard.canActivate(makeContext({}))).toThrow(NotFoundException);
  });

  it('throws ForbiddenException when token is required but absent', () => {
    const guard = makeGuard({
      enabled: true,
      requireToken: true,
      token: 'secret',
      allowedIps: [],
    });
    expect(() => guard.canActivate(makeContext({}))).toThrow(ForbiddenException);
  });

  it('allows scrape with valid Bearer token', () => {
    const guard = makeGuard({
      enabled: true,
      requireToken: true,
      token: 'secret',
      allowedIps: [],
    });
    expect(
      guard.canActivate(
        makeContext({ authorization: 'Bearer secret' }),
      ),
    ).toBe(true);
  });
});
