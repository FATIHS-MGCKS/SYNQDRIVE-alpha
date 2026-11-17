import { UnauthorizedException } from '@nestjs/common';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { CoreAppM2mRateLimitedException } from './core-app-m2m-rate-limit.errors';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';
import { CoreAppM2mRateLimitMemoryRedis } from './testing/core-app-m2m-rate-limit.memory-redis';

describe('CoreAppM2mTokenRateLimitService', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function buildService(redis = new CoreAppM2mRateLimitMemoryRedis()) {
    return new CoreAppM2mTokenRateLimitService(redis as never);
  }

  it('skips enforcement when M2M runtime disabled', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    const redis = new CoreAppM2mRateLimitMemoryRedis();
    const failingRedis = {
      eval: jest.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const service = new CoreAppM2mTokenRateLimitService(failingRedis as never);
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'c1', clientIp: '203.0.113.1' }),
    ).resolves.toBeUndefined();
    expect(redis.snapshotCount('x')).toBe(0);
  });

  it('allows requests under per-client and per-ip limits', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '3';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '3';
    const service = buildService();
    for (let i = 0; i < 3; i += 1) {
      await expect(
        service.assertBeforeTokenExchange({ clientId: 'client-a', clientIp: '203.0.113.9' }),
      ).resolves.toBeUndefined();
    }
  });

  it('returns 429 when client limit exceeded', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '1';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '100';
    const service = buildService();
    await service.assertBeforeTokenExchange({ clientId: 'client-b', clientIp: '203.0.113.2' });
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'client-b', clientIp: '203.0.113.2' }),
    ).rejects.toBeInstanceOf(CoreAppM2mRateLimitedException);
  });

  it('counts invalid credential attempts toward client limits', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '1';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '100';
    const service = buildService();
    await service.assertBeforeTokenExchange({ clientId: 'unknown-client', clientIp: '203.0.113.3' });
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'unknown-client', clientIp: '203.0.113.3' }),
    ).rejects.toBeInstanceOf(CoreAppM2mRateLimitedException);
  });

  it('enforces per-ip limits across different client ids', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '100';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '2';
    const service = buildService();
    await service.assertBeforeTokenExchange({ clientId: 'c-one', clientIp: '198.51.100.4' });
    await service.assertBeforeTokenExchange({ clientId: 'c-two', clientIp: '198.51.100.4' });
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'c-three', clientIp: '198.51.100.4' }),
    ).rejects.toBeInstanceOf(CoreAppM2mRateLimitedException);
  });

  it('fail-closes when Redis is unavailable', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    const service = new CoreAppM2mTokenRateLimitService({
      eval: jest.fn(async () => {
        throw new Error('connection refused');
      }),
    } as never);
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'c', clientIp: '203.0.113.5' }),
    ).rejects.toMatchObject({
      response: { message: CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE },
    });
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'c', clientIp: '203.0.113.5' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('two service instances share one Redis counter (cross-replica)', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '2';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '100';
    const shared = new CoreAppM2mRateLimitMemoryRedis();
    const replicaA = new CoreAppM2mTokenRateLimitService(shared as never);
    const replicaB = new CoreAppM2mTokenRateLimitService(shared as never);

    await replicaA.assertBeforeTokenExchange({ clientId: 'shared-client', clientIp: '203.0.113.6' });
    await replicaB.assertBeforeTokenExchange({ clientId: 'shared-client', clientIp: '203.0.113.6' });
    await expect(
      replicaA.assertBeforeTokenExchange({ clientId: 'shared-client', clientIp: '203.0.113.6' }),
    ).rejects.toBeInstanceOf(CoreAppM2mRateLimitedException);
  });

  it('enforces limit on sixth sequential attempt (atomic window)', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '5';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '100';
    const service = buildService();
    for (let i = 0; i < 5; i += 1) {
      await service.assertBeforeTokenExchange({ clientId: 'burst-client', clientIp: '203.0.113.7' });
    }
    await expect(
      service.assertBeforeTokenExchange({ clientId: 'burst-client', clientIp: '203.0.113.7' }),
    ).rejects.toBeInstanceOf(CoreAppM2mRateLimitedException);
  });
});