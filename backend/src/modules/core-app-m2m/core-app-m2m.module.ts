import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { assertCoreAppM2mRateLimitConfigConsistent } from './core-app-m2m-rate-limit.config';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';
import { CoreAppM2mTokenController } from './core-app-m2m-token.controller';

/**
 * P3-PR2 token exchange + P3-PR3 Redis rate limits (fail-closed when M2M enabled).
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [CoreAppM2mTokenController],
  providers: [
    CoreAppServiceRegistryService,
    CoreAppM2mTokenExchangeService,
    CoreAppM2mTokenRateLimitService,
  ],
  exports: [
    CoreAppServiceRegistryService,
    CoreAppM2mTokenExchangeService,
    CoreAppM2mTokenRateLimitService,
  ],
})
export class CoreAppM2mModule implements OnModuleInit {
  onModuleInit(): void {
    assertCoreAppM2mRateLimitConfigConsistent();
  }
}