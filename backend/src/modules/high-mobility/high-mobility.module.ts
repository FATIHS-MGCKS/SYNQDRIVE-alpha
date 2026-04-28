import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import highMobilityConfig from '@config/high-mobility.config';
import { VehicleProviderConsentService } from '@modules/vehicles/vehicle-provider-consent.service';

// ── Shared config service ──────────────────────────────────────────────────
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';

// ── HM Health-APP services ─────────────────────────────────────────────────
import { HighMobilityHealthAppAuthService } from './high-mobility-health-app-auth.service';
import { HighMobilityHealthAppIngestionService } from './high-mobility-health-app-ingestion.service';
import { HighMobilityHealthAppMqttConsumerService } from './high-mobility-health-app-mqtt-consumer.service';
import { HighMobilityHealthFetchService } from './high-mobility-health-fetch.service';

// ── HM Telemetry-APP services ──────────────────────────────────────────────
import { HighMobilityTelemetryAppAuthService } from './high-mobility-telemetry-app-auth.service';
import { HighMobilityTelemetryAppFleetService } from './high-mobility-telemetry-app-fleet.service';
import { HighMobilityTelemetryAppIngestionService } from './high-mobility-telemetry-app-ingestion.service';
import { HighMobilityTelemetryAppMqttConsumerService } from './high-mobility-telemetry-app-mqtt-consumer.service';

// ── Shared / legacy services (backward-compat wrappers and shared infra) ────
import { HighMobilityAuthService } from './high-mobility-auth.service';
import { HighMobilityEligibilityService } from './high-mobility-eligibility.service';
import { HighMobilityFleetService } from './high-mobility-fleet.service';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityWebhookService } from './high-mobility-webhook.service';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityMqttConsumerService } from './high-mobility-mqtt-consumer.service';
import { HighMobilityMqttV2Service } from './high-mobility-mqtt-v2.service';
import { HighMobilityTelemetryIngestionService } from './high-mobility-telemetry-ingestion.service';
import { HighMobilityTelemetryRoutingService } from './high-mobility-telemetry-routing.service';
import { HmVehicleActivationService } from './high-mobility-vehicle-activation.service';
import { HmSignalUsageService } from './high-mobility-signal-usage.service';

// ── Controllers ────────────────────────────────────────────────────────────
import { HighMobilityAdminController } from './high-mobility-admin.controller';
import { HighMobilityWebhookController } from './high-mobility-webhook.controller';
import { HighMobilityVehicleRegisterController } from './high-mobility-vehicle-register.controller';
import { HighMobilityDiagnosticsController } from './high-mobility-diagnostics.controller';

// ── Compatibility intelligence (V4.6.77) ───────────────────────────────────
import { HighMobilityCompatibilityController } from './compatibility/hm-compatibility.controller';
import { HighMobilityCompatibilityService } from './compatibility/hm-compatibility.service';

@Module({
  imports: [ConfigModule.forFeature(highMobilityConfig)],
  controllers: [
    HighMobilityAdminController,
    HighMobilityWebhookController,
    HighMobilityVehicleRegisterController,
    HighMobilityDiagnosticsController,
    HighMobilityCompatibilityController,
  ],
  providers: [
    // ── Consent / audit infrastructure ────────────────────────────────────
    VehicleProviderConsentService,

    // ── Central config ────────────────────────────────────────────────────
    HighMobilityAppConfigService,

    // ── HM Health-APP ─────────────────────────────────────────────────────
    HighMobilityHealthAppAuthService,
    HighMobilityHealthAppIngestionService,
    HighMobilityHealthAppMqttConsumerService,
    HighMobilityHealthFetchService,

    // ── HM Telemetry-APP ──────────────────────────────────────────────────
    HighMobilityTelemetryAppAuthService,
    HighMobilityTelemetryAppFleetService,
    HighMobilityTelemetryAppIngestionService,
    HighMobilityTelemetryAppMqttConsumerService,

    // ── Shared / backward-compat ──────────────────────────────────────────
    HighMobilityAuthService,
    HighMobilityEligibilityService,
    HighMobilityFleetService,
    HighMobilityVehicleLinkService,
    HighMobilityWebhookService,
    HighMobilityRegistrationService,
    HighMobilityStreamConfigService,
    HighMobilityMqttV2Service,
    HighMobilityTelemetryIngestionService,
    HighMobilityTelemetryRoutingService,
    HighMobilityMqttConsumerService,
    HmVehicleActivationService,
    HmSignalUsageService,

    // ── Compatibility intelligence (V4.6.77) ──────────────────────────────
    HighMobilityCompatibilityService,
  ],
  exports: [
    HighMobilityAppConfigService,
    HighMobilityHealthAppAuthService,
    HighMobilityTelemetryAppAuthService,
    HighMobilityVehicleLinkService,
    HighMobilityHealthFetchService,
    HighMobilityFleetService,
    HighMobilityTelemetryAppFleetService,
    HighMobilityRegistrationService,
    HighMobilityStreamConfigService,
    HighMobilityTelemetryIngestionService,
    HighMobilityHealthAppIngestionService,
    HighMobilityTelemetryAppIngestionService,
    HmVehicleActivationService,
    HmSignalUsageService,
    HighMobilityCompatibilityService,
    // Legacy compat
    HighMobilityAuthService,
  ],
})
export class HighMobilityModule {}
