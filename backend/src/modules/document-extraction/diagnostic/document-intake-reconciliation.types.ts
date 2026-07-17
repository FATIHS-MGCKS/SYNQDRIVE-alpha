export const DOCUMENT_INTAKE_FINDING_CODES = {
  APPLIED_WITHOUT_DOWNSTREAM: 'APPLIED_WITHOUT_DOWNSTREAM',
  DOWNSTREAM_WITHOUT_APPLIED_EXTRACTION: 'DOWNSTREAM_WITHOUT_APPLIED_EXTRACTION',
  CONFIRMED_LEGACY_STUCK: 'CONFIRMED_LEGACY_STUCK',
  DUPLICATE_DOMAIN_OBJECT: 'DUPLICATE_DOMAIN_OBJECT',
  INVALID_STATUS_COMBINATION: 'INVALID_STATUS_COMBINATION',
  STUCK_APPLYING_LIFECYCLE: 'STUCK_APPLYING_LIFECYCLE',
  RECOVERY_DEAD_LETTER: 'RECOVERY_DEAD_LETTER',
} as const;

export type DocumentIntakeFindingCode =
  (typeof DOCUMENT_INTAKE_FINDING_CODES)[keyof typeof DOCUMENT_INTAKE_FINDING_CODES];

export type DocumentIntakeFindingSeverity = 'INFO' | 'WARNING' | 'ERROR';

export type DocumentIntakeFinding = {
  code: DocumentIntakeFindingCode;
  severity: DocumentIntakeFindingSeverity;
  extractionId?: string | null;
  organizationId?: string | null;
  vehicleId?: string | null;
  documentType?: string | null;
  message: string;
  details?: Record<string, unknown>;
};

export type DocumentIntakeReconciliationReport = {
  generatedAt: string;
  dryRun: true;
  organizationId?: string | null;
  scannedExtractions: number;
  findings: DocumentIntakeFinding[];
  totals: Record<DocumentIntakeFindingCode, number>;
};

export type DocumentIntakeRecoveryAction =
  | 'RECONCILE_DOWNSTREAM_SUCCESS'
  | 'FINALIZE_APPLIED'
  | 'RETRY_MISSING_ACTIONS'
  | 'UNWIND_STALE_APPLYING'
  | 'DEAD_LETTER'
  | 'SKIPPED_DEAD_LETTER'
  | 'SKIPPED_ATTEMPT_LIMIT'
  | 'NO_OP';

export type DocumentIntakeRecoveryResult = {
  extractionId: string;
  action: DocumentIntakeRecoveryAction;
  dryRun: boolean;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
};
