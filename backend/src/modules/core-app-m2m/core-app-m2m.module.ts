import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mTokenController } from './core-app-m2m-token.controller';

/**
 * P3-PR2: disabled-by-default client credential token exchange + P3-PR1 registry validation.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CoreAppM2mTokenController],
  providers: [CoreAppServiceRegistryService, CoreAppM2mTokenExchangeService],
  exports: [CoreAppServiceRegistryService, CoreAppM2mTokenExchangeService],
})
export class CoreAppM2mModule {}