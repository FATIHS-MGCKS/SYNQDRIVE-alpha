import { Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { HmMqttAppConfig } from '@config/high-mobility.config';
import type { HighMobilityMqttV2Service } from './high-mobility-mqtt-v2.service';
import type { HmStreamApp } from './high-mobility-stream-config.service';
import { extractHmMqttJsonPreview } from './high-mobility-mqtt-payload.util';

export interface HmMqttBaseOptions {
  streamApp: HmStreamApp;
  hmEnv: string;
  mqttReady: boolean;
  mqttV2?: HighMobilityMqttV2Service;
  label: string;
  cfg: HmMqttAppConfig;
  certs: { ca: Buffer; cert: Buffer; key: Buffer };
  resolvedCertPaths: { ca: string; cert: string; key: string };
  onMessage: (topic: string, payload: Buffer) => Promise<void>;
  onStateChange: (state: string, extra?: { error?: string; connectedAt?: Date; messageAt?: Date }) => Promise<void>;
}

/**
 * Shared MQTT V2 connection utility for HM app-containers.
 *
 * RULES:
 * - mTLS from cert file Buffers (never inline secrets)
 * - QoS from config (default 1 per HM)
 * - MQTT v5 protocol version
 * - Broker: mqtt-v2.high-mobility.com:8883 (never localhost unless explicitly configured)
 * - clean=false when MQTT_DISABLE_CLEAN_SESSION=true (persistent session)
 * - Health-APP and Telemetry-APP use separate clientIds / topics
 */
export function createHmMqttClient(opts: HmMqttBaseOptions): MqttClient {
  const { label, cfg, certs, streamApp, mqttV2, hmEnv, mqttReady } = opts;

  mqttV2?.initConfig(streamApp, {
    hmEnv,
    mqttEnabled: cfg.enabled,
    mqttReady,
    host: cfg.host,
    port: cfg.port,
    topic: cfg.topic,
    clientId: cfg.clientId,
    certPathsResolved: opts.resolvedCertPaths,
  });

  const qos = Math.min(2, Math.max(0, cfg.qos ?? 1)) as 0 | 1 | 2;

  const clientOptions: mqtt.IClientOptions = {
    host: cfg.host,
    port: cfg.port,
    protocol: 'mqtts',
    protocolVersion: 5,
    clientId: cfg.clientId,
    clean: !cfg.disableCleanSession,
    reconnectPeriod: cfg.reconnectPeriodMs,
    connectTimeout: cfg.connectTimeoutMs,
    ca: certs.ca,
    cert: certs.cert,
    key: certs.key,
    rejectUnauthorized: true,
  };

  const logger = new Logger(label);
  logger.log(
    `[${label}] mqtt.connect → mqtts://${cfg.host}:${cfg.port} clientId=${cfg.clientId} qos=${qos} ` +
      `cleanSession=${!cfg.disableCleanSession} protocolVersion=5`,
  );

  const client = mqtt.connect(clientOptions);

  client.on('connect', () => {
    mqttV2?.onSocketConnect(streamApp);
    logger.log(`[${label}] MQTT v5 session established with ${cfg.host}:${cfg.port}`);

    const topic = cfg.topic;
    if (!topic?.trim()) {
      const msg = 'MQTT_TOPIC is empty — subscription skipped (configuration error)';
      logger.error(`[${label}] ${msg}`);
      mqttV2?.onSubscribeError(streamApp, topic ?? '', msg);
      void opts.onStateChange('ERROR', { error: msg });
      return;
    }

    client.subscribe(topic, { qos }, (err) => {
      if (err) {
        logger.error(`[${label}] Subscription error for ${topic}: ${err.message}`);
        mqttV2?.onSubscribeError(streamApp, topic, err.message);
        void opts.onStateChange('ERROR', { error: err.message });
      } else {
        mqttV2?.onSubscribeSuccess(streamApp, topic);
        logger.log(`[${label}] Subscribed qos=${qos} → ${topic}`);
      }
    });

    void opts.onStateChange('CONNECTED', { connectedAt: new Date() });
  });

  client.on('message', async (topic, message) => {
    const preview = extractHmMqttJsonPreview(message);
    if (preview.parseError) {
      mqttV2?.onMalformedPayload(streamApp, preview.parseError);
      logger.warn(`[${label}] Non-JSON or malformed payload on ${topic}: ${preview.parseError}`);
    } else {
      mqttV2?.onMessage(streamApp, {
        messageId: preview.messageId,
        vin: preview.vin,
        version: preview.version,
        dataTopLevelKeys: preview.dataTopLevelKeys,
        emptyData: preview.emptyData,
      });
    }

    try {
      await opts.onMessage(topic, message);
      void opts.onStateChange('CONNECTED', { messageAt: new Date() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[${label}] Message handler error on ${topic}: ${msg}`);
      mqttV2?.onBrokerError(streamApp, `handler: ${msg}`);
    }
  });

  client.on('error', (err) => {
    logger.error(`[${label}] MQTT client error: ${err.message}`);
    mqttV2?.onBrokerError(streamApp, err.message);
    void opts.onStateChange('ERROR', { error: err.message });
  });

  client.on('reconnect', () => {
    logger.warn(`[${label}] MQTT reconnect scheduled`);
    mqttV2?.onReconnect(streamApp);
    void opts.onStateChange('CONNECTING');
  });

  client.on('offline', () => {
    logger.warn(`[${label}] MQTT client offline`);
    mqttV2?.onOffline(streamApp);
  });

  client.on('disconnect', () => {
    logger.warn(`[${label}] MQTT disconnect packet`);
    mqttV2?.onDisconnectPacket(streamApp);
  });

  client.on('close', () => {
    logger.warn(`[${label}] MQTT socket closed`);
    mqttV2?.onClose(streamApp);
  });

  return client;
}

/** Extract message_id from raw MQTT payload, fall back to synthetic ID */
export function extractMessageId(topic: string, payload: Buffer): string {
  try {
    const parsed = JSON.parse(payload.toString('utf-8'));
    if (parsed?.messageId) return String(parsed.messageId);
    if (parsed?.message_id) return String(parsed.message_id);
  } catch {
    /* fallback */
  }
  const hash = payload.toString('base64').slice(0, 12);
  return `${topic.replace(/\//g, '-')}_${hash}_${Date.now()}`;
}
