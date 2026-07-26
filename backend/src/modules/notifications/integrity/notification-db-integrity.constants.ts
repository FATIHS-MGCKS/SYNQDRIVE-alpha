/** Database CHECK constraint bounds for notification tables — keep in sync with migration SQL. */
export const NOTIFICATION_DB_LIMITS = {
  fingerprintMaxLength: 512,
  conditionCodeMaxLength: 128,
  eventTypeMaxLength: 128,
  titleKeyMaxLength: 256,
  bodyKeyMaxLength: 256,
  primarySourceRefMaxLength: 256,
  templateParamsMaxBytes: 32_768,
  actionTargetMaxBytes: 8_192,
  occurrencePayloadMaxBytes: 65_536,
  outboxPayloadRefMaxBytes: 16_384,
  outboxLastErrorMaxLength: 2_000,
} as const;

export const NOTIFICATION_ACTIVE_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'SNOOZED'] as const;

export const NOTIFICATION_TERMINAL_STATUSES = ['RESOLVED', 'ARCHIVED'] as const;

export const NOTIFICATION_DB_INTEGRITY_MIGRATION_ID = '20260726120000_notification_db_integrity';
