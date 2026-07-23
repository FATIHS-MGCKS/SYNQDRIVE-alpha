export const LEGAL_DOCUMENT_RETENTION_CLASS = {
  LEGAL_MASTER: 'LEGAL_MASTER',
  BOOKING_SNAPSHOT: 'BOOKING_SNAPSHOT',
  DELIVERY_EVIDENCE: 'DELIVERY_EVIDENCE',
  QUARANTINE_TEMP: 'QUARANTINE_TEMP',
  AUDIT_EVENT: 'AUDIT_EVENT',
} as const;

export type LegalDocumentRetentionClass =
  (typeof LEGAL_DOCUMENT_RETENTION_CLASS)[keyof typeof LEGAL_DOCUMENT_RETENTION_CLASS];

export const LEGAL_DOCUMENT_RETENTION_PHASE = {
  QUARANTINE_TEMP: 'quarantine_temp',
  LEGAL_MASTER_STORAGE: 'legal_master_storage',
  BOOKING_SNAPSHOT_STORAGE: 'booking_snapshot_storage',
  DELIVERY_EVIDENCE_REDACTION: 'delivery_evidence_recipient_redaction',
  AUDIT_EVENT: 'audit_event',
} as const;

export type LegalDocumentRetentionPhase =
  (typeof LEGAL_DOCUMENT_RETENTION_PHASE)[keyof typeof LEGAL_DOCUMENT_RETENTION_PHASE];

export const LEGAL_DOCUMENT_RETENTION_SKIP_REASON = {
  LEGAL_HOLD: 'legal_hold',
  ACTIVE_REFERENCES: 'active_references',
  NOT_ELIGIBLE: 'not_eligible',
  ALREADY_PURGED: 'already_purged',
  DISABLED: 'disabled',
  ACTIVE_STATUS: 'active_status',
} as const;

export const LEGAL_DOCUMENT_RETENTION_PURGE_RUN_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

/** Terminal master statuses eligible for storage purge (row tombstone retained). */
export const LEGAL_MASTER_PURGEABLE_STATUSES = [
  'ARCHIVED',
  'REVOKED',
  'SUPERSEDED',
] as const;
