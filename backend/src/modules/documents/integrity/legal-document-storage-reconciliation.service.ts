import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { OrganizationLegalDocument, Prisma } from '@prisma/client';
import documentsConfig from '@config/documents.config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENTS_STORAGE,
  type DocumentStoragePort,
} from '../storage/document-storage.interface';
import { LegalDocumentChecksumVerificationService } from './legal-document-checksum-verification.service';
import { LegalDocumentIntegrityPersistenceService } from './legal-document-integrity-persistence.service';
import { LegalDocumentIntegrityAlertService } from './legal-document-integrity-alert.service';
import {
  LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS,
} from './legal-document-integrity.constants';
import {
  emptyReconciliationMetrics,
  incrementMetricForStatus,
  type LegalDocumentStorageReconciliationDrift,
  type LegalDocumentStorageReconciliationMetrics,
  type LegalDocumentStorageReconciliationRunResult,
} from './legal-document-integrity.types';

export interface LegalDocumentStorageReconciliationOptions {
  organizationId?: string | null;
  dryRun?: boolean;
  resumeRunId?: string | null;
  batchSize?: number;
  rateLimitMs?: number;
  signal?: AbortSignal;
  correlationId?: string | null;
  scanUnexpectedObjects?: boolean;
}

@Injectable()
export class LegalDocumentStorageReconciliationService {
  private readonly logger = new Logger(LegalDocumentStorageReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
    @Inject(DOCUMENTS_STORAGE)
    private readonly storage: DocumentStoragePort,
    private readonly verification: LegalDocumentChecksumVerificationService,
    private readonly persistence: LegalDocumentIntegrityPersistenceService,
    private readonly alerts: LegalDocumentIntegrityAlertService,
  ) {}

  async run(
    options: LegalDocumentStorageReconciliationOptions = {},
  ): Promise<LegalDocumentStorageReconciliationRunResult> {
    const started = Date.now();
    const dryRun = options.dryRun ?? true;
    const batchSize = options.batchSize ?? this.config.integrityReconciliationBatchSize;
    const rateLimitMs = options.rateLimitMs ?? this.config.integrityReconciliationRateLimitMs;
    const organizationId = options.organizationId ?? null;
    const metrics = emptyReconciliationMetrics();
    const drifts: LegalDocumentStorageReconciliationDrift[] = [];

    let run = await this.createOrResumeRun(options);
    let cursor = run.cursor ?? undefined;

    this.alerts.resetAlertCounter();

    try {
      while (true) {
        if (options.signal?.aborted) {
          run = await this.markInterrupted(run.id, cursor ?? null, metrics);
          break;
        }

        const batch = await this.loadDocumentBatch(organizationId, cursor, batchSize);
        if (batch.length === 0) break;

        metrics.batches += 1;

        for (const doc of batch) {
          if (options.signal?.aborted) break;

          const result = await this.verification.verify({
            organizationId: doc.organizationId,
            legalDocumentId: doc.id,
            objectKey: doc.objectKey,
            checksum: doc.checksum,
            sizeBytes: doc.sizeBytes,
          });

          incrementMetricForStatus(metrics, result.status);

          if (result.status !== 'VERIFIED' && result.status !== 'UNVERIFIED') {
            drifts.push({
              kind: result.status as LegalDocumentStorageReconciliationDrift['kind'],
              organizationId: doc.organizationId,
              legalDocumentId: doc.id,
              objectKey: doc.objectKey,
              detail: result.detail,
              expectedChecksum: result.expectedChecksum,
              actualChecksum: result.actualChecksum,
            });
          }

          await this.persistence.applyVerificationResult(doc, result, {
            source: 'reconciliation',
            dryRun,
          });

          cursor = doc.id;
          await this.checkpointRun(run.id, cursor, metrics);

          if (rateLimitMs > 0) {
            await this.sleep(rateLimitMs);
          }
        }

        if (batch.length < batchSize) break;
      }

      if (options.scanUnexpectedObjects !== false) {
        const unexpected = await this.scanUnexpectedObjects(organizationId, dryRun);
        metrics.unexpectedObjects += unexpected.length;
        drifts.push(...unexpected);
      }

      metrics.durationMs = Date.now() - started;

      if (!options.signal?.aborted) {
        run = await this.completeRun(run.id, metrics);
      }

      return {
        runId: run.id,
        organizationId,
        dryRun,
        status: run.status,
        metrics,
        drifts,
        resumedFromRunId: options.resumeRunId ?? null,
      };
    } catch (err) {
      metrics.durationMs = Date.now() - started;
      await this.failRun(run.id, metrics, (err as Error).message);
      throw err;
    }
  }

  private async loadDocumentBatch(
    organizationId: string | null,
    cursor: string | undefined,
    batchSize: number,
  ): Promise<OrganizationLegalDocument[]> {
    return this.prisma.organizationLegalDocument.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
        objectKey: { not: '' },
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
  }

  private async scanUnexpectedObjects(
    organizationId: string | null,
    dryRun: boolean,
  ): Promise<LegalDocumentStorageReconciliationDrift[]> {
    const drifts: LegalDocumentStorageReconciliationDrift[] = [];
    const orgIds = organizationId
      ? [organizationId]
      : (
          await this.prisma.organizationLegalDocument.findMany({
            distinct: ['organizationId'],
            select: { organizationId: true },
          })
        ).map((row) => row.organizationId);

    for (const orgId of orgIds) {
      const knownKeys = new Set(
        (
          await this.prisma.organizationLegalDocument.findMany({
            where: { organizationId: orgId },
            select: { objectKey: true, quarantineObjectKey: true },
          })
        ).flatMap((row) => [row.objectKey, row.quarantineObjectKey].filter(Boolean) as string[]),
      );

      let cursor: string | null = null;
      let hasMore = true;
      while (hasMore) {
        const page = await this.storage.listObjectKeysForOrganization({
          organizationId: orgId,
          cursor,
          limit: 200,
          zone: 'all',
        });
        for (const key of page.keys) {
          if (!knownKeys.has(key)) {
            drifts.push({
              kind: 'UNEXPECTED_OBJECT',
              organizationId: orgId,
              objectKey: key,
              detail: 'Storage object without matching database record',
            });
            await this.persistence.markUnexpectedObject({
              organizationId: orgId,
              objectKey: key,
              dryRun,
            });
          }
        }
        cursor = page.nextCursor;
        hasMore = Boolean(page.nextCursor);
      }
    }

    return drifts;
  }

  private async createOrResumeRun(options: LegalDocumentStorageReconciliationOptions) {
    if (options.resumeRunId) {
      const existing = await this.prisma.legalDocumentStorageReconciliationRun.findUnique({
        where: { id: options.resumeRunId },
      });
      if (!existing) {
        throw new Error(`Reconciliation run not found: ${options.resumeRunId}`);
      }
      return this.prisma.legalDocumentStorageReconciliationRun.update({
        where: { id: existing.id },
        data: {
          status: LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.RUNNING,
          interruptedAt: null,
        },
      });
    }

    return this.prisma.legalDocumentStorageReconciliationRun.create({
      data: {
        organizationId: options.organizationId ?? null,
        dryRun: options.dryRun ?? true,
        status: LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.RUNNING,
        correlationId: options.correlationId ?? null,
        metrics: emptyReconciliationMetrics() as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async checkpointRun(
    runId: string,
    cursor: string,
    metrics: LegalDocumentStorageReconciliationMetrics,
  ): Promise<void> {
    await this.prisma.legalDocumentStorageReconciliationRun.update({
      where: { id: runId },
      data: {
        cursor,
        metrics: metrics as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async completeRun(
    runId: string,
    metrics: LegalDocumentStorageReconciliationMetrics,
  ) {
    return this.prisma.legalDocumentStorageReconciliationRun.update({
      where: { id: runId },
      data: {
        status: LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.COMPLETED,
        completedAt: new Date(),
        metrics: metrics as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async markInterrupted(
    runId: string,
    cursor: string | null,
    metrics: LegalDocumentStorageReconciliationMetrics,
  ) {
    return this.prisma.legalDocumentStorageReconciliationRun.update({
      where: { id: runId },
      data: {
        status: LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.INTERRUPTED,
        interruptedAt: new Date(),
        cursor,
        metrics: metrics as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async failRun(
    runId: string,
    metrics: LegalDocumentStorageReconciliationMetrics,
    detail: string,
  ): Promise<void> {
    await this.prisma.legalDocumentStorageReconciliationRun.update({
      where: { id: runId },
      data: {
        status: LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.FAILED,
        completedAt: new Date(),
        metrics: {
          ...metrics,
          storageError: metrics.storageError + 1,
          detail,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
