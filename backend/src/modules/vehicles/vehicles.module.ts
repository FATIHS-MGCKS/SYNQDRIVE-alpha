import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleProviderConsentService } from './vehicle-provider-consent.service';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { DataAuthorizationsModule } from '../data-authorizations/data-authorizations.module';
import { TasksModule } from '../tasks/tasks.module';
import { BillingModule } from '../billing/billing.module';
import { VehicleBookingHandoverDiagnosticService } from './diagnostic/vehicle-booking-handover-diagnostic.service';
import { FLEET_STATUS_DERIVATION } from './diagnostic/fleet-status-derivation.port';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    DimoModule,
    forwardRef(() => VehicleIntelligenceModule),
    DataAuthorizationsModule,
    TasksModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    VehicleProviderConsentService,
    VehicleExteriorImagesService,
    VehicleBookingHandoverDiagnosticService,
    {
      provide: FLEET_STATUS_DERIVATION,
      useExisting: VehiclesService,
    },
  ],
  exports: [
    VehiclesService,
    VehicleProviderConsentService,
    VehicleExteriorImagesService,
    VehicleBookingHandoverDiagnosticService,
  ],
})
export class VehiclesModule {}
