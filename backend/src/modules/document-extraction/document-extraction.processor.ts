import { Injectable, Logger, Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  DOCUMENT_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import { DocumentTextExtractorService } from './document-text-extractor.service';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import { DimoDocumentAgentService } from '@modules/dimo/dimo-document-agent.service';
import { getFieldSchema, buildEmptyExtractedData } from './document-extraction.schemas';
import { DocumentExtractionJobData } from './document-extraction.types';
import {
  OcrNotConfiguredError,
  UnsupportedFileTypeError,
} from './document-extraction.errors';

/**
 * AI Document Extraction worker.
 *
 * Flow: load record → guard status → PROCESSING → read stored file → extract
 * text → load vehicle/DIMO context → DIMO agent (structured JSON) → server-side
 * plausibility → persist extractedData + plausibility → READY_FOR_REVIEW.
 * Any handled failure sets FAILED with a sanitized message (no auto-retry; the
 * user can re-trigger via the retry endpoint). Domain application happens only
 * after human confirmation — never here.
 */
@Injectable()
@Processor(QUEUE_NAMES.DOCUMENT_EXTRACTION, { concurrency: 3 })
export class DocumentExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly textExtractor: DocumentTextExtractorService,
    private readonly agent: DimoDocumentAgentService,
    private readonly plausibility: DocumentExtractionPlausibilityService,
  ) {
    super();
  }

  async process(job: Job<DocumentExtractionJobData>): Promise<void> {
    const { extractionId, vehicleId } = job.data;

    const record = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!record) {
      this.logger.warn(`[DocExtract] extraction ${extractionId} not found — skipping`);
      return;
    }

    // Idempotency: do not reprocess reviewable/confirmed/applied records.
    if (['READY_FOR_REVIEW', 'CONFIRMED', 'APPLIED'].includes(record.status)) {
      return;
    }
    if (!record.objectKey) {
      await this.fail(extractionId, 'No stored file to extract');
      return;
    }

    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { status: 'PROCESSING' },
    });

    try {
      // 1) Read stored file (private object storage)
      const buffer = await this.storage.getObject(record.objectKey);

      // 2) Extract text (PDF/text; image OCR throws a clear, user-safe error)
      const { text } = await this.textExtractor.extractText({
        buffer,
        mimeType: record.mimeType ?? 'application/octet-stream',
        fileName: record.sourceFileName ?? undefined,
      });

      // 3) Vehicle + DIMO context
      const vehicle = await this.prisma.vehicle.findUnique({
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
      });
      const latest = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { odometerKm: true, dimoTokenId: true },
      });
      const lastKnownOdometerKm = latest?.odometerKm ?? vehicle?.mileageKm ?? null;
      const dimoTokenId = latest?.dimoTokenId ?? undefined;

      // 4) DIMO agent — structured extraction (vehicle-aware)
      const schema = getFieldSchema(record.documentType);
      const agentResult = await this.agent.extract({
        documentType: record.documentType,
        fields: schema.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          enumValues: f.enumValues,
        })),
        rawText: text,
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
        await this.fail(extractionId, agentResult.error || 'AI extraction failed');
        return;
      }

      const fields =
        agentResult.fields && Object.keys(agentResult.fields).length > 0
          ? agentResult.fields
          : buildEmptyExtractedData(record.documentType);

      // 5) Server-side plausibility (authoritative; never blocks storage)
      const plausibility = this.plausibility.runChecks(record.documentType, fields, {
        vin: vehicle?.vin,
        licensePlate: vehicle?.licensePlate,
        lastKnownOdometerKm,
        dimoContextAvailable: agentResult.dimoContextAvailable,
      });
      // Merge agent advisory notes (deduped).
      const mergedNotes = Array.from(
        new Set([...(plausibility.recommendedHumanReviewNotes ?? []), ...agentResult.recommendedHumanReviewNotes]),
      );

      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: {
          extractedData: fields as Prisma.InputJsonValue,
          plausibility: {
            overallStatus: plausibility.overallStatus,
            checks: plausibility.checks,
            recommendedHumanReviewNotes: mergedNotes,
            dimoContextAvailable: agentResult.dimoContextAvailable,
          } as unknown as Prisma.InputJsonValue,
          status: 'READY_FOR_REVIEW',
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (err) {
      const message =
        err instanceof OcrNotConfiguredError || err instanceof UnsupportedFileTypeError
          ? err.message
          : this.sanitize(err);
      await this.fail(extractionId, message);
    }
  }

  private async fail(extractionId: string, message: string): Promise<void> {
    await this.prisma.vehicleDocumentExtraction
      .update({
        where: { id: extractionId },
        data: { status: 'FAILED', errorMessage: message.slice(0, 500), processedAt: new Date() },
      })
      .catch((e) => this.logger.warn(`[DocExtract] could not mark FAILED: ${(e as Error).message}`));
  }

  private sanitize(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').slice(0, 300);
  }
}
