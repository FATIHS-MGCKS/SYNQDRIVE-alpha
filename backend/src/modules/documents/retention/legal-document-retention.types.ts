import type {
  LegalDocumentRetentionClass,
  LegalDocumentRetentionPhase,
} from './legal-document-retention.constants';

export type LegalDocumentRetentionTrigger = 'manual' | 'cron';

export interface LegalDocumentRetentionSkipDetail {
  id: string;
  reason: string;
  detail?: string;
}

export interface LegalDocumentRetentionFailureDetail {
  id: string;
  objectKey?: string | null;
  error: string;
}

export interface LegalDocumentRetentionPhaseResult {
  phase: LegalDocumentRetentionPhase;
  retentionClass: LegalDocumentRetentionClass;
  organizationId?: string | null;
  candidates: number;
  affected: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  notes?: string;
  skipSamples?: LegalDocumentRetentionSkipDetail[];
  failureSamples?: LegalDocumentRetentionFailureDetail[];
}

export interface LegalDocumentRetentionReport {
  runId?: string;
  trigger: LegalDocumentRetentionTrigger;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: LegalDocumentRetentionPhaseResult[];
  totals: {
    candidates: number;
    affected: number;
    skipped: number;
    failed: number;
  };
}

export interface LegalDocumentRetentionRunOptions {
  trigger?: LegalDocumentRetentionTrigger;
  dryRun?: boolean;
  organizationId?: string;
  correlationId?: string;
}

export interface LegalDocumentRetentionClassPolicy {
  retentionDays: number;
  /** Anchor for computing deletionEligibleAt — org-configurable semantics. */
  anchor?: 'archived_at' | 'created_at' | 'voided_at' | 'presented_at';
}

export type LegalDocumentRetentionClassPolicyMap = Partial<
  Record<LegalDocumentRetentionClass, LegalDocumentRetentionClassPolicy>
>;

export interface LegalDocumentSubjectAccessExportRow {
  entityType: 'legal_master' | 'booking_snapshot' | 'delivery_evidence' | 'audit_event';
  entityId: string;
  organizationId: string;
  customerId?: string | null;
  bookingId?: string | null;
  retentionClass: string;
  legalHold: boolean;
  deletedAt?: string | null;
  summary: Record<string, unknown>;
}
