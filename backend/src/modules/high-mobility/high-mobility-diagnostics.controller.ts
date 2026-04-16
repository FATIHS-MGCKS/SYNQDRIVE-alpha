import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { HighMobilityHealthAppMqttConsumerService } from './high-mobility-health-app-mqtt-consumer.service';
import { HighMobilityTelemetryAppMqttConsumerService } from './high-mobility-telemetry-app-mqtt-consumer.service';
import { HighMobilityHealthAppIngestionService } from './high-mobility-health-app-ingestion.service';
import { HighMobilityTelemetryAppIngestionService } from './high-mobility-telemetry-app-ingestion.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import { HighMobilityMqttV2Service } from './high-mobility-mqtt-v2.service';

/**
 * HM Diagnostics Controller
 *
 * Provides MQTT connection and stream log diagnostic endpoints for both
 * HM Health-APP and HM Telemetry-APP containers.
 *
 * Routes:
 *   GET /integrations/hm-health-app/mqtt/status
 *   GET /integrations/hm-health-app/stream/logs
 *   GET /integrations/hm-telemetry-app/mqtt/status
 *   GET /integrations/hm-telemetry-app/stream/logs
 *   GET /integrations/hm/readiness   — dual-app combined readiness
 *   GET /integrations/hm-mqtt-v2/status — process-local MQTT V2 telemetry (debug)
 */
@Controller('integrations')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN', 'ADMIN')
export class HighMobilityDiagnosticsController {
  constructor(
    private readonly hmConfig: HighMobilityAppConfigService,
    private readonly streamConfig: HighMobilityStreamConfigService,
    private readonly healthConsumer: HighMobilityHealthAppMqttConsumerService,
    private readonly telemetryConsumer: HighMobilityTelemetryAppMqttConsumerService,
    private readonly healthIngestion: HighMobilityHealthAppIngestionService,
    private readonly telemetryIngestion: HighMobilityTelemetryAppIngestionService,
    private readonly mqttV2: HighMobilityMqttV2Service,
  ) {}

  /** GET /integrations/hm-health-app/mqtt/status */
  @Get('hm-health-app/mqtt/status')
  async getHealthAppMqttStatus() {
    const state = this.healthConsumer.getConnectionState();
    const consumerStatus = await this.streamConfig.getConsumerStatus('healthApp').catch(() => null);
    return {
      appContainer: 'HM_HEALTH_APP',
      mqttEnabled: this.hmConfig.healthApp.mqtt.enabled,
      mqttReady: this.hmConfig.isHealthAppMqttReady(),
      oauthEnabled: this.hmConfig.isHealthAppOAuthReady(),
      connectionState: state,
      consumerDbState: consumerStatus,
      runtime: this.mqttV2.getSnapshot('healthApp'),
      config: {
        host: this.hmConfig.healthApp.mqtt?.host ?? null,
        port: this.hmConfig.healthApp.mqtt?.port ?? null,
        topic: this.hmConfig.healthApp.mqtt?.topic ?? null,
        clientId: this.hmConfig.healthApp.mqtt?.clientId ?? null,
        consumerGroup: this.hmConfig.healthApp.mqtt?.consumerGroup ?? null,
        qos: this.hmConfig.healthApp.mqtt?.qos ?? null,
        disableCleanSession: this.hmConfig.healthApp.mqtt?.disableCleanSession ?? null,
        hmEnv: this.hmConfig.healthApp.env,
      },
    };
  }

  /** GET /integrations/hm-health-app/stream/logs */
  @Get('hm-health-app/stream/logs')
  async getHealthAppStreamLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('vin') vin?: string,
    @Query('status') status?: string,
  ) {
    return this.healthIngestion.getStreamLogs({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      vin: vin ?? undefined,
      ingestStatus: status ?? undefined,
    });
  }

  /** GET /integrations/hm-telemetry-app/mqtt/status */
  @Get('hm-telemetry-app/mqtt/status')
  async getTelemetryAppMqttStatus() {
    const state = this.telemetryConsumer.getConnectionState();
    const consumerStatus = await this.streamConfig.getConsumerStatus('telemetryApp').catch(() => null);
    return {
      appContainer: 'HM_TELEMETRY_APP',
      mqttEnabled: this.hmConfig.telemetryApp.mqtt.enabled,
      mqttReady: this.hmConfig.isTelemetryAppMqttReady(),
      oauthEnabled: this.hmConfig.isTelemetryAppOAuthReady(),
      connectionState: state,
      consumerDbState: consumerStatus,
      runtime: this.mqttV2.getSnapshot('telemetryApp'),
      config: {
        host: this.hmConfig.telemetryApp.mqtt?.host ?? null,
        port: this.hmConfig.telemetryApp.mqtt?.port ?? null,
        topic: this.hmConfig.telemetryApp.mqtt?.topic ?? null,
        clientId: this.hmConfig.telemetryApp.mqtt?.clientId ?? null,
        consumerGroup: this.hmConfig.telemetryApp.mqtt?.consumerGroup ?? null,
        qos: this.hmConfig.telemetryApp.mqtt?.qos ?? null,
        disableCleanSession: this.hmConfig.telemetryApp.mqtt?.disableCleanSession ?? null,
        hmEnv: this.hmConfig.telemetryApp.env,
      },
    };
  }

  /** GET /integrations/hm-mqtt-v2/status — combined MQTT V2 runtime (in-memory counters) */
  @Get('hm-mqtt-v2/status')
  getHmMqttV2Status() {
    return {
      healthApp: this.mqttV2.getSnapshot('healthApp'),
      telemetryApp: this.mqttV2.getSnapshot('telemetryApp'),
      hints: {
        broker: 'mqtt-v2.high-mobility.com:8883 (mqtts, TLS mutual auth)',
        strictTransport: process.env.HM_MQTT_V2_STRICT_TRANSPORT === 'true',
        note402:
          'HTTP 402 from HM REST usually means billing / plan — unrelated to MQTT socket connectivity.',
        note404:
          'HTTP 404 on vehicle command often means wrong vehicle reference — unrelated to MQTT subscription topic.',
      },
    };
  }

  /** GET /integrations/hm-telemetry-app/stream/logs */
  @Get('hm-telemetry-app/stream/logs')
  async getTelemetryAppStreamLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('vin') vin?: string,
    @Query('status') status?: string,
  ) {
    return this.telemetryIngestion.getStreamLogs({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      vin: vin ?? undefined,
      ingestStatus: status ?? undefined,
    });
  }

  /** GET /integrations/hm/readiness — combined dual-app readiness snapshot */
  @Get('hm/readiness')
  getHmReadiness() {
    return {
      healthApp: {
        appContainer: 'HM_HEALTH_APP',
        oauthReady: this.hmConfig.isHealthAppOAuthReady(),
        mqttReady: this.hmConfig.isHealthAppMqttReady(),
        certConfigured: this.streamConfig.isCertConfigured('healthApp'),
      },
      telemetryApp: {
        appContainer: 'HM_TELEMETRY_APP',
        oauthReady: this.hmConfig.isTelemetryAppOAuthReady(),
        mqttReady: this.hmConfig.isTelemetryAppMqttReady(),
        certConfigured: this.streamConfig.isCertConfigured('telemetryApp'),
      },
    };
  }
}
