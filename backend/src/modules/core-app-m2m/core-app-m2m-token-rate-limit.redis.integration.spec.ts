import IORedis from 'ioredis';
import RedisMemoryServer from 'redis-memory-server';
import { UnauthorizedException } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import { CoreAppM2mRateLimitedException } from './core-app-m2m-rate-limit.errors';
import { CORE_APP_M2M_RATE_LIMIT_REDIS_KEY_PREFIX } from './core-app-m2m-rate-limit.redis-script';
import { resolveCoreAppM2mRateLimitWindowMs } from './core-app-m2m-rate-limit.config';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';

const LIVE = process.env.RUN_CORE_APP_M2M_REDIS_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Core app M2M token rate limit — disposable Redis integration',
  () => {
    jest.setTimeout(30_000);
    let memoryServer: RedisMemoryServer;
    let host: string;
    let port: number;
    let redisA: RedisService;
    let redisB: RedisService;
    const envBackup = { ...process.env };

    beforeAll(async () => {
      memoryServer = new RedisMemoryServer();
      await memoryServer.start();
      host = await memoryServer.getHost();
      port = await memoryServer.getPort();

      process.env.CORE_APP_M2M_ENABLED = 'true';
      process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '3';
      process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '100';
      process.env.CORE_APP_M2M_RATE_LIMIT_WINDOW_SECONDS = '2';
      process.env.CORE_APP_M2M_RATE_LIMIT_REDIS_TIMEOUT_MS = '2000';

      redisA = new RedisService({ host, port, password: undefined, db: 0 } as never);
      redisB = new RedisService({ host, port, password: undefined, db: 0 } as never);
      await redisA.ping();
    }, 120_000);

    afterAll(async () => {
      await redisA?.quit();
      await redisB?.quit();
      await memoryServer?.stop();
      process.env = { ...envBackup };
    });

    beforeEach(async () => {
      await redisA.flushdb();
    });

    it('uses real Redis EVAL with two connections sharing counters', async () => {
      const replicaA = new CoreAppM2mTokenRateLimitService(redisA);
      const replicaB = new CoreAppM2mTokenRateLimitService(redisB);
      const input = { clientId: 'redis-integration-client', clientIp: '203.0.113.80' };

      await replicaA.assertBeforeTokenExchange(input);
      await replicaB.assertBeforeTokenExchange(input);
      await replicaA.assertBeforeTokenExchange(input);
      await expect(replicaB.assertBeforeTokenExchange(input)).rejects.toBeInstanceOf(
        CoreAppM2mRateLimitedException,
      );
    });

    it(
      'allows traffic again after fixed window bucket rolls forward',
      async () => {
      process.env.CORE_APP_M2M_RATE_LIMIT_WINDOW_SECONDS = '1';
      process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '1';
      const service = new CoreAppM2mTokenRateLimitService(redisA);
      const input = { clientId: 'ttl-client', clientIp: '203.0.113.81' };

      await service.assertBeforeTokenExchange(input);
      await expect(service.assertBeforeTokenExchange(input)).rejects.toBeInstanceOf(
        CoreAppM2mRateLimitedException,
      );

      const windowMs = resolveCoreAppM2mRateLimitWindowMs();
      const waitMs = windowMs - (Date.now() % windowMs) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      await expect(service.assertBeforeTokenExchange(input)).resolves.toBeUndefined();
      },
      15_000,
    );

    it('concurrent requests across replicas respect atomic limit', async () => {
      process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '4';
      const replicaA = new CoreAppM2mTokenRateLimitService(redisA);
      const replicaB = new CoreAppM2mTokenRateLimitService(redisB);
      const input = { clientId: 'concurrent-client', clientIp: '203.0.113.82' };

      const attempts = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          (i % 2 === 0 ? replicaA : replicaB).assertBeforeTokenExchange(input),
        ),
      );
      const allowed = attempts.filter((r) => r.status === 'fulfilled').length;
      const limited = attempts.filter(
        (r) => r.status === 'rejected' && r.reason instanceof CoreAppM2mRateLimitedException,
      ).length;
      expect(allowed).toBe(4);
      expect(limited).toBe(2);
    });

    it('uses isolated key namespace only under synqdrive:core-app-m2m:rl', async () => {
      const raw = new IORedis({ host, port, maxRetriesPerRequest: null });
      const keys = await raw.keys(`${CORE_APP_M2M_RATE_LIMIT_REDIS_KEY_PREFIX}:*`);
      expect(keys.every((k) => k.startsWith(CORE_APP_M2M_RATE_LIMIT_REDIS_KEY_PREFIX))).toBe(true);
      await raw.quit();
    });
  },
);

if (!LIVE) {
  describe('Core app M2M token rate limit — disposable Redis integration', () => {
    it('skipped unless RUN_CORE_APP_M2M_REDIS_INTEGRATION=1', () => {
      expect(process.env.RUN_CORE_APP_M2M_REDIS_INTEGRATION).not.toBe('1');
    });
  });
}