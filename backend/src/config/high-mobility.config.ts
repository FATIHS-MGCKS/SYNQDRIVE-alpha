import { randomBytes } from 'crypto';
import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
//  Typed contracts for both HM app-container configs
// ─────────────────────────────────────────────────────────────────────────────

export interface HmMqttAppConfig {
  enabled: boolean;
  host: string;
  port: number;
  appId: string;
  /** Full topic string from HM snippet, e.g. $share/<group>/live/<appId>/#  */
  topic: string;
  caCertPath: string;
  clientCertPath: string;
  clientKeyPath: string;
  /** Client ID exactly as provided in HM snippet */
  clientId: string;
  consumerGroup: string;
  disableCleanSession: boolean;
  reconnectPeriodMs: number;
  connectTimeoutMs: number;
  /** MQTT subscribe QoS (HM V2 expects 1) */
  qos: number;
  /** 5 = MQTT v5 */
  protocolVersion: 5;
}

/** Optional global defaults (HM_MQTT_V_*) merged when per-app keys are unset */
function readGlobalHmMqttV2Env(): {
  host?: string;
  port?: number;
  caCertPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  topic?: string;
  sharedTopic?: string;
  clientId?: string;
  appId?: string;
  consumerGroup?: string;
  qos?: number;
  disableCleanSession?: boolean;
  reconnectPeriodMs?: number;
  connectTimeoutMs?: number;
  uniqueClientId?: boolean;
} {
  const p = (k: string) => process.env[k]?.trim() || undefined;
  const n = (k: string) => {
    const v = p(k);
    return v != null ? parseInt(v, 10) : undefined;
  };
  return {
    host: p('HM_MQTT_V2_HOST'),
    port: n('HM_MQTT_V2_PORT'),
    caCertPath: p('HM_MQTT_V2_CA_PATH'),
    clientCertPath: p('HM_MQTT_V2_CERT_PATH'),
    clientKeyPath: p('HM_MQTT_V2_KEY_PATH'),
    topic: p('HM_MQTT_V2_TOPIC'),
    sharedTopic: p('HM_MQTT_V2_SHARED_TOPIC'),
    clientId: p('HM_MQTT_V2_CLIENT_ID'),
    appId: p('HM_MQTT_V2_APPLICATION_ID'),
    consumerGroup: p('HM_MQTT_V2_CONSUMER_GROUP'),
    qos: n('HM_MQTT_V2_QOS'),
    disableCleanSession: p('HM_MQTT_V2_DISABLE_CLEAN_SESSION') === 'true'
      ? true
      : p('HM_MQTT_V2_DISABLE_CLEAN_SESSION') === 'false'
        ? false
        : undefined,
    reconnectPeriodMs: n('HM_MQTT_V2_RECONNECT_PERIOD_MS'),
    connectTimeoutMs: n('HM_MQTT_V2_CONNECT_TIMEOUT_MS'),
    uniqueClientId: p('HM_MQTT_V2_UNIQUE_CLIENT_ID') === 'true' ? true : p('HM_MQTT_V2_UNIQUE_CLIENT_ID') === 'false' ? false : undefined,
  };
}

export interface HmAppConfig {
  /** 'live' | 'sandbox' */
  env: string;
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  requestTimeoutMs: number;
  maxRetries: number;
  mqtt: HmMqttAppConfig;
  /** true when OAuth credentials (clientId + clientSecret) are present */
  oauthReady: boolean;
  /** true when all MQTT fields required for connection are present */
  mqttReady: boolean;
}

export interface HmDualAppConfig {
  healthApp: HmAppConfig;
  telemetryApp: HmAppConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildAppConfig(prefix: string, logger: Logger): HmAppConfig {
  const g = readGlobalHmMqttV2Env();
  const e = (key: string) => process.env[`${prefix}_${key}`] ?? '';
  const n = (key: string, def: number) => parseInt(process.env[`${prefix}_${key}`] ?? String(def), 10);
  const b = (key: string, def: boolean) =>
    process.env[`${prefix}_${key}`] !== undefined
      ? process.env[`${prefix}_${key}`] === 'true'
      : def;

  const env = (e('ENV') || 'live') as 'live' | 'sandbox';
  const clientId = e('CLIENT_ID');
  const clientSecret = e('CLIENT_SECRET');

  const rawApiBaseUrl =
    env === 'live'
      ? (e('API_BASE_URL') || 'https://api.high-mobility.com')
      : (e('API_BASE_URL') || 'https://sandbox.api.high-mobility.com');
  // Strip trailing /v1 if mistakenly included — the fetch services always build /v1/... themselves
  const resolvedApiBaseUrl = rawApiBaseUrl.replace(/\/v1\/?$/, '');

  const tokenUrl = e('TOKEN_URL') || `${resolvedApiBaseUrl}/access_tokens`;

  const mqttEnabled = b('MQTT_ENABLED', false);
  const mqttAppId = e('MQTT_APP_ID') || g.appId || '';
  const mqttTopic = e('MQTT_TOPIC') || g.topic || g.sharedTopic || '';
  let mqttClientId = e('MQTT_CLIENT_ID') || g.clientId || '';
  const mqttCaCertPath = e('MQTT_CA_CERT_PATH') || g.caCertPath || '';
  const mqttClientCertPath = e('MQTT_CLIENT_CERT_PATH') || g.clientCertPath || '';
  const mqttClientKeyPath = e('MQTT_CLIENT_KEY_PATH') || g.clientKeyPath || '';

  const uniqueFromApp = b('MQTT_UNIQUE_CLIENT_ID', false);
  const uniqueGlobal = g.uniqueClientId === true;
  const uniqueFallback = uniqueGlobal || uniqueFromApp;
  if (mqttClientId && uniqueFallback) {
    mqttClientId = `${mqttClientId}-synq-${process.pid}-${randomBytes(3).toString('hex')}`;
  }

  const oauthReady = Boolean(clientId && clientSecret);
  const mqttReady =
    mqttEnabled &&
    Boolean(
      mqttAppId &&
        mqttTopic?.trim() &&
        mqttClientId &&
        mqttCaCertPath &&
        mqttClientCertPath &&
        mqttClientKeyPath,
    );

  if (!oauthReady) {
    logger.warn(
      `[${prefix}] OAuth credentials not configured — ${prefix} integration will run in degraded mode`,
    );
  }
  if (mqttEnabled && !mqttReady) {
    logger.warn(
      `[${prefix}] MQTT_ENABLED=true but configuration is incomplete — ` +
      'verify MQTT_APP_ID, MQTT_TOPIC, MQTT_CLIENT_ID, and all cert paths',
    );
  }
  if (mqttReady) {
    logger.log(`[${prefix}] MQTT ready — appId=${mqttAppId} clientId=${mqttClientId}`);
  }
  if (oauthReady) {
    logger.log(`[${prefix}] OAuth ready — clientId=${clientId}`);
  }

  return {
    env,
    apiBaseUrl: resolvedApiBaseUrl,
    tokenUrl,
    clientId,
    clientSecret,
    webhookSecret: e('WEBHOOK_SECRET'),
    requestTimeoutMs: n('REQUEST_TIMEOUT_MS', 15_000),
    maxRetries: n('MAX_RETRIES', 2),
    mqtt: {
      enabled: mqttEnabled,
      host: e('MQTT_HOST') || g.host || 'mqtt-v2.high-mobility.com',
      port: n('MQTT_PORT', g.port ?? 8883),
      appId: mqttAppId,
      topic: mqttTopic,
      caCertPath: mqttCaCertPath,
      clientCertPath: mqttClientCertPath,
      clientKeyPath: mqttClientKeyPath,
      clientId: mqttClientId,
      consumerGroup: e('MQTT_CONSUMER_GROUP') || g.consumerGroup || `synqdrive-${prefix.toLowerCase().replace(/_/g, '-')}`,
      disableCleanSession: b('MQTT_DISABLE_CLEAN_SESSION', g.disableCleanSession ?? true),
      reconnectPeriodMs: n('MQTT_RECONNECT_PERIOD_MS', g.reconnectPeriodMs ?? 5_000),
      connectTimeoutMs: n('MQTT_CONNECT_TIMEOUT_MS', g.connectTimeoutMs ?? 30_000),
      qos: Math.min(2, Math.max(0, n('MQTT_QOS', g.qos ?? 1))),
      protocolVersion: 5 as const,
    },
    oauthReady,
    mqttReady,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Registered config
// ─────────────────────────────────────────────────────────────────────────────

export default registerAs('highMobility', (): HmDualAppConfig => {
  const logger = new Logger('HighMobilityConfig');

  logger.log('Initialising HM dual-app configuration…');

  const healthApp = buildAppConfig('HM_HEALTH_APP', logger);
  const telemetryApp = buildAppConfig('HM_TELEMETRY_APP', logger);

  logger.log(
    `HM Health-APP: oauth=${healthApp.oauthReady} mqtt=${healthApp.mqttReady} | ` +
    `HM Telemetry-APP: oauth=${telemetryApp.oauthReady} mqtt=${telemetryApp.mqttReady}`,
  );

  return { healthApp, telemetryApp };
});
