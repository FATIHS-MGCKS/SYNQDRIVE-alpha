import { registerAs } from '@nestjs/config';
import { NOTIFICATION_RETENTION_DAYS } from '../modules/notifications/compliance/notification-retention.constants';

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

export default registerAs('notificationRetention', () => ({
  enabled: boolEnv('NOTIFICATION_RETENTION_ENABLED', false),
  dryRun: boolEnv('NOTIFICATION_RETENTION_DRY_RUN', true),
  batchSize: intEnv('NOTIFICATION_RETENTION_BATCH_SIZE', 200),
  policyVersion: process.env.NOTIFICATION_RETENTION_POLICY_VERSION || '2026-07-26',
  days: {
    resolvedOperational: intEnv(
      'NOTIFICATION_RETENTION_RESOLVED_DAYS',
      NOTIFICATION_RETENTION_DAYS.RESOLVED_OPERATIONAL,
    ),
    securityGovernance: intEnv(
      'NOTIFICATION_RETENTION_SECURITY_DAYS',
      NOTIFICATION_RETENTION_DAYS.SECURITY_GOVERNANCE,
    ),
    deliveryTechnical: intEnv(
      'NOTIFICATION_RETENTION_DELIVERY_DAYS',
      NOTIFICATION_RETENTION_DAYS.DELIVERY_TECHNICAL,
    ),
    workflowTechnical: intEnv(
      'NOTIFICATION_RETENTION_WORKFLOW_DAYS',
      NOTIFICATION_RETENTION_DAYS.WORKFLOW_TECHNICAL,
    ),
  },
}));
