import { registerAs } from '@nestjs/config';
import { COMMUNICATION_RETENTION_DAYS_DEFAULTS } from '../modules/communication/retention/communication-retention.constants';

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
  policyVersion: process.env.COMMUNICATION_RETENTION_POLICY_VERSION || '2026-08-23',
  days: {
    messageContent: intEnv(
      'COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.messageContent,
    ),
    nativeWhatsAppContent: intEnv(
      'COMMUNICATION_RETENTION_NATIVE_WHATSAPP_CONTENT_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.nativeWhatsAppContent,
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
    voiceTranscript: intEnv(
      'COMMUNICATION_RETENTION_VOICE_TRANSCRIPT_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.voiceTranscript,
    ),
    voiceSummary: intEnv(
      'COMMUNICATION_RETENTION_VOICE_SUMMARY_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.voiceSummary,
    ),
    voiceProviderPayload: intEnv(
      'COMMUNICATION_RETENTION_VOICE_PROVIDER_PAYLOAD_DAYS',
      COMMUNICATION_RETENTION_DAYS_DEFAULTS.voiceProviderPayload,
    ),
  },
}));
