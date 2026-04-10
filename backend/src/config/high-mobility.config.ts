import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export default registerAs('highMobility', () => {
  const logger = new Logger('HighMobilityConfig');

  const env = (process.env.HM_ENV || 'sandbox') as 'sandbox' | 'live';
  const clientId = process.env.HM_CLIENT_ID || '';
  const clientSecret = process.env.HM_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    logger.warn(
      'High Mobility credentials (HM_CLIENT_ID / HM_CLIENT_SECRET) are not configured — ' +
      'HM integration will operate in degraded/stub mode.',
    );
  }

  // ── MQTT V2 config ─────────────────────────────────────────────────────────
  const mqttEnabled = process.env.HM_MQTT_ENABLED === 'true';
  const mqttHost = process.env.HM_MQTT_HOST || 'mqtt-v2.high-mobility.com';
  const mqttPort = parseInt(process.env.HM_MQTT_PORT || '8883', 10);
  const mqttAppId = process.env.HM_MQTT_APP_ID || '';
  const mqttCaCertPath = process.env.HM_MQTT_CA_CERT_PATH || '';
  const mqttClientCertPath = process.env.HM_MQTT_CLIENT_CERT_PATH || '';
  const mqttClientKeyPath = process.env.HM_MQTT_CLIENT_KEY_PATH || '';

  if (mqttEnabled) {
    if (!mqttAppId) {
      logger.warn('HM_MQTT_ENABLED=true but HM_MQTT_APP_ID is missing — MQTT consumer will not start');
    }
    if (!mqttCaCertPath || !mqttClientCertPath || !mqttClientKeyPath) {
      logger.warn(
        'HM_MQTT_ENABLED=true but certificate paths are not fully configured — ' +
        'MQTT consumer will not start without all three cert paths.',
      );
    }
  }

  const resolvedApiBaseUrl =
    env === 'live'
      ? (process.env.HM_API_BASE_URL || 'https://api.high-mobility.com/v1')
      : (process.env.HM_SANDBOX_API_BASE_URL || 'https://sandbox.api.high-mobility.com/v1');

  const resolvedClientId =
    env === 'live' ? clientId : (process.env.HM_SANDBOX_CLIENT_ID || clientId);
  const resolvedClientSecret =
    env === 'live' ? clientSecret : (process.env.HM_SANDBOX_CLIENT_SECRET || clientSecret);

  // Allow explicit override of the OAuth token endpoint (HM uses /access_tokens, not /oauth/token)
  const tokenUrl =
    process.env.HM_TOKEN_URL ||
    `${resolvedApiBaseUrl}/access_tokens`;

  return {
    // REST / OAuth
    env,
    apiBaseUrl: resolvedApiBaseUrl,
    tokenUrl,
    clientId: resolvedClientId,
    clientSecret: resolvedClientSecret,
    webhookSecret: process.env.HM_WEBHOOK_SECRET || '',
    requestTimeoutMs: parseInt(process.env.HM_REQUEST_TIMEOUT_MS || '15000', 10),
    maxRetries: parseInt(process.env.HM_MAX_RETRIES || '2', 10),

    // MQTT V2 streaming
    mqtt: {
      enabled: mqttEnabled,
      host: mqttHost,
      port: mqttPort,
      appId: mqttAppId,
      topicPrefix: process.env.HM_MQTT_TOPIC_PREFIX || 'live',
      caCertPath: mqttCaCertPath,
      clientCertPath: mqttClientCertPath,
      clientKeyPath: mqttClientKeyPath,
      consumerGroup: process.env.HM_MQTT_CONSUMER_GROUP || 'synqdrive-hm-stream',
      disableCleanSession: process.env.HM_MQTT_DISABLE_CLEAN_SESSION !== 'false',
      reconnectPeriodMs: parseInt(process.env.HM_MQTT_RECONNECT_PERIOD_MS || '5000', 10),
      connectTimeoutMs: parseInt(process.env.HM_MQTT_CONNECT_TIMEOUT_MS || '30000', 10),
    },
  };
});
