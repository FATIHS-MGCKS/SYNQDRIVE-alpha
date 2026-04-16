import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HmAppConfig, HmDualAppConfig } from '@config/high-mobility.config';

/**
 * HighMobilityAppConfigService
 *
 * Central typed configuration accessor for the two HM app-container integrations.
 *
 * ARCHITECTURE RULE: All HM services must obtain config exclusively through this
 * service and never read `HM_*` env vars directly. This guarantees that
 * Health-APP and Telemetry-APP credentials are never accidentally mixed.
 */
@Injectable()
export class HighMobilityAppConfigService {
  constructor(private readonly configService: ConfigService) {}

  private get dual(): HmDualAppConfig {
    return this.configService.get<HmDualAppConfig>('highMobility')!;
  }

  /** Config for the HM Health-APP container */
  get healthApp(): HmAppConfig {
    return this.dual.healthApp;
  }

  /** Config for the HM Telemetry-APP container */
  get telemetryApp(): HmAppConfig {
    return this.dual.telemetryApp;
  }

  isHealthAppOAuthReady(): boolean {
    return this.healthApp.oauthReady;
  }

  isHealthAppMqttReady(): boolean {
    return this.healthApp.mqttReady;
  }

  isTelemetryAppOAuthReady(): boolean {
    return this.telemetryApp.oauthReady;
  }

  isTelemetryAppMqttReady(): boolean {
    return this.telemetryApp.mqttReady;
  }
}
