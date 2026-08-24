import { registerAs } from '@nestjs/config';
import {
  COMMUNICATION_RETENTION_DAYS_DEFAULTS,
  COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS,
  COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS,
} from '../modules/communication/retention/communication-retention.constants';

const intEnv = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

export default registerAs('communicationRetention', () => ({
  /** Master switch — disabled by default until policy validated (C13.1 rollout). */
  enabled: boolEnv('COMMUNICATION_RETENTION_ENABLED', false),
  /** Dry-run default true — counts eligible rows without destructive writes. */
  dryRun: boolEnv('COMMUNICATION_RETENTION_DRY_RUN', true),
  batchSize: intEnv('COMMUNICATION_RETENTION_BATCH_SIZE', 200),
  globalLockTtlMs: intEnv(
    'COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS',
    COMMUNICATION_RETENTION_GLOBAL_LOCK_TTL_MS,
  ),
  globalLockHeartbeatMs: intEnv(
    'COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS',
    COMMUNICATION_RETENTION_GLOBAL_LOCK_HEARTBEAT_MS,
  ),
  policyVersion: process.env.COMMUNICATION_RETENTION_POLICY_VERSION || '2026-08-23',
  days: {
    /** Canonical customer message content — correlated WhatsApp native body follows the same cutoff. */
    messageContent: intEnv(
      'COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.messageContent,
    ),
    attachment: intEnv(
      'COMMUNICATION_RETENTION_ATTACHMENT_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.attachment,
    ),
    replyCommandSettled: intEnv(
      'COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.replyCommandSettled,
    ),
    aiContent: intEnv(
      'COMMUNICATION_RETENTION_AI_CONTENT_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.aiContent,
    ),
    structuralRecord: intEnv(
      'COMMUNICATION_RETENTION_STRUCTURAL_RECORD_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.structuralRecord,
    ),
  },
}));
