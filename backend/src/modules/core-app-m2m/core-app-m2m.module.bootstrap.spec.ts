import { Test } from '@nestjs/testing';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { CoreAppM2mModule } from './core-app-m2m.module';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { CoreAppM2mRateLimitMemoryRedis } from './testing/core-app-m2m-rate-limit.memory-redis';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';

describe('CoreAppM2mModule — DI bootstrap', () => {
  it('resolves registry and token exchange services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ coreAppServiceClient: { findUnique: jest.fn() } })
      .overrideProvider(RedisService)
      .useValue(new CoreAppM2mRateLimitMemoryRedis())
      .overrideProvider(MasterAdminAuditService)
      .useValue({ record: jest.fn() })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
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