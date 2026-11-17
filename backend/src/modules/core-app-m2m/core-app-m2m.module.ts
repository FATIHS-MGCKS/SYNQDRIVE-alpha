import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';

/**
 * P3-PR1 foundation: registry validation only — no HTTP controllers, token exchange, or guards.
 */
@Module({
  imports: [PrismaModule],
  providers: [CoreAppServiceRegistryService],
  exports: [CoreAppServiceRegistryService],
})
export class CoreAppM2mModule {}