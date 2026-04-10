import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import highMobilityConfig from '@config/high-mobility.config';

// Phase 1 services
import { HighMobilityAuthService } from './high-mobility-auth.service';
import { HighMobilityEligibilityService } from './high-mobility-eligibility.service';
import { HighMobilityFleetService } from './high-mobility-fleet.service';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityHealthFetchService } from './high-mobility-health-fetch.service';
import { HighMobilityWebhookService } from './high-mobility-webhook.service';

// Phase 2 services
import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityMqttConsumerService } from './high-mobility-mqtt-consumer.service';
import { HighMobilityTelemetryIngestionService } from './high-mobility-telemetry-ingestion.service';
import { HighMobilityTelemetryRoutingService } from './high-mobility-telemetry-routing.service';

// Phase 3 services
import { HmVehicleActivationService } from './high-mobility-vehicle-activation.service';
import { HmSignalUsageService } from './high-mobility-signal-usage.service';

// Controllers
import { HighMobilityAdminController } from './high-mobility-admin.controller';
import { HighMobilityWebhookController } from './high-mobility-webhook.controller';
import { HighMobilityVehicleRegisterController } from './high-mobility-vehicle-register.controller';

@Module({
  imports: [ConfigModule.forFeature(highMobilityConfig)],
  controllers: [
    HighMobilityAdminController,
    HighMobilityWebhookController,
    HighMobilityVehicleRegisterController,
  ],
  providers: [
    // Phase 1
    HighMobilityAuthService,
    HighMobilityEligibilityService,
    HighMobilityFleetService,
    HighMobilityVehicleLinkService,
    HighMobilityHealthFetchService,
    HighMobilityWebhookService,
    // Phase 2
    HighMobilityRegistrationService,
    HighMobilityStreamConfigService,
    HighMobilityTelemetryIngestionService,
    HighMobilityTelemetryRoutingService,
    HighMobilityMqttConsumerService,
    // Phase 3
    HmVehicleActivationService,
    HmSignalUsageService,
  ],
  exports: [
    HighMobilityVehicleLinkService,
    HighMobilityHealthFetchService,
    HighMobilityFleetService,
    HighMobilityRegistrationService,
    HighMobilityStreamConfigService,
    HighMobilityTelemetryIngestionService,
    // Phase 3
    HmVehicleActivationService,
    HmSignalUsageService,
  ],
})
export class HighMobilityModule {}
