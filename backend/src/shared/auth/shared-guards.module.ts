import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { EffectiveAccessLoaderService } from './effective-access-loader.service';
import { PermissionsGuard } from './permissions.guard';
import { MasterBillingGuard } from './master-billing.guard';
import { StationAccessService } from '@shared/stations/station-access.service';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { ProductLicenseGuard } from '@shared/guards/product-license.guard';

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
    ProductLicenseGuard,
  ],
  exports: [
    EffectiveAccessLoaderService,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    PermissionsGuard,
    MasterBillingGuard,
    StationAccessService,
    StationScopeGuard,
    ProductLicenseGuard,
  ],
})
export class SharedGuardsModule {}
