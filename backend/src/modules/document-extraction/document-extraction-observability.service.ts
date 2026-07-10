import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  DocumentExtractionLogEvent,
  DocumentExtractionLogStage,
  formatDocumentExtractionLog,
} from './document-extraction-observability.util';

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
  }

  recordApply(result: string): void {
    this.metrics.documentExtractionApply.inc({ result });
  }

  setQueueAgeSeconds(ageSeconds: number): void {
    this.metrics.documentExtractionQueueAge.set(ageSeconds);
  }

  setActiveJobs(count: number): void {
    this.metrics.documentExtractionActiveJobs.set(count);
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
