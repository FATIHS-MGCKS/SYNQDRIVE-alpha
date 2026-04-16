import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { MqttClient } from 'mqtt';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityTelemetryAppIngestionService } from './high-mobility-telemetry-app-ingestion.service';
import { HighMobilityTelemetryRoutingService } from './high-mobility-telemetry-routing.service';
import { createHmMqttClient, extractMessageId } from './high-mobility-mqtt-base';
import { HighMobilityMqttV2Service } from './high-mobility-mqtt-v2.service';

/**
 * HighMobilityTelemetryAppMqttConsumerService
 *
 * MQTT V2 consumer for the HM Telemetry-APP container.
 * Uses HM_TELEMETRY_APP_MQTT_* credentials and certificate paths exclusively.
 *
 * DOMAIN RULES:
 * - Only starts if HM_TELEMETRY_APP_MQTT_ENABLED=true and all certs are present
 * - QoS 1, MQTTv5, mTLS from file paths
 * - clientId and topic from HM Telemetry-APP snippet
 * - Message deduplication via message_id in telemetry-app ingestion service
 * - No shared state with HealthAppMqttConsumerService
 */
@Injectable()
export class HighMobilityTelemetryAppMqttConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HighMobilityTelemetryAppMqttConsumerService.name);
  private client: MqttClient | null = null;

  constructor(
    private readonly hmConfig: HighMobilityAppConfigService,
    private readonly streamConfig: HighMobilityStreamConfigService,
    private readonly ingestion: HighMobilityTelemetryAppIngestionService,
    private readonly routing: HighMobilityTelemetryRoutingService,
    private readonly mqttV2: HighMobilityMqttV2Service,
  ) {}

  async onModuleInit() {
    const strict = process.env.HM_MQTT_V2_STRICT_TRANSPORT === 'true';
    const enabled = this.hmConfig.telemetryApp.mqtt.enabled;
    const configReady = this.hmConfig.isTelemetryAppMqttReady();
    const mqtt = this.hmConfig.telemetryApp.mqtt;

    // ── Startup summary ────────────────────────────────────────────────────────
    // Always logged so operators can confirm the telemetry side is intentionally
    // disabled without having to look up the env file.
    if (!enabled) {
      this.logger.log(
        '[HM Telemetry-APP] Startup summary | MQTT_ENABLED=false | ' +
          'Telemetry consumer intentionally disabled — no connection will be made. ' +
          'Set HM_TELEMETRY_APP_MQTT_ENABLED=true and provide full config + certs to activate.',
      );
      return;
    }

    // Telemetry is enabled — report what we found in config
    this.logger.log(
      `[HM Telemetry-APP] Startup summary | MQTT_ENABLED=${enabled} | mqttReady=${configReady} | ` +
        `env=${this.hmConfig.telemetryApp.env} | host=${mqtt.host}:${mqtt.port} | ` +
        `topic=${mqtt.topic || '(not set)'} | clientId=${mqtt.clientId || '(not set)'}`,
    );

    // Cert path existence check
    const caPth = mqtt.caCertPath ? path.resolve(mqtt.caCertPath) : null;
    const certPth = mqtt.clientCertPath ? path.resolve(mqtt.clientCertPath) : null;
    const keyPth = mqtt.clientKeyPath ? path.resolve(mqtt.clientKeyPath) : null;
    const caOk = caPth ? fs.existsSync(caPth) : false;
    const certOk = certPth ? fs.existsSync(certPth) : false;
    const keyOk = keyPth ? fs.existsSync(keyPth) : false;

    this.logger.log(
      `[HM Telemetry-APP] Cert check | ca=${caPth ?? '(not set)'} [${caOk ? 'EXISTS' : 'MISSING'}] | ` +
        `cert=${certPth ?? '(not set)'} [${certOk ? 'EXISTS' : 'MISSING'}] | ` +
        `key=${keyPth ?? '(not set)'} [${keyOk ? 'EXISTS' : 'MISSING'}]`,
    );

    if (strict && !configReady) {
      throw new Error(
        '[HM Telemetry-APP] MQTT is enabled but configuration is incomplete — set all HM_TELEMETRY_APP_MQTT_* vars ' +
          'or disable HM_TELEMETRY_APP_MQTT_ENABLED (HM_MQTT_V2_STRICT_TRANSPORT=true).',
      );
    }

    if (!this.streamConfig.isMqttReadyToConnect('telemetryApp')) {
      this.logger.warn(
        '[HM Telemetry-APP] MQTT_ENABLED=true but configuration is incomplete or cert files missing — ' +
          'verify HM_TELEMETRY_APP_MQTT_APP_ID, MQTT_CLIENT_ID, MQTT_TOPIC, and cert paths. ' +
          'Telemetry consumer will not start.',
      );
      return;
    }

    this.logger.log('[HM Telemetry-APP] MQTT configuration ready — starting consumer');
    this.startConsumer();
  }

  async onModuleDestroy() {
    if (!this.client) return;
    return new Promise<void>((resolve) => {
      this.client!.end(false, {}, () => {
        this.logger.log('[HM Telemetry-APP] MQTT consumer disconnected cleanly');
        resolve();
      });
    });
  }

  getConnectionState(): string {
    if (!this.client) return 'DISCONNECTED';
    if (this.client.connected) return 'CONNECTED';
    return 'DISCONNECTED';
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.streamConfig.isMqttEnabled('telemetryApp')) {
      return { success: false, message: '[HM Telemetry-APP] MQTT disabled' };
    }
    if (!this.streamConfig.isCertConfigured('telemetryApp')) {
      return { success: false, message: '[HM Telemetry-APP] Certificate files not configured or missing' };
    }
    if (this.client?.connected) {
      const { host, port } = this.hmConfig.telemetryApp.mqtt;
      return { success: true, message: `[HM Telemetry-APP] Connected to ${host}:${port}` };
    }
    return { success: false, message: '[HM Telemetry-APP] Not connected' };
  }

  private startConsumer(): void {
    const strict = process.env.HM_MQTT_V2_STRICT_TRANSPORT === 'true';
    const loaded = this.streamConfig.loadCertFiles('telemetryApp');
    if (!loaded) {
      const msg = 'Certificate files could not be loaded';
      this.mqttV2.markTlsLoadFailed('telemetryApp', msg);
      this.logger.error(`[HM Telemetry-APP] Failed to load cert files — consumer will not start`);
      void this.streamConfig.upsertConsumerState('telemetryApp', {
        connectionState: 'ERROR', lastErrorAt: new Date(), lastErrorMessage: msg,
      });
      if (strict) {
        throw new Error(`[HM Telemetry-APP] ${msg} (HM_MQTT_V2_STRICT_TRANSPORT=true)`);
      }
      return;
    }

    const { ca, cert, key, resolvedPaths } = loaded;
    this.mqttV2.markTlsLoadOk('telemetryApp');

    this.client = createHmMqttClient({
      streamApp: 'telemetryApp',
      hmEnv: this.hmConfig.telemetryApp.env,
      mqttReady: this.hmConfig.isTelemetryAppMqttReady(),
      mqttV2: this.mqttV2,
      label: 'HM Telemetry-APP',
      cfg: this.hmConfig.telemetryApp.mqtt,
      certs: { ca, cert, key },
      resolvedCertPaths: resolvedPaths,
      onMessage: async (topic, payload) => {
        const messageId = extractMessageId(topic, payload);
        const normalized = await this.ingestion.ingest({ messageId, topic, payload, receivedAt: new Date() });
        if (normalized) {
          await this.routing.route(normalized);
        }
      },
      onStateChange: async (state, extra) => {
        await this.streamConfig.upsertConsumerState('telemetryApp', {
          connectionState: state as any,
          ...(extra?.connectedAt ? { lastConnectedAt: extra.connectedAt } : {}),
          ...(extra?.messageAt ? { lastMessageAt: extra.messageAt } : {}),
          ...(extra?.error ? { lastErrorAt: new Date(), lastErrorMessage: extra.error } : {}),
        });
      },
    });

    void this.streamConfig.upsertConsumerState('telemetryApp', { connectionState: 'CONNECTING' });
  }
}
