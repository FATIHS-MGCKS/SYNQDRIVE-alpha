import { registerAs } from '@nestjs/config';

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

export default registerAs('iamDataRetention', () => ({
  enabled: boolEnv('IAM_DATA_RETENTION_ENABLED', false),
  dryRun: boolEnv('IAM_DATA_RETENTION_DRY_RUN', true),
  batchSize: intEnv('IAM_DATA_RETENTION_BATCH_SIZE', 500),
  maxBatchesPerCategory: intEnv('IAM_DATA_RETENTION_MAX_BATCHES', 50),
  maxRetries: intEnv('IAM_DATA_RETENTION_MAX_RETRIES', 3),
  sessionGraceDays: intEnv('IAM_DATA_RETENTION_SESSION_GRACE_DAYS', 7),
  inviteDeliveryMetadataDays: intEnv('IAM_DATA_RETENTION_INVITE_DELIVERY_DAYS', 30),
  pseudonymizationSalt: process.env.IAM_DATA_PSEUDONYMIZATION_SALT?.trim() || '',
}));
