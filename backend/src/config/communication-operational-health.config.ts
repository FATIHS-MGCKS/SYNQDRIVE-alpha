import { registerAs } from '@nestjs/config';

const intEnv = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

/**
 * Operational health thresholds for Communication Center (C13.2).
 * Classified as DERIVED_SAFE_DEFAULT — not product/legal retention policy.
 */
export default registerAs('communicationOperationalHealth', () => ({
  startupGraceMs: intEnv('COMMUNICATION_HEALTH_STARTUP_GRACE_MS', 15 * 60 * 1000),
  cacheTtlMs: intEnv('COMMUNICATION_HEALTH_CACHE_TTL_MS', 30_000),
  unknownCountDegraded: intEnv('COMMUNICATION_HEALTH_UNKNOWN_COUNT_DEGRADED', 10),
  unknownCountUnhealthy: intEnv('COMMUNICATION_HEALTH_UNKNOWN_COUNT_UNHEALTHY', 100),
  unknownOldestSecondsDegraded: intEnv('COMMUNICATION_HEALTH_UNKNOWN_OLDEST_SECONDS_DEGRADED', 86_400),
  unknownOldestSecondsUnhealthy: intEnv('COMMUNICATION_HEALTH_UNKNOWN_OLDEST_SECONDS_UNHEALTHY', 604_800),
  handoffOldestSecondsDegraded: intEnv('COMMUNICATION_HEALTH_HANDOFF_OLDEST_SECONDS_DEGRADED', 14_400),
  handoffOldestSecondsUnhealthy: intEnv('COMMUNICATION_HEALTH_HANDOFF_OLDEST_SECONDS_UNHEALTHY', 86_400),
  whatsappWebhookOldestSecondsDegraded: intEnv(
    'COMMUNICATION_HEALTH_WHATSAPP_WEBHOOK_OLDEST_SECONDS_DEGRADED',
    1800,
  ),
  whatsappWebhookOldestSecondsUnhealthy: intEnv(
    'COMMUNICATION_HEALTH_WHATSAPP_WEBHOOK_OLDEST_SECONDS_UNHEALTHY',
    7200,
  ),
  voiceWebhookOldestSecondsDegraded: intEnv(
    'COMMUNICATION_HEALTH_VOICE_WEBHOOK_OLDEST_SECONDS_DEGRADED',
    1800,
  ),
  voiceWebhookOldestSecondsUnhealthy: intEnv(
    'COMMUNICATION_HEALTH_VOICE_WEBHOOK_OLDEST_SECONDS_UNHEALTHY',
    7200,
  ),
  retentionStaleSecondsDegraded: intEnv('COMMUNICATION_HEALTH_RETENTION_STALE_SECONDS_DEGRADED', 93_600),
}));
