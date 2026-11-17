import { Test } from '@nestjs/testing';
import { CoreAppM2mModule } from './core-app-m2m.module';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { CoreAppM2mRateLimitMemoryRedis } from './testing/core-app-m2m-rate-limit.memory-redis';

describe('CoreAppM2mModule — DI bootstrap', () => {
  it('resolves registry and token exchange services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ coreAppServiceClient: { findUnique: jest.fn() } })
      .overrideProvider(RedisService)
      .useValue(new CoreAppM2mRateLimitMemoryRedis())
      .compile();

    const registry = moduleRef.get(CoreAppServiceRegistryService);
    expect(registry).toBeInstanceOf(CoreAppServiceRegistryService);
    expect(moduleRef.get(CoreAppM2mTokenExchangeService)).toBeInstanceOf(
      CoreAppM2mTokenExchangeService,
    );
    expect(moduleRef.get(CoreAppM2mTokenRateLimitService)).toBeInstanceOf(
      CoreAppM2mTokenRateLimitService,
    );
    await moduleRef.close();
  });
});