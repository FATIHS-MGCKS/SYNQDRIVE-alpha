import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { HighMobilityStreamConfigService } from './high-mobility-stream-config.service';
import { HighMobilityTelemetryIngestionService } from './high-mobility-telemetry-ingestion.service';
import { HighMobilityTelemetryRoutingService } from './high-mobility-telemetry-routing.service';

/**
 * Phase 2: HighMobilityMqttConsumerService
 *
 * MQTT V2 connection layer for High Mobility real-time telemetry streaming.
 *
 * Design constraints:
 * - Only connects if HM_MQTT_ENABLED=true AND all cert paths are configured
 * - Uses provider-issued mTLS certificates (server-side only, never in frontend)
 * - Reconnects automatically with configurable backoff
 * - Passes all received messages through ingestion pipeline (dedupe → normalize → route)
 * - Isolated from downstream business modules: no direct calls to scoring/health/trip engines
 * - Structured as a standalone service boundary so it can later be extracted as a separate worker
 *
 * DOMAIN RULE: Do not add business logic here. Keep it as infrastructure.
 */
@Injectable()
export class HighMobilityMqttConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HighMobilityMqttConsumerService.name);
  private client: MqttClient | null = null;
  private isConnecting = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly streamConfigService: HighMobilityStreamConfigService,
    private readonly ingestionService: HighMobilityTelemetryIngestionService,
    private readonly routingService: HighMobilityTelemetryRoutingService,
  ) {}

  private get mqttCfg() {
    return (this.configService.get('highMobility') as any).mqtt as {
      enabled: boolean;
      host: string;
      port: number;
      appId: string;
      topicPrefix: string;
      consumerGroup: string;
      disableCleanSession: boolean;
      reconnectPeriodMs: number;
      connectTimeoutMs: number;
    };
  }

  async onModuleInit() {
    if (!this.streamConfigService.isMqttReadyToConnect()) {
      const { enabled } = this.mqttCfg;
      if (enabled) {
        this.logger.warn(
          'MQTT consumer: HM_MQTT_ENABLED=true but configuration is incomplete — ' +
          'MQTT consumer will not start. Check APP_ID and certificate paths.',
        );
      } else {
        this.logger.log('MQTT consumer: disabled (HM_MQTT_ENABLED=false)');
      }
      return;
    }

    this.logger.log('MQTT consumer: configuration ready — starting connection');
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /** Public: get current connection status for admin API */
  getConnectionState(): string {
    if (!this.client) return 'DISCONNECTED';
    if (this.isConnecting) return 'CONNECTING';
    if (this.client.connected) return 'CONNECTED';
    return 'DISCONNECTED';
  }

  /** Public: attempt connection test (for admin test-connection endpoint) */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.streamConfigService.isMqttEnabled()) {
      return { success: false, message: 'MQTT is disabled (HM_MQTT_ENABLED=false)' };
    }
    if (!this.streamConfigService.isCertConfigured()) {
      return { success: false, message: 'MQTT certificate files are not configured or not found' };
    }
    if (this.client?.connected) {
      return { success: true, message: `Already connected to ${this.mqttCfg.host}:${this.mqttCfg.port}` };
    }
    return { success: false, message: 'Not connected — attempting reconnect. Check logs.' };
  }

  private async connect(): Promise<void> {
    if (this.isConnecting || this.client?.connected) return;
    this.isConnecting = true;

    const cfg = this.mqttCfg;
    const certs = this.streamConfigService.loadCertFiles();
    if (!certs) {
      this.logger.error('MQTT consumer: failed to load certificate files — aborting connection');
      this.isConnecting = false;
      await this.streamConfigService.upsertConsumerState({
        connectionState: 'ERROR',
        lastErrorAt: new Date(),
        lastErrorMessage: 'Certificate files could not be loaded',
      });
      return;
    }

    // Client ID format: <consumerGroup>-<appId>
    const clientId = `${cfg.consumerGroup}-${cfg.appId}`;

    const options: mqtt.IClientOptions = {
      host: cfg.host,
      port: cfg.port,
      protocol: 'mqtts',
      clientId,
      clean: !cfg.disableCleanSession,
      reconnectPeriod: cfg.reconnectPeriodMs,
      connectTimeout: cfg.connectTimeoutMs,
      ca: certs.ca,
      cert: certs.cert,
      key: certs.key,
      rejectUnauthorized: true,
    };

    await this.streamConfigService.upsertConsumerState({ connectionState: 'CONNECTING' });

    this.logger.log(`MQTT consumer: connecting to ${cfg.host}:${cfg.port} as ${clientId}`);

    this.client = mqtt.connect(options);

    this.client.on('connect', () => {
      this.isConnecting = false;
      this.logger.log(`MQTT consumer: connected to ${cfg.host}:${cfg.port}`);

      const topic = `${cfg.topicPrefix}/${cfg.appId}/#`;
      this.client!.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`MQTT consumer: subscription error for ${topic}: ${err.message}`);
        } else {
          this.logger.log(`MQTT consumer: subscribed to ${topic}`);
        }
      });

      this.streamConfigService.upsertConsumerState({
        connectionState: 'CONNECTED',
        lastConnectedAt: new Date(),
      }).catch(() => {});
    });

    this.client.on('message', async (topic, message) => {
      await this.handleMessage(topic, message);
    });

    this.client.on('error', async (err) => {
      this.logger.error(`MQTT consumer: error — ${err.message}`);
      await this.streamConfigService.upsertConsumerState({
        connectionState: 'ERROR',
        lastErrorAt: new Date(),
        lastErrorMessage: err.message,
      });
    });

    this.client.on('reconnect', () => {
      this.logger.log('MQTT consumer: reconnecting...');
      this.isConnecting = true;
      this.streamConfigService.upsertConsumerState({ connectionState: 'CONNECTING' }).catch(() => {});
    });

    this.client.on('disconnect', async () => {
      this.isConnecting = false;
      this.logger.warn('MQTT consumer: disconnected');
      await this.streamConfigService.upsertConsumerState({ connectionState: 'DISCONNECTED' });
    });

    this.client.on('close', () => {
      this.isConnecting = false;
      this.logger.debug('MQTT consumer: connection closed');
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const messageId = this.generateMessageId(topic, payload);

    try {
      const normalized = await this.ingestionService.ingest({
        messageId,
        topic,
        payload,
        receivedAt: new Date(),
      });

      if (normalized) {
        await this.routingService.route(normalized);
        await this.streamConfigService.upsertConsumerState({ connectionState: 'CONNECTED', lastMessageAt: new Date() });
      }
    } catch (err: any) {
      this.logger.error(`MQTT consumer: failed to handle message on ${topic}: ${err?.message}`);
    }
  }

  private generateMessageId(topic: string, payload: Buffer): string {
    // Prefer provider message_id from payload if available
    try {
      const parsed = JSON.parse(payload.toString('utf-8'));
      if (parsed?.messageId) return parsed.messageId as string;
      if (parsed?.message_id) return parsed.message_id as string;
    } catch { /* fallback */ }
    // Synthetic: topic + content hash + timestamp (coarse dedupe)
    const hash = Buffer.from(payload).toString('base64').slice(0, 12);
    return `${topic.replace(/\//g, '-')}_${hash}_${Date.now()}`;
  }

  private async disconnect(): Promise<void> {
    if (!this.client) return;
    return new Promise((resolve) => {
      this.client!.end(false, {}, () => {
        this.logger.log('MQTT consumer: disconnected cleanly');
        resolve();
      });
    });
  }
}
