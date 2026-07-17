export type DocumentRetentionTrigger = 'manual' | 'cron';

export interface DocumentRetentionPhaseResult {
  phase:
    | 'ocr_cache_after_soft_delete'
    | 'sensitive_extracted_data_after_soft_delete'
    | 'final_row_after_soft_delete'
    | 'rejected_without_file';
  organizationId?: string | null;
  candidates: number;
  affected: number;
  skipped: number;
  dryRun: boolean;
  notes?: string;
}

export interface DocumentRetentionReport {
  trigger: DocumentRetentionTrigger;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: DocumentRetentionPhaseResult[];
  totals: {
    candidates: number;
    affected: number;
    skipped: number;
  };
}

export interface DocumentRetentionRunOptions {
  trigger?: DocumentRetentionTrigger;
  dryRun?: boolean;
  organizationId?: string;
}

export interface DocumentRetentionDaysConfig {
  ocrCacheAfterSoftDelete: number;
  sensitiveExtractedDataAfterSoftDelete: number;
  extractionRowAfterSoftDelete: number;
  rejectedWithoutFile: number;
}
