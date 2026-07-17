import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  DocumentExtractionLogEvent,
  DocumentExtractionLogStage,
  formatDocumentExtractionLog,
} from './document-extraction-observability.util';
import {
  recordDocumentAction,
  recordDocumentActionFailed,
  recordDocumentActionPlan,
  recordDocumentArchive,
  recordDocumentAwaitingType,
  recordDocumentClassification,
  recordDocumentDuplicate,
  recordDocumentEntityCandidate,
  recordDocumentExtractionCompleted,
  recordDocumentFollowUp,
  recordDocumentOcr,
  recordDocumentOcrFailed,
  recordDocumentPartialApply,
  recordDocumentPlausibilityBlocker,
  recordDocumentRecovery,
  recordDocumentRequiredField,
  recordDocumentUpload,
  recordDocumentUploadRejected,
  type DocumentActionOutcome,
  type DocumentActionPlanOutcome,
  type DocumentArchiveOutcome,
  type DocumentAwaitingTypeSource,
  type DocumentClassificationResult,
  type DocumentDuplicateOutcome,
  type DocumentFollowUpOutcome,
  type DocumentIntakeScope,
  type DocumentPartialApplyReason,
  type DocumentRecoveryKind,
  type DocumentRecoveryOutcome,
  type DocumentRequiredFieldPresence,
  type DocumentRequiredFieldRequirement,
  type DocumentUploadRejectedReason,
  toDocumentIntakeCategory,
} from './observability/document-intake-v2-prometheus.metrics';
import type { ConfidenceLevel, EntityCandidateType } from './entity-candidate-ranking.types';
import type { EntityCandidateRankingPipelineState } from './entity-candidate-ranking.types';

@Injectable()
export class DocumentExtractionObservabilityService {
  private readonly logger = new Logger(DocumentExtractionObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  logEvent(event: DocumentExtractionLogEvent): void {
    const line = formatDocumentExtractionLog(event);
    if (event.status === 'failed') {
      this.logger.warn(line);
      return;
    }
    if (event.status === 'retry_scheduled') {
      this.logger.warn(line);
      return;
    }
    this.logger.log(line);
  }

  recordJobOutcome(status: string, stage: string): void {
    this.metrics.documentExtractionJobs.inc({ status, stage });
  }

  recordFailure(stage: string, errorCode: string, retryable: boolean): void {
    this.metrics.documentExtractionFailures.inc({
      stage,
      error_code: errorCode,
      retryable: retryable ? 'true' : 'false',
    });
    if (stage === 'OCR') {
      recordDocumentOcrFailed(this.metrics, { errorCode, retryable });
    }
  }

  recordStageDuration(stage: string, durationSeconds: number): void {
    this.metrics.documentExtractionDuration.observe({ stage }, durationSeconds);
  }

  recordPages(method: string, pageCount: number): void {
    if (pageCount > 0) {
      this.metrics.documentExtractionPages.inc({ method }, pageCount);
    }
  }

  recordRetry(stage: string): void {
    this.metrics.documentExtractionRetries.inc({ stage });
  }

  recordClassification(result: string): void {
    this.metrics.documentExtractionClassification.inc({ result });
    if (isDocumentClassificationResult(result)) {
      recordDocumentClassification(this.metrics, { result });
    }
  }

  recordApply(result: string): void {
    this.metrics.documentExtractionApply.inc({ result });
  }

  recordUploadRateLimited(scope: string, reason: string): void {
    this.metrics.documentExtractionUploadRateLimited.inc({ scope, reason });
    recordDocumentUploadRejected(this.metrics, { reason: 'rate_limit' });
  }

  setQueueAgeSeconds(ageSeconds: number): void {
    this.metrics.documentExtractionQueueAge.set(ageSeconds);
  }

  setActiveJobs(count: number): void {
    this.metrics.documentExtractionActiveJobs.set(count);
  }

  recordUploadAccepted(input: {
    scope: DocumentIntakeScope;
    sourceSurface: string;
  }): void {
    recordDocumentUpload(this.metrics, input);
  }

  recordUploadRejected(reason: DocumentUploadRejectedReason): void {
    recordDocumentUploadRejected(this.metrics, { reason });
  }

  recordDuplicateOutcome(outcome: DocumentDuplicateOutcome): void {
    recordDocumentDuplicate(this.metrics, { outcome });
  }

  recordOcrCompleted(method: string): void {
    recordDocumentOcr(this.metrics, { method });
  }

  recordAwaitingDocumentType(source: DocumentAwaitingTypeSource): void {
    recordDocumentAwaitingType(this.metrics, { source });
  }

  recordExtractionCompleted(input: {
    documentType: string;
    overallStatus: string;
  }): void {
    recordDocumentExtractionCompleted(this.metrics, {
      documentCategory: toDocumentIntakeCategory(input.documentType),
      overallStatus: input.overallStatus,
    });
  }

  recordPlausibilityBlockers(checks: Array<{ code: string; status: string }>): void {
    for (const check of checks) {
      if (check.status !== 'BLOCKER') continue;
      recordDocumentPlausibilityBlocker(this.metrics, { blockerCode: check.code });
    }
  }

  recordEntityCandidateRanking(ranking: EntityCandidateRankingPipelineState): void {
    for (const candidate of ranking.candidates) {
      recordDocumentEntityCandidate(this.metrics, {
        entityType: candidate.entityType as EntityCandidateType,
        confidence: candidate.ranking.confidenceLevel as ConfidenceLevel,
      });
    }
  }

  recordRequiredFieldCompleteness(input: {
    documentType: string;
    requiredPresent: number;
    requiredMissing: number;
    optionalPresent: number;
    optionalMissing: number;
  }): void {
    const documentCategory = toDocumentIntakeCategory(input.documentType);
    if (input.requiredPresent > 0) {
      recordDocumentRequiredField(
        this.metrics,
        { requirement: 'required', presence: 'present', documentCategory },
        input.requiredPresent,
      );
    }
    if (input.requiredMissing > 0) {
      recordDocumentRequiredField(
        this.metrics,
        { requirement: 'required', presence: 'missing', documentCategory },
        input.requiredMissing,
      );
    }
    if (input.optionalPresent > 0) {
      recordDocumentRequiredField(
        this.metrics,
        { requirement: 'optional', presence: 'present', documentCategory },
        input.optionalPresent,
      );
    }
    if (input.optionalMissing > 0) {
      recordDocumentRequiredField(
        this.metrics,
        { requirement: 'optional', presence: 'missing', documentCategory },
        input.optionalMissing,
      );
    }
  }

  recordActionPlan(input: {
    documentType: string;
    outcome: DocumentActionPlanOutcome;
  }): void {
    recordDocumentActionPlan(this.metrics, {
      documentCategory: toDocumentIntakeCategory(input.documentType),
      outcome: input.outcome,
    });
  }

  recordActionExecution(input: {
    semanticAction: string;
    outcome: DocumentActionOutcome;
    errorCode?: string | null;
  }): void {
    recordDocumentAction(this.metrics, {
      semanticAction: input.semanticAction,
      outcome: input.outcome,
    });
    if (input.outcome === 'failed' && input.errorCode) {
      recordDocumentActionFailed(this.metrics, {
        semanticAction: input.semanticAction,
        errorCode: input.errorCode,
      });
    }
  }

  recordPartialApply(reason: DocumentPartialApplyReason): void {
    recordDocumentPartialApply(this.metrics, { reason });
  }

  recordRecovery(input: {
    kind: DocumentRecoveryKind;
    outcome: DocumentRecoveryOutcome;
  }): void {
    recordDocumentRecovery(this.metrics, input);
  }

  recordFollowUp(input: {
    followUpType: string;
    outcome: DocumentFollowUpOutcome;
  }): void {
    recordDocumentFollowUp(this.metrics, input);
  }

  recordArchive(outcome: DocumentArchiveOutcome): void {
    recordDocumentArchive(this.metrics, { outcome });
  }

  observeStage<T>(
    extractionId: string,
    stage: DocumentExtractionLogStage,
    fn: () => Promise<T>,
    context?: Pick<DocumentExtractionLogEvent, 'mimeCategory' | 'fileSizeBucket' | 'provider' | 'model'>,
  ): Promise<T> {
    const started = Date.now();
    this.logEvent({ extractionId, stage, status: 'started', ...context });
    return fn()
      .then((result) => {
        const durationMs = Date.now() - started;
        this.logEvent({ extractionId, stage, status: 'completed', durationMs, ...context });
        this.recordStageDuration(stage, durationMs / 1000);
        return result;
      })
      .catch((err: unknown) => {
        const durationMs = Date.now() - started;
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'UNKNOWN';
        this.logEvent({
          extractionId,
          stage,
          status: 'failed',
          errorCode,
          durationMs,
          ...context,
        });
        this.recordFailure(stage, errorCode, false);
        throw err;
      });
  }
}

function isDocumentClassificationResult(
  value: string,
): value is DocumentClassificationResult {
  return (
    value === 'auto_continue' ||
    value === 'await_user' ||
    value === 'await_user_with_suggestion' ||
    value === 'unknown'
  );
}
