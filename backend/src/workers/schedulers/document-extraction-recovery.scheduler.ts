import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import documentExtractionConfig from '@config/document-extraction.config';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { DocumentExtractionService } from '@modules/document-extraction/document-extraction.service';
import { resolveEffectiveDocumentType } from '@modules/document-extraction/document-extraction-lifecycle.util';
import {
  logRecoveryAction,
  readQueueRecoveryCount,
  withIncrementedRecoveryCount,
} from '@modules/document-extraction/document-extraction-recovery.util';
import { DocumentExtractionObservabilityService } from '@modules/document-extraction/document-extraction-observability.service';

/**
 * Conservative recovery scheduler for document.extraction jobs.
 */
@Injectable()
export class DocumentExtractionRecoveryScheduler {
  private readonly logger = new Logger(DocumentExtractionRecoveryScheduler.name);
  private recoveryInProgress = false;

  constructor(
    @InjectQueue(QUEUE_NAMES.DOCUMENT_EXTRACTION) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly extractionService: DocumentExtractionService,
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
    private readonly observability: DocumentExtractionObservabilityService,
  ) {}

  @Interval(120_000)
  async recoverStaleExtractions(): Promise<void> {
    if (!this.config.queueEnabled) return;
    if (!canEnqueueQueue(this.logger, 'document-extraction-recovery')) return;
    if (this.recoveryInProgress) return;

    this.recoveryInProgress = true;
    try {
      const now = Date.now();
      await Promise.all([
        this.recoverStaleQueued(new Date(now - this.config.staleQueuedThresholdMs)),
        this.recoverStaleProcessing(new Date(now - this.config.staleProcessingThresholdMs)),
        this.recoverStaleConfirmedApply(new Date(now - this.config.staleConfirmedApplyThresholdMs)),
      ]);
    } finally {
      this.recoveryInProgress = false;
    }
  }

  private async recoverStaleQueued(olderThan: Date): Promise<void> {
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        status: 'QUEUED',
        queuedAt: { lt: olderThan },
        objectKey: { not: null },
      },
      take: 25,
    });

    for (const row of rows) {
      if (readQueueRecoveryCount(row.plausibility) >= this.config.maxRecoveryAttempts) continue;
      if (await this.extractionService.hasActiveExtractionJob(row.id)) continue;
      const applyType = resolveEffectiveDocumentType(row);
      if (!applyType || !row.objectKey) continue;

      const enqueue = await this.extractionService.enqueueExtraction(row.id, {
        extractionId: row.id,
        vehicleId: row.vehicleId,
        organizationId: row.organizationId,
        documentType: applyType,
        objectKey: row.objectKey,
      });
      if (!enqueue.ok) continue;

      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: row.id },
        data: {
          plausibility: withIncrementedRecoveryCount(row.plausibility),
          queuedAt: new Date(),
          errorPhase: null,
          errorCode: null,
          errorMessage: null,
        },
      });
      logRecoveryAction(this.logger, 're-enqueued stale QUEUED', row.id);
      this.observability.recordRecovery({ kind: 'pipeline', outcome: 'recovered' });
    }
  }

  private async recoverStaleProcessing(olderThan: Date): Promise<void> {
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        status: 'PROCESSING',
        processingStartedAt: { lt: olderThan },
        objectKey: { not: null },
      },
      take: 25,
    });

    for (const row of rows) {
      if (readQueueRecoveryCount(row.plausibility) >= this.config.maxRecoveryAttempts) continue;
      if (await this.extractionService.hasActiveExtractionJob(row.id)) continue;
      const applyType = resolveEffectiveDocumentType(row);
      if (!applyType || !row.objectKey) continue;

      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: row.id },
        data: {
          status: 'PENDING',
          processingStage: 'STORAGE',
          plausibility: withIncrementedRecoveryCount(row.plausibility),
        },
      });

      const enqueue = await this.extractionService.enqueueExtraction(row.id, {
        extractionId: row.id,
        vehicleId: row.vehicleId,
        organizationId: row.organizationId,
        documentType: applyType,
        objectKey: row.objectKey,
      });
      if (!enqueue.ok) continue;

      await this.extractionService.markQueuedAfterEnqueue(row.id);
      logRecoveryAction(this.logger, 'recovered stale PROCESSING', row.id);
      this.observability.recordRecovery({ kind: 'pipeline', outcome: 'recovered' });
    }
  }

  private async recoverStaleConfirmedApply(olderThan: Date): Promise<void> {
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        status: 'CONFIRMED',
        appliedAt: null,
        updatedAt: { lt: olderThan },
        confirmedData: { not: Prisma.DbNull },
      },
      take: 10,
    });

    for (const row of rows) {
      if (readQueueRecoveryCount(row.plausibility) >= this.config.maxRecoveryAttempts) continue;
      const ok = await this.extractionService.retryConfirmedApply(row.id);
      if (ok) {
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: row.id },
          data: { plausibility: withIncrementedRecoveryCount(row.plausibility) },
        });
        logRecoveryAction(this.logger, 'retried stale CONFIRMED apply', row.id);
        this.observability.recordRecovery({ kind: 'pipeline', outcome: 'recovered' });
      }
    }
  }
}
