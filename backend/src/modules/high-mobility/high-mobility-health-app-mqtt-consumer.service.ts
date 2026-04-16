import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { MqttClient } from 'mqtt';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityHealthAppIngestionService } from './high-mobility-health-app-ingestion.service';
import { HighMobilityTelemetryRoutingService } from './high-mobility-telemetry-routing.service';
import { createHmMqttClient, extractMessageId } from './high-mobility-mqtt-base';
import { HighMobilityMqttV2Service } from './high-mobility-mqtt-v2.service';

/**
 * HighMobilityHealthAppMqttConsumerService
 *
 * MQTT V2 consumer for the HM Health-APP container.
 * Uses HM_HEALTH_APP_MQTT_* credentials and certificate paths exclusively.
 *
 * DOMAIN RULES:
 * - Only starts if HM_HEALTH_APP_MQTT_ENABLED=true and all certs are present
 * - QoS 1, MQTTv5, mTLS from file paths
 * - clientId and topic from HM Health-APP snippet
 * - Message deduplication via message_id in health-app ingestion service
 * - No shared state with TelemetryAppMqttConsumerService
 */
@Injectable()
export class HighMobilityHealthAppMqttConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HighMobilityHealthAppMqttConsumerService.name);
  private client: MqttClient | null = null;

  constructor(
    private readonly hmConfig: HighMobilityAppConfigService,
    private readonly streamConfig: HighMobilityStreamConfigService,
    private readonly ingestion: HighMobilityHealthAppIngestionService,
    private readonly routing: HighMobilityTelemetryRoutingService,
    private readonly mqttV2: HighMobilityMqttV2Service,
  ) {}

  async onModuleInit() {
    const strict = process.env.HM_MQTT_V2_STRICT_TRANSPORT === 'true';
    const enabled = this.hmConfig.healthApp.mqtt.enabled;
    const configReady = this.hmConfig.isHealthAppMqttReady();
    const mqtt = this.hmConfig.healthApp.mqtt;

    // ── Startup summary (always emitted so operators can confirm state without guessing) ──
    this.logger.log(
      `[HM Health-APP] Startup summary | MQTT_ENABLED=${enabled} | mqttReady=${configReady} | ` +
        `env=${this.hmConfig.healthApp.env} | host=${mqtt.host}:${mqtt.port} | ` +
        `topic=${mqtt.topic || '(not set)'} | clientId=${mqtt.clientId || '(not set)'}`,
    );

    // Cert path existence check (informational — also runs inside startConsumer if we proceed)
    if (enabled) {
      const caPth = mqtt.caCertPath ? path.resolve(mqtt.caCertPath) : null;
      const certPth = mqtt.clientCertPath ? path.resolve(mqtt.clientCertPath) : null;
      const keyPth = mqtt.clientKeyPath ? path.resolve(mqtt.clientKeyPath) : null;
      const caOk = caPth ? fs.existsSync(caPth) : false;
      const certOk = certPth ? fs.existsSync(certPth) : false;
      const keyOk = keyPth ? fs.existsSync(keyPth) : false;

      this.logger.log(
        `[HM Health-APP] Cert check | ca=${caPth ?? '(not set)'} [${caOk ? 'EXISTS' : 'MISSING'}] | ` +
          `cert=${certPth ?? '(not set)'} [${certOk ? 'EXISTS' : 'MISSING'}] | ` +
          `key=${keyPth ?? '(not set)'} [${keyOk ? 'EXISTS' : 'MISSING'}]`,
      );

      if (!caOk || !certOk || !keyOk) {
        this.logger.warn(
          '[HM Health-APP] One or more cert files are missing. MQTT will not connect. ' +
            'Place the three .pem files from the HM Health console under certs/hm-health-app/',
        );
      }
    }

    if (strict && enabled && !configReady) {
      throw new Error(
        '[HM Health-APP] MQTT is enabled but configuration is incomplete — set all HM_HEALTH_APP_MQTT_* vars ' +
          'or disable HM_HEALTH_APP_MQTT_ENABLED (HM_MQTT_V2_STRICT_TRANSPORT=true).',
      );
    }

    if (!this.streamConfig.isMqttReadyToConnect('healthApp')) {
      if (enabled) {
        this.logger.warn(
          '[HM Health-APP] MQTT_ENABLED=true but configuration is incomplete or cert files missing — ' +
            'verify HM_HEALTH_APP_MQTT_APP_ID, MQTT_CLIENT_ID, MQTT_TOPIC, and cert paths',
        );
      } else {
        this.logger.log('[HM Health-APP] MQTT consumer disabled (HM_HEALTH_APP_MQTT_ENABLED=false) — skipping startup');
      }
      return;
    }

    this.logger.log('[HM Health-APP] MQTT configuration ready — starting consumer');
    this.startConsumer();
  }

  async onModuleDestroy() {
    if (!this.client) return;
    return new Promise<void>((resolve) => {
      this.client!.end(false, {}, () => {
        this.logger.log('[HM Health-APP] MQTT consumer disconnected cleanly');
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
    if (!this.streamConfig.isMqttEnabled('healthApp')) {
      return { success: false, message: '[HM Health-APP] MQTT disabled' };
    }
    if (!this.streamConfig.isCertConfigured('healthApp')) {
      return { success: false, message: '[HM Health-APP] Certificate files not configured or missing' };
    }
    if (this.client?.connected) {
      const { host, port } = this.hmConfig.healthApp.mqtt;
      return { success: true, message: `[HM Health-APP] Connected to ${host}:${port}` };
    }
    return { success: false, message: '[HM Health-APP] Not connected' };
  }

  private startConsumer(): void {
    const strict = process.env.HM_MQTT_V2_STRICT_TRANSPORT === 'true';
    const loaded = this.streamConfig.loadCertFiles('healthApp');
    if (!loaded) {
      const msg = 'Certificate files could not be loaded';
      this.mqttV2.markTlsLoadFailed('healthApp', msg);
      this.logger.error(`[HM Health-APP] Failed to load cert files — consumer will not start`);
      void this.streamConfig.upsertConsumerState('healthApp', {
        connectionState: 'ERROR', lastErrorAt: new Date(), lastErrorMessage: msg,
      });
      if (strict) {
        throw new Error(`[HM Health-APP] ${msg} (HM_MQTT_V2_STRICT_TRANSPORT=true)`);
      }
      return;
    }

    const { ca, cert, key, resolvedPaths } = loaded;
    this.mqttV2.markTlsLoadOk('healthApp');

    this.client = createHmMqttClient({
      streamApp: 'healthApp',
      hmEnv: this.hmConfig.healthApp.env,
      mqttReady: this.hmConfig.isHealthAppMqttReady(),
      mqttV2: this.mqttV2,
      label: 'HM Health-APP',
      cfg: this.hmConfig.healthApp.mqtt,
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
        await this.streamConfig.upsertConsumerState('healthApp', {
          connectionState: state as any,
          ...(extra?.connectedAt ? { lastConnectedAt: extra.connectedAt } : {}),
          ...(extra?.messageAt ? { lastMessageAt: extra.messageAt } : {}),
          ...(extra?.error ? { lastErrorAt: new Date(), lastErrorMessage: extra.error } : {}),
        });
      },
    });

    void this.streamConfig.upsertConsumerState('healthApp', { connectionState: 'CONNECTING' });
  }
}
