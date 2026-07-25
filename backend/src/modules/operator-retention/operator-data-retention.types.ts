export type OperatorRetentionPhaseId =
  | 'abandoned_handover_draft'
  | 'handover_signature_bitmap'
  | 'operator_orphan_extraction'
  | 'operator_extraction_ocr_cache';

export interface OperatorRetentionPhaseResult {
  phase: OperatorRetentionPhaseId;
  organizationId: string | null;
  candidates: number;
  affected: number;
  skipped: number;
  dryRun: boolean;
  notes?: string;
}

export interface OperatorRetentionReport {
  trigger: 'manual' | 'cron';
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: OperatorRetentionPhaseResult[];
  totals: { candidates: number; affected: number; skipped: number };
}

export interface OperatorRetentionRunOptions {
  trigger?: 'manual' | 'cron';
  dryRun?: boolean;
  organizationId?: string;
}

export interface OperatorDataRetentionDaysConfig {
  abandonedHandoverDraft: number;
  handoverSignatureBitmap: number;
  operatorOrphanExtraction: number;
  operatorExtractionOcrCache: number;
}

/** Operator upload surfaces stored in extraction pipeline uploadContext. */
export const OPERATOR_EXTRACTION_SOURCE_SURFACES = [
  'operator_ai_upload',
  'operator_app',
] as const;
