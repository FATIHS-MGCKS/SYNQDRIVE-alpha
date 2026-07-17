import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { PermissionsGuard } from './permissions.guard';
import { MasterBillingGuard } from './master-billing.guard';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';

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
  providers: [
    OrgScopingGuard,
    VehicleOwnershipGuard,
    PermissionsGuard,
    MasterBillingGuard,
    StationScopeGuard,
    StationScopeService,
    StationAccessScopeService,
  ],
  exports: [
    OrgScopingGuard,
    VehicleOwnershipGuard,
    PermissionsGuard,
    MasterBillingGuard,
    StationScopeGuard,
    StationScopeService,
    StationAccessScopeService,
  ],
})
export class SharedGuardsModule {}
