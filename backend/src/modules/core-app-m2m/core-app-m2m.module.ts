import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { assertCoreAppM2mRateLimitConfigConsistent } from './core-app-m2m-rate-limit.config';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';
import { CoreAppM2mTokenController } from './core-app-m2m-token.controller';
import { CoreAppM2mJwtVerifyService } from './core-app-m2m-jwt-verify.service';
import { CoreAppM2mResourceAuthorizationService } from './core-app-m2m-resource-authorization.service';
import { CoreAppM2mJwtAuthGuard } from './core-app-m2m-jwt-auth.guard';
import { CoreReadVehiclesController } from './core-read/core-read-vehicles.controller';
import { CoreReadVehiclesService } from './core-read/core-read-vehicles.service';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { ProductVehicleAccessModule } from '@modules/products/product-vehicle-access/product-vehicle-access.module';
import { CoreAppServiceClientAdminController } from './admin/core-app-service-client.admin.controller';
import { CoreAppServiceClientAdminService } from './admin/core-app-service-client.admin.service';

/**
 * P3-PR2 token exchange + P3-PR3 Redis rate limits + P3-PR5 MA client administration.
 */
@Module({
  imports: [PrismaModule, RedisModule, ProductVehicleAccessModule, ActivityLogModule],
  controllers: [
    CoreAppM2mTokenController,
    CoreReadVehiclesController,
    CoreAppServiceClientAdminController,
  ],
  providers: [
    CoreAppServiceClientAdminService,
    CoreAppServiceRegistryService,
    CoreAppM2mTokenExchangeService,
    CoreAppM2mTokenRateLimitService,
    CoreAppM2mJwtVerifyService,
    CoreAppM2mResourceAuthorizationService,
    CoreAppM2mJwtAuthGuard,
    CoreReadVehiclesService,
  ],
  exports: [
    CoreAppServiceRegistryService,
    CoreAppM2mTokenExchangeService,
    CoreAppM2mTokenRateLimitService,
    CoreAppM2mJwtVerifyService,
    CoreAppM2mJwtAuthGuard,
    CoreReadVehiclesService,
  ],
})
export class CoreAppM2mModule implements OnModuleInit {
  onModuleInit(): void {
    assertCoreAppM2mRateLimitConfigConsistent();
  }
}