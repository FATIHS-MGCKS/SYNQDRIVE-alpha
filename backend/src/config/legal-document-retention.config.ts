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

/**
 * Platform defaults for legal document retention classes.
 * `0` disables automatic purge for that class. Org overrides live in
 * `organization_legal_document_retention_policies.class_policies`.
 */
export default registerAs('legalDocumentRetention', () => ({
  enabled: boolEnv('LEGAL_DOCUMENT_RETENTION_ENABLED', false),
  dryRun: boolEnv('LEGAL_DOCUMENT_RETENTION_DRY_RUN', true),
  batchSize: intEnv('LEGAL_DOCUMENT_RETENTION_BATCH_SIZE', 50),
  maxBatchesPerRun: intEnv('LEGAL_DOCUMENT_RETENTION_MAX_BATCHES', 100),
  policyVersion: process.env.LEGAL_DOCUMENT_RETENTION_POLICY_VERSION || '2026-07-22',
  days: {
    /** Archived/revoked/superseded master PDFs after eligibility anchor. 0 = disabled. */
    legalMasterAfterArchive: intEnv('LEGAL_DOCUMENT_RETENTION_LEGAL_MASTER_DAYS', 0),
    /** Generated booking/contract snapshot PDFs. 0 = disabled. */
    bookingSnapshot: intEnv('LEGAL_DOCUMENT_RETENTION_BOOKING_SNAPSHOT_DAYS', 0),
    /** Delivery evidence recipient PII redaction (row kept). 0 = disabled. */
    deliveryEvidenceRecipientRedaction: intEnv(
      'LEGAL_DOCUMENT_RETENTION_DELIVERY_EVIDENCE_DAYS',
      0,
    ),
    /** Stale quarantine uploads (quarantineObjectKey only). */
    quarantineTemp: intEnv('LEGAL_DOCUMENT_RETENTION_QUARANTINE_TEMP_DAYS', 7),
    /** Append-only audit events — default 0 (never auto-purge). */
    auditEvent: intEnv('LEGAL_DOCUMENT_RETENTION_AUDIT_EVENT_DAYS', 0),
  },
}));
