import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';

/**
 * GlobalGuardsModule — provides all platform security guards globally.
 *
 * Marking this module as @Global() makes all its exports injectable
 * in any feature module without needing explicit imports. This is the
 * correct pattern for shared infrastructure guards.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [OrgScopingGuard, VehicleOwnershipGuard],
  exports: [OrgScopingGuard, VehicleOwnershipGuard],
})
export class SharedGuardsModule {}
