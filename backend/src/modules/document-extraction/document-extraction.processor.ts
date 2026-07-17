import { Injectable, Logger, Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import documentExtractionConfig from '@config/document-extraction.config';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  DOCUMENT_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import { DocumentContentExtractorService } from './document-content-extractor.service';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import { DocumentAiExtractionService } from '@modules/ai/documents/document-ai-extraction.service';
import { DocumentClassificationService } from '@modules/ai/documents/document-classification.service';
import { getFieldSchema, buildEmptyExtractedData, SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import { DocumentExtractionJobData } from './document-extraction.types';
import {
  DOCUMENT_EXTRACTION_ERROR_CODES,
  isAutoClassificationRequest,
  processingStageForErrorPhase,
  resolveEffectiveDocumentType,
} from './document-extraction-lifecycle.util';
import { evaluateClassificationDecision } from './document-classification-decision.util';
import {
  buildContentCacheEntry,
  mergePipelinePlausibility,
  readContentCache,
  stripPipelineFromPlausibility,
} from './document-content-cache.util';
import { DocumentStructuredContent } from './document-page.types';
import {
  DocumentExtractionPipelineError,
  isDocumentProcessingError,
  mapAiExtractionFailure,
  mapClassificationFailure,
  mapStorageReadFailure,
  normalizeDocumentProcessingError,
} from './document-extraction.errors';
import { computeNextRetryAt } from './document-extraction-queue.util';
import { DocumentExtractionObservabilityService } from './document-extraction-observability.service';
import {
  bucketFileSizeBytes,
  mimeCategoryFromMime,
} from './document-extraction-observability.util';
import { isMalwareScanReadyForProcessing } from './document-malware-scan.util';
import { patchMistralTransferState } from './document-pipeline-lifecycle.util';

const SKIP_STATUSES = new Set([
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
  'AWAITING_DOCUMENT_TYPE',
  'CANCELLED',
]);

/**
 * AI Document Extraction worker.
 *
 * Flow: load record → guard status → atomic claim → OCR/text → (optional) classification
 * → structured extraction → plausibility → READY_FOR_REVIEW.
 */
@Injectable()
@Processor(QUEUE_NAMES.DOCUMENT_EXTRACTION, { concurrency: 3, lockDuration: 120_000 })
export class DocumentExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly contentExtractor: DocumentContentExtractorService,
    private readonly classification: DocumentClassificationService,
    private readonly aiExtraction: DocumentAiExtractionService,
    private readonly plausibility: DocumentExtractionPlausibilityService,
    @Inject(documentExtractionConfig.KEY)
    private readonly docConfig: ConfigType<typeof documentExtractionConfig>,
    private readonly observability: DocumentExtractionObservabilityService,
  ) {
    super();
  }

  async process(job: Job<DocumentExtractionJobData>): Promise<void> {
    const { extractionId } = job.data;

    const record = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!record) {
      this.logger.warn(`[DocExtract] extraction ${extractionId} not found — skipping`);
      return;
    }

    if (SKIP_STATUSES.has(record.status)) {
      this.logger.debug(`[DocExtract] skip terminal status=${record.status} id=${extractionId}`);
      return;
    }

    if (!record.objectKey) {
      await this.failPermanent(
        extractionId,
        'No stored file to extract',
        'QUEUE',
        DOCUMENT_EXTRACTION_ERROR_CODES.NO_STORED_FILE,
      );
      return;
    }

    if (!isMalwareScanReadyForProcessing(record.plausibility, this.docConfig.malwareScanEnabled)) {
      await this.failPermanent(
        extractionId,
        'Document is not cleared for processing',
        'QUEUE',
        DOCUMENT_EXTRACTION_ERROR_CODES.MALWARE_SCAN_PENDING,
      );
      return;
    }

    const claimed = await this.claimForProcessing(extractionId, job);
    if (!claimed) {
      this.observability.logEvent({
        extractionId,
        stage: 'QUEUE',
        status: 'skipped',
        attempt: (job.attemptsMade ?? 0) + 1,
      });
      this.logger.debug(`[DocExtract] could not claim extraction ${extractionId} — skipping duplicate`);
      return;
    }

    const mimeCategory = mimeCategoryFromMime(record.mimeType);
    const fileSizeBucket = bucketFileSizeBytes(record.sizeBytes);

    try {
      const ocrStartedAt = Date.now();
      const content = await this.resolveDocumentContent(record.objectKey, record, extractionId);
      this.observability.recordPages(content.sourceMethod, content.pageCount ?? content.pages.length);
      this.observability.logEvent({
        extractionId,
        stage: 'OCR',
        status: 'completed',
        mimeCategory,
        fileSizeBucket,
        pageCount: content.pageCount ?? content.pages.length,
        provider: content.ocrProvider ?? null,
        model: content.ocrModel ?? null,
      });
      const ocrCompletedAt = record.ocrCompletedAt ?? new Date();
      const plausibilityPatch =
        content.sourceMethod === 'OCR'
          ? patchMistralTransferState(record.plausibility, {
              provider: 'mistral',
              status: 'completed',
              sentAt: new Date(ocrStartedAt).toISOString(),
              completedAt: ocrCompletedAt.toISOString(),
              includesDocumentBytes: true,
              includesImageBase64: false,
              model: content.ocrModel ?? null,
              pageCount: content.pageCount ?? content.pages.length,
            })
          : record.plausibility;

      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: {
          processingStage: 'CLASSIFICATION',
          ocrCompletedAt,
          ...(content.sourceMethod === 'OCR'
            ? {
                ocrProvider: content.ocrProvider ?? null,
                ocrModel: content.ocrModel ?? null,
                ocrPageCount: content.pageCount ?? null,
              }
            : {}),
          plausibility: mergePipelinePlausibility(plausibilityPatch, {
            contentCache: buildContentCacheEntry(content, record.objectKey),
          }) as unknown as Prisma.InputJsonValue,
        },
      });

      let applyDocumentType = resolveEffectiveDocumentType(record);
      const needsClassification =
        !applyDocumentType &&
        (record.classificationMode === 'AUTO' ||
          isAutoClassificationRequest(record.requestedDocumentType));

      if (needsClassification) {
        const classificationResult = await this.runClassification(content);
        if (!classificationResult.success && classificationResult.error) {
          throw mapClassificationFailure(classificationResult.error);
        }

        const decision = evaluateClassificationDecision({
          detectedDocumentType: classificationResult.detectedDocumentType,
          confidence: classificationResult.confidence,
          rationale: classificationResult.rationale,
          allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
          thresholds: {
            autoContinueMinConfidence: this.docConfig.classificationAutoContinueMinConfidence,
            suggestionMinConfidence: this.docConfig.classificationSuggestionMinConfidence,
          },
        });

        const classificationCompletedAt = new Date();
        const detectedForDb = decision.detectedType;

        if (decision.action === 'AWAIT_USER') {
          this.observability.recordClassification(
            decision.hasSuggestion ? 'await_user_with_suggestion' : 'await_user',
          );
          this.observability.recordJobOutcome('AWAITING_DOCUMENT_TYPE', 'CLASSIFICATION');
          await this.prisma.vehicleDocumentExtraction.updateMany({
            where: { id: extractionId, status: 'PROCESSING' },
            data: {
              status: 'AWAITING_DOCUMENT_TYPE',
              processingStage: 'CLASSIFICATION',
              detectedDocumentType: detectedForDb,
              classificationConfidence: decision.confidence,
              classificationCompletedAt,
              effectiveDocumentType: null,
              documentType: null,
              extractedData: Prisma.DbNull,
              errorMessage: null,
              errorCode: null,
              errorPhase: null,
              plausibility: {
                ...mergePipelinePlausibility(record.plausibility, {
                  contentCache: buildContentCacheEntry(content, record.objectKey),
                }),
                classification: {
                  rationale: classificationResult.rationale,
                  sourcePages: classificationResult.sourcePages,
                  provider: classificationResult.provider,
                  model: classificationResult.model,
                  hasSuggestion: decision.hasSuggestion,
                  processingDurationMs: classificationResult.processingDurationMs,
                },
              } as unknown as Prisma.InputJsonValue,
            },
          });
          return;
        }

        applyDocumentType = decision.effectiveType;
        this.observability.recordClassification('auto_continue');
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: extractionId },
          data: {
            detectedDocumentType: decision.detectedType,
            classificationConfidence: decision.confidence,
            classificationCompletedAt,
            effectiveDocumentType: applyDocumentType,
            documentType: applyDocumentType,
            processingStage: 'EXTRACTION',
          },
        });
      } else if (!applyDocumentType) {
        this.observability.recordClassification('unknown');
        this.observability.recordJobOutcome('AWAITING_DOCUMENT_TYPE', 'CLASSIFICATION');
        await this.prisma.vehicleDocumentExtraction.updateMany({
          where: { id: extractionId, status: 'PROCESSING' },
          data: {
            status: 'AWAITING_DOCUMENT_TYPE',
            processingStage: 'CLASSIFICATION',
            errorMessage: null,
            errorCode: null,
            errorPhase: null,
          },
        });
        return;
      }

      await this.runExtraction(
        extractionId,
        record.vehicleId ?? job.data.vehicleId ?? null,
        applyDocumentType,
        content,
        record.plausibility,
      );
      this.observability.recordJobOutcome('READY_FOR_REVIEW', 'REVIEW');
    } catch (err) {
      await this.handleProcessingError(job, extractionId, err);
    }
  }

  private async resolveDocumentContent(
    objectKey: string,
    record: {
      plausibility?: unknown;
      ocrCompletedAt?: Date | null;
      mimeType?: string | null;
      sourceFileName?: string | null;
    },
    extractionId: string,
  ): Promise<
    DocumentStructuredContent & {
      ocrProvider?: string | null;
      ocrModel?: string | null;
      pageCount?: number;
      sourceMethod: string;
    }
  > {
    const cached = readContentCache(record.plausibility, objectKey);
    if (cached) {
      this.logger.debug(`[DocExtract] reuse OCR cache id=${extractionId}`);
      return {
        text: cached.text,
        pages: cached.pages,
        pageBoundaryReliable: cached.pageBoundaryReliable,
        sourceMethod: cached.sourceMethod,
        pageCount: cached.pageCount,
        ocrProvider: cached.ocrProvider,
        ocrModel: cached.ocrModel,
      };
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObject(objectKey);
    } catch (readErr) {
      throw mapStorageReadFailure(readErr);
    }

    return this.contentExtractor.extractContent({
      buffer,
      mimeType: record.mimeType ?? 'application/octet-stream',
      fileName: record.sourceFileName ?? undefined,
      extractionId,
    });
  }

  private async runClassification(
    content: DocumentStructuredContent,
  ) {
    const pageMeta = content.pages.map((page) => ({
      pageNumber: page.pageNumber,
      charCount: page.text.length,
      text: page.text,
    }));

    return this.classification.classify({
      documentText: content.text,
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      pages: pageMeta,
      pageBoundaryReliable: content.pageBoundaryReliable,
    });
  }

  private async runExtraction(
    extractionId: string,
    vehicleId: string | null,
    applyDocumentType: NonNullable<ReturnType<typeof resolveEffectiveDocumentType>>,
    content: DocumentStructuredContent,
    existingPlausibility: unknown,
  ): Promise<void> {
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { processingStage: 'EXTRACTION' },
    });

    const vehicle = vehicleId
      ? await this.prisma.vehicle.findUnique({
          where: { id: vehicleId },
          select: {
            vin: true,
            licensePlate: true,
            make: true,
            model: true,
            year: true,
            fuelType: true,
            mileageKm: true,
          },
        })
      : null;
    const latest = vehicleId
      ? await this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId },
          select: { odometerKm: true, dimoTokenId: true },
        })
      : null;
    const lastKnownOdometerKm = latest?.odometerKm ?? vehicle?.mileageKm ?? null;
    const dimoTokenId = latest?.dimoTokenId ?? undefined;

    const schema = getFieldSchema(applyDocumentType);
    const agentResult = await this.aiExtraction.extract({
      documentType: applyDocumentType,
      fields: schema.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        enumValues: f.enumValues,
      })),
      documentContent: {
        text: content.text,
        pages: content.pages,
        pageBoundaryReliable: content.pageBoundaryReliable,
      },
      vehicleContext: {
        vin: vehicle?.vin ?? undefined,
        licensePlate: vehicle?.licensePlate ?? undefined,
        make: vehicle?.make ?? undefined,
        model: vehicle?.model ?? undefined,
        year: vehicle?.year ?? undefined,
        fuelType: vehicle?.fuelType ? String(vehicle.fuelType) : undefined,
        lastKnownOdometerKm: lastKnownOdometerKm ?? undefined,
      },
      dimoTokenId,
    });

    if (!agentResult.success) {
      throw mapAiExtractionFailure(agentResult.error);
    }

    const fields =
      agentResult.fields && Object.keys(agentResult.fields).length > 0
        ? agentResult.fields
        : buildEmptyExtractedData(applyDocumentType);

    const plausibilityChecks = this.plausibility.runChecks(
      applyDocumentType,
      fields,
      {
        vin: vehicle?.vin,
        licensePlate: vehicle?.licensePlate,
        lastKnownOdometerKm,
        dimoContextAvailable: agentResult.dimoContextAvailable,
      },
      {
        extractionConflicts: agentResult.extractionConflicts,
        chunkingWarnings: agentResult.chunking?.limitExceeded
          ? [
              `Document exceeded extraction limits (${agentResult.chunking.limitCode ?? 'unknown'}) — uncovered pages: ${agentResult.chunking.uncoveredPageNumbers.join(', ') || 'n/a'}`,
            ]
          : undefined,
      },
    );
    const mergedNotes = Array.from(
      new Set([...(plausibilityChecks.recommendedHumanReviewNotes ?? []), ...agentResult.recommendedHumanReviewNotes]),
    );

    const existingPublic = stripPipelineFromPlausibility(existingPlausibility);
    const classificationMeta =
      existingPublic &&
      typeof existingPublic === 'object' &&
      !Array.isArray(existingPublic) &&
      (existingPublic as Record<string, unknown>).classification
        ? { classification: (existingPublic as Record<string, unknown>).classification }
        : {};

    const completedAt = new Date();
    await this.prisma.vehicleDocumentExtraction.updateMany({
      where: { id: extractionId, status: 'PROCESSING' },
      data: {
        extractedData: fields as Prisma.InputJsonValue,
        plausibility: {
          ...(typeof existingPublic === 'object' && existingPublic && !Array.isArray(existingPublic)
            ? existingPublic
            : {}),
          ...classificationMeta,
          overallStatus: plausibilityChecks.overallStatus,
          checks: plausibilityChecks.checks,
          recommendedHumanReviewNotes: mergedNotes,
          dimoContextAvailable: agentResult.dimoContextAvailable,
          sourceMethod: content.sourceMethod,
          contentPageCount: content.pageCount ?? null,
          extractionEvidence: agentResult.fieldEvidence ?? null,
          extractionConflicts: agentResult.extractionConflicts ?? null,
          chunking: agentResult.chunking ?? null,
        } as unknown as Prisma.InputJsonValue,
        status: 'READY_FOR_REVIEW',
        processingStage: 'REVIEW',
        processedAt: completedAt,
        extractionCompletedAt: completedAt,
        processingCompletedAt: completedAt,
        extractionProvider: agentResult.providerId ?? null,
        extractionModel: agentResult.modelId ?? null,
        errorMessage: null,
        errorCode: null,
        errorPhase: null,
        nextRetryAt: null,
      },
    });
  }

  private async claimForProcessing(extractionId: string, job: Job): Promise<boolean> {
    const startedAt = new Date();
    const attemptNumber = (job.attemptsMade ?? 0) + 1;
    const result = await this.prisma.vehicleDocumentExtraction.updateMany({
      where: {
        id: extractionId,
        status: { in: ['QUEUED', 'FAILED', 'PENDING'] },
      },
      data: {
        status: 'PROCESSING',
        processingStage: 'OCR',
        processingStartedAt: startedAt,
        processingAttempts: attemptNumber,
        errorMessage: null,
        errorCode: null,
        errorPhase: null,
        nextRetryAt: null,
      },
    });
    return result.count > 0;
  }

  private async handleProcessingError(
    job: Job<DocumentExtractionJobData>,
    extractionId: string,
    err: unknown,
  ): Promise<void> {
    const procErr = isDocumentProcessingError(err)
      ? err
      : normalizeDocumentProcessingError(err);

    const maxAttempts = job.opts.attempts ?? this.docConfig.jobAttempts;
    const currentAttempt = (job.attemptsMade ?? 0) + 1;
    const isLastAttempt = currentAttempt >= maxAttempts;

    if (procErr.retryable && !isLastAttempt) {
      const nextRetryAt = computeNextRetryAt(this.docConfig.jobBackoffMs, currentAttempt);
      this.observability.recordRetry(procErr.stage);
      this.observability.logEvent({
        extractionId,
        stage: procErr.stage,
        status: 'retry_scheduled',
        errorCode: procErr.code,
        attempt: currentAttempt,
      });
      await this.prisma.vehicleDocumentExtraction
        .updateMany({
          where: { id: extractionId, status: 'PROCESSING' },
          data: {
            status: 'QUEUED',
            processingStage: 'QUEUE',
            errorPhase: procErr.stage,
            errorCode: procErr.code,
            errorMessage: procErr.safeMessage.slice(0, 500),
            nextRetryAt,
          },
        })
        .catch((e) =>
          this.logger.warn(`[DocExtract] could not mark retry pending: ${(e as Error).message}`),
        );

      this.logger.warn(
        `[DocExtract] retryable failure id=${extractionId} attempt=${currentAttempt}/${maxAttempts} code=${procErr.code}`,
      );
      throw procErr;
    }

    await this.failPermanent(
      extractionId,
      procErr.safeMessage,
      procErr.stage,
      procErr.code,
    );
    this.observability.recordFailure(procErr.stage, procErr.code, procErr.retryable);
    this.observability.recordJobOutcome('FAILED', procErr.stage);

    if (procErr.retryable && isLastAttempt) {
      this.logger.error(
        `[DocExtract] final failure id=${extractionId} attempts=${currentAttempt} code=${procErr.code}`,
      );
    }
  }

  private async failPermanent(
    extractionId: string,
    message: string,
    errorPhase: DocumentExtractionPipelineError['stage'],
    errorCode: string,
  ): Promise<void> {
    const completedAt = new Date();
    await this.prisma.vehicleDocumentExtraction
      .updateMany({
        where: {
          id: extractionId,
          status: { in: ['PROCESSING', 'QUEUED', 'FAILED', 'PENDING'] },
        },
        data: {
          status: 'FAILED',
          processingStage: processingStageForErrorPhase(errorPhase),
          errorPhase,
          errorCode,
          errorMessage: message.slice(0, 500),
          processedAt: completedAt,
          processingCompletedAt: completedAt,
          nextRetryAt: null,
        },
      })
      .catch((e) => this.logger.warn(`[DocExtract] could not mark FAILED: ${(e as Error).message}`));
  }
}
