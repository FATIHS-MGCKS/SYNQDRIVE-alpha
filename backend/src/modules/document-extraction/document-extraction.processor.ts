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
import { mergeDocumentTaxonomyPipeline, resolveDocumentTaxonomy } from './document-taxonomy.util';
import {
  buildContentCacheEntry,
  mergePipelinePlausibility,
  readContentCache,
  readPipelinePayload,
  stripPipelineFromPlausibility,
  PIPELINE_PLAUSIBILITY_KEY,
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
import { DocumentUploadContextService } from './document-upload-context.service';
import { VehicleCandidateResolverService } from './vehicle-candidate-resolver.service';
import { BookingCandidateResolverService } from './booking-candidate-resolver.service';
import { CustomerCandidateResolverService } from './customer-candidate-resolver.service';
import { DriverCandidateResolverService } from './driver-candidate-resolver.service';
import { PartnerCandidateResolverService } from './partner-candidate-resolver.service';
import { buildEntityCandidateRankingFromPipeline } from './entity-candidate-ranking.util';
import {
  evaluateUploadContextResolver,
  extractUploadResolverHints,
  readUploadContextPipelineState,
} from './document-upload-context.util';
import { mapFieldEvidence, readVehicleCandidatePipelineState } from './vehicle-candidate-matching.util';
import { readBookingCandidatePipelineState } from './booking-candidate-matching.util';
import { makePlausibilityCheck } from './document-plausibility.types';

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
    private readonly uploadContext: DocumentUploadContextService,
    private readonly vehicleCandidateResolver: VehicleCandidateResolverService,
    private readonly bookingCandidateResolver: BookingCandidateResolverService,
    private readonly customerCandidateResolver: CustomerCandidateResolverService,
    private readonly driverCandidateResolver: DriverCandidateResolverService,
    private readonly partnerCandidateResolver: PartnerCandidateResolverService,
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
        const classificationTaxonomy = resolveDocumentTaxonomy({
          legacyDocumentType: detectedForDb ?? classificationResult.detectedDocumentType ?? 'OTHER',
          source: 'classification',
        });
        const plausibilityWithTaxonomy = mergeDocumentTaxonomyPipeline(
          mergePipelinePlausibility(record.plausibility, {
            contentCache: buildContentCacheEntry(content, record.objectKey),
          }),
          classificationTaxonomy,
        );

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
                ...plausibilityWithTaxonomy,
                classification: {
                  rationale: classificationResult.rationale,
                  sourcePages: classificationResult.sourcePages,
                  provider: classificationResult.provider,
                  model: classificationResult.model,
                  hasSuggestion: decision.hasSuggestion,
                  processingDurationMs: classificationResult.processingDurationMs,
                  documentCategory: classificationResult.documentCategory,
                  documentSubtype: classificationResult.documentSubtype,
                  taxonomyVersion: classificationResult.taxonomyVersion,
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
            plausibility: {
              ...plausibilityWithTaxonomy,
              classification: {
                rationale: classificationResult.rationale,
                sourcePages: classificationResult.sourcePages,
                provider: classificationResult.provider,
                model: classificationResult.model,
                hasSuggestion: true,
                processingDurationMs: classificationResult.processingDurationMs,
                documentCategory: classificationResult.documentCategory,
                documentSubtype: classificationResult.documentSubtype,
                taxonomyVersion: classificationResult.taxonomyVersion,
              },
            } as unknown as Prisma.InputJsonValue,
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
        job.data.organizationId ?? record.organizationId ?? null,
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
    organizationId: string | null,
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

    const uploadPipeline = readUploadContextPipelineState(existingPlausibility);
    let pipelineWithContext = existingPlausibility;
    if (uploadPipeline?.candidate && organizationId) {
      const entitySnapshot = await this.uploadContext.loadEntitySnapshot(
        uploadPipeline.candidate.entityType,
        uploadPipeline.candidate.entityId,
        organizationId,
      );
      const resolver = evaluateUploadContextResolver({
        candidate: uploadPipeline.candidate,
        hints: extractUploadResolverHints(fields),
        entitySnapshot,
      });
      pipelineWithContext = mergePipelinePlausibility(existingPlausibility, {
        uploadContext: {
          ...uploadPipeline,
          resolver,
        },
      });
    }

    let finalChecks = plausibilityChecks.checks;
    let overallStatus = plausibilityChecks.overallStatus;

    if (organizationId && !vehicleId) {
      const uploadContextVehicleId =
        uploadPipeline?.candidate?.entityType === 'VEHICLE'
          ? uploadPipeline.candidate.entityId
          : null;
      const uploadContextBookingId =
        uploadPipeline?.candidate?.entityType === 'BOOKING'
          ? uploadPipeline.candidate.entityId
          : null;

      const vehicleCandidates = await this.vehicleCandidateResolver.resolve({
        organizationId,
        extractedData: fields as Record<string, unknown>,
        uploadContextVehicleId,
        uploadContextBookingId,
        fieldEvidence: mapFieldEvidence(agentResult.fieldEvidence),
        assignedVehicleId: vehicleId,
      });

      pipelineWithContext = mergePipelinePlausibility(pipelineWithContext, {
        vehicleCandidates,
      });

      if (vehicleCandidates.blockerPresent) {
        finalChecks = [
          ...finalChecks,
          makePlausibilityCheck({
            code: 'VEHICLE_CANDIDATE_VIN_PLATE_MISMATCH',
            status: 'BLOCKER',
            explanation:
              'OCR-VIN und OCR-Kennzeichen verweisen auf unterschiedliche Fahrzeuge in der Organisation.',
            fieldPaths: ['vin', 'licensePlate'],
            resolutionHint:
              'Kennzeichen oder VIN manuell prüfen und das richtige Fahrzeug zuordnen.',
            source: 'SYNQDRIVE_DB',
          }),
        ];
        overallStatus = 'BLOCKER';
      }
    }

    const vehiclePipeline = readVehicleCandidatePipelineState(pipelineWithContext);
    const resolvedVehicleId =
      vehicleId ?? vehiclePipeline?.candidates?.find((candidate) => candidate.rank === 1)?.vehicleId ?? null;

    if (
      organizationId &&
      resolvedVehicleId &&
      this.bookingCandidateResolver.supportsDocumentType(applyDocumentType)
    ) {
      const uploadContextBookingId =
        uploadPipeline?.candidate?.entityType === 'BOOKING'
          ? uploadPipeline.candidate.entityId
          : null;

      const bookingCandidates = await this.bookingCandidateResolver.resolve({
        organizationId,
        vehicleId: resolvedVehicleId,
        documentType: applyDocumentType,
        extractedData: fields as Record<string, unknown>,
        uploadContextBookingId,
        fieldEvidence: mapFieldEvidence(agentResult.fieldEvidence),
      });

      pipelineWithContext = mergePipelinePlausibility(pipelineWithContext, {
        bookingCandidates,
      });
    }

    const bookingPipeline = readBookingCandidatePipelineState(pipelineWithContext);
    const linkedBookingId =
      uploadPipeline?.candidate?.entityType === 'BOOKING'
        ? uploadPipeline.candidate.entityId
        : bookingPipeline?.candidates?.find((candidate) => candidate.rank === 1)?.bookingId ?? null;
    const uploadContextCustomerId =
      uploadPipeline?.candidate?.entityType === 'CUSTOMER'
        ? uploadPipeline.candidate.entityId
        : null;
    const uploadContextDriverId =
      uploadPipeline?.candidate?.entityType === 'DRIVER'
        ? uploadPipeline.candidate.entityId
        : null;

    if (organizationId && this.customerCandidateResolver.supportsDocumentType(applyDocumentType)) {
      const customerCandidates = await this.customerCandidateResolver.resolve({
        organizationId,
        documentType: applyDocumentType,
        extractedData: fields as Record<string, unknown>,
        uploadContextCustomerId,
        linkedBookingId,
      });

      pipelineWithContext = mergePipelinePlausibility(pipelineWithContext, {
        customerCandidates,
      });
    }

    if (organizationId && this.driverCandidateResolver.supportsDocumentType(applyDocumentType)) {
      const driverCandidates = await this.driverCandidateResolver.resolve({
        organizationId,
        documentType: applyDocumentType,
        extractedData: fields as Record<string, unknown>,
        linkedBookingId,
        uploadContextDriverId,
        resolvedVehicleId,
      });

      pipelineWithContext = mergePipelinePlausibility(pipelineWithContext, {
        driverCandidates,
      });
    }

    if (organizationId && this.partnerCandidateResolver.supportsDocumentType(applyDocumentType)) {
      const partnerCandidates = await this.partnerCandidateResolver.resolve({
        organizationId,
        documentType: applyDocumentType,
        extractedData: fields as Record<string, unknown>,
        resolvedVehicleId,
      });

      pipelineWithContext = mergePipelinePlausibility(pipelineWithContext, {
        partnerCandidates,
      });
    }

    const uploadContextAfterResolvers = readUploadContextPipelineState(pipelineWithContext);
    const entityCandidateRanking = buildEntityCandidateRankingFromPipeline({
      documentType: applyDocumentType,
      plausibility: pipelineWithContext,
      uploadContextResolverStatus: uploadContextAfterResolvers?.resolver?.status ?? null,
    });
    pipelineWithContext = mergePipelinePlausibility(pipelineWithContext, {
      entityCandidateRanking,
    });

    const existingPublic = stripPipelineFromPlausibility(pipelineWithContext);
    const classificationMeta =
      existingPublic &&
      typeof existingPublic === 'object' &&
      !Array.isArray(existingPublic) &&
      (existingPublic as Record<string, unknown>).classification
        ? { classification: (existingPublic as Record<string, unknown>).classification }
        : {};

    const completedAt = new Date();
    const pipelinePayload = readPipelinePayload(pipelineWithContext);
    await this.prisma.vehicleDocumentExtraction.updateMany({
      where: { id: extractionId, status: 'PROCESSING' },
      data: {
        extractedData: fields as Prisma.InputJsonValue,
        plausibility: {
          ...(typeof existingPublic === 'object' && existingPublic && !Array.isArray(existingPublic)
            ? existingPublic
            : {}),
          ...classificationMeta,
          overallStatus,
          checks: finalChecks,
          recommendedHumanReviewNotes: mergedNotes,
          dimoContextAvailable: agentResult.dimoContextAvailable,
          sourceMethod: content.sourceMethod,
          contentPageCount: content.pageCount ?? null,
          extractionEvidence: agentResult.fieldEvidence ?? null,
          extractionConflicts: agentResult.extractionConflicts ?? null,
          chunking: agentResult.chunking ?? null,
          [PIPELINE_PLAUSIBILITY_KEY]: pipelinePayload,
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
