import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { FleetOperationalReadModelCacheService } from './cache/fleet-operational-read-model-cache.service';
import { VehicleRawStatusWriteService } from './vehicle-raw-status-write.service';
import { VehicleProviderConsentService } from './vehicle-provider-consent.service';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { DataAuthorizationsModule } from '../data-authorizations/data-authorizations.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    DimoModule,
    forwardRef(() => VehicleIntelligenceModule),
    DataAuthorizationsModule,
    TasksModule,
  ],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    FleetOperationalReadModelCacheService,
    VehicleRawStatusWriteService,
    VehicleProviderConsentService,
    VehicleExteriorImagesService,
  ],
  exports: [
    VehiclesService,
    FleetOperationalReadModelCacheService,
    VehicleRawStatusWriteService,
    VehicleProviderConsentService,
    VehicleExteriorImagesService,
  ],
})
export class VehiclesModule {}
