import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { EffectiveAccessLoaderService } from './effective-access-loader.service';
import { PermissionsGuard } from './permissions.guard';
import { MasterBillingGuard } from './master-billing.guard';
import { StationAccessService } from '@shared/stations/station-access.service';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    EffectiveAccessLoaderService,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    PermissionsGuard,
    MasterBillingGuard,
    StationAccessService,
    StationScopeGuard,
  ],
  exports: [
    EffectiveAccessLoaderService,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    PermissionsGuard,
    MasterBillingGuard,
    StationAccessService,
    StationScopeGuard,
  ],
})
export class SharedGuardsModule {}
