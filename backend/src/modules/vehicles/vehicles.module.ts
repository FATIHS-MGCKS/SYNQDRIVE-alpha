import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleProviderConsentService } from './vehicle-provider-consent.service';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { FleetMapCacheService } from './fleet-map-cache.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { DataAuthorizationsModule } from '../data-authorizations/data-authorizations.module';
import { TasksModule } from '../tasks/tasks.module';
import { BillingModule } from '../billing/billing.module';
import { VehicleBookingHandoverDiagnosticService } from './diagnostic/vehicle-booking-handover-diagnostic.service';
import { VehicleBookingHandoverRepairService } from './diagnostic/vehicle-booking-handover-repair.service';
import { FLEET_STATUS_DERIVATION } from './diagnostic/fleet-status-derivation.port';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    ActivityLogModule,
    DimoModule,
    forwardRef(() => VehicleIntelligenceModule),
    DataAuthorizationsModule,
    TasksModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    FleetMapCacheService,
    VehicleProviderConsentService,
    VehicleExteriorImagesService,
    VehicleBookingHandoverDiagnosticService,
    VehicleBookingHandoverRepairService,
    {
      provide: FLEET_STATUS_DERIVATION,
      useExisting: VehiclesService,
    },
  ],
  exports: [
    VehiclesService,
    FleetMapCacheService,
    VehicleProviderConsentService,
    VehicleExteriorImagesService,
    VehicleBookingHandoverDiagnosticService,
    VehicleBookingHandoverRepairService,
  ],
})
export class VehiclesModule {}
