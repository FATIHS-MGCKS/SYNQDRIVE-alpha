import { Injectable, Inject, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { access } from 'fs/promises';
import { resolve } from 'path';
import documentExtractionConfig from '@config/document-extraction.config';
import aiConfig from '@config/ai.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { readPrometheusGaugeValue } from '@modules/observability/prometheus-gauge-reader.util';
import { PrismaService } from '@shared/database/prisma.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  getProcessRole,
  isDocumentWorkerSplitEnabled,
  shouldRegisterDocumentExtractionApi,
  shouldRegisterDocumentExtractionConsumers,
} from '@shared/runtime/process-role.util';
import { MistralOcrService } from '@modules/ai/providers/mistral/mistral-ocr.service';
import { DocumentAiExtractionService } from '@modules/ai/documents/document-ai-extraction.service';
import {
  DOCUMENT_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import type {
  DocumentExtractionHealthSnapshot,
  DocumentExtractionHealthStatus,
  DocumentExtractionHealthReadiness,
  DocumentExtractionProcessingEvent,
  DocumentExtractionQueueStats,
} from './document-extraction-health.types';

export type {
  DocumentExtractionHealthSnapshot,
  DocumentExtractionHealthStatus,
  DocumentExtractionHealthReadiness,
  DocumentExtractionProcessingEvent,
  DocumentExtractionQueueStats,
};

@Injectable()
export class DocumentExtractionHealthService {
  constructor(
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
    @Inject(aiConfig.KEY)
    private readonly aiCfg: ConfigType<typeof aiConfig>,
    @InjectQueue(QUEUE_NAMES.DOCUMENT_EXTRACTION) private readonly queue: Queue,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly mistralOcr: MistralOcrService,
    private readonly aiExtraction: DocumentAiExtractionService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async getHealth(): Promise<DocumentExtractionHealthSnapshot> {
    const workersEnabled = RuntimeStatusRegistry.getWorkersEnabled();
    const queueReachable = await this.probeQueue();
    const queueStats = queueReachable
      ? await this.collectQueueStats()
      : null;

    const storageReachable = await this.probeStorage();
    const mistralConfigured = this.mistralOcr.isConfigured();
    const aiExtractionConfigured = this.aiExtraction.isEnabled();

    const consumerRegisteredLocally = shouldRegisterDocumentExtractionConsumers();
    const workerConsumerPresent =
      queueReachable &&
      ((queueStats?.workerConsumers ?? 0) > 0 || consumerRegisteredLocally);
    const workerActive =
      workerConsumerPresent &&
      ((queueStats?.active ?? 0) > 0 || consumerRegisteredLocally);

    const recoverySchedulerActive =
      consumerRegisteredLocally &&
      this.config.queueEnabled &&
      workersEnabled &&
      canEnqueueQueue();

    const [lastSuccessfulProcessing, lastFailedProcessing] = await Promise.all([
      this.loadLastSuccessfulProcessing(),
      this.loadLastFailedProcessing(),
    ]);

    const readiness = this.resolveReadiness({
      queueEnabled: this.config.queueEnabled,
      queueReachable,
      workersEnabled,
      workerConsumerPresent,
      storageReachable,
      mistralConfigured,
      aiExtractionConfigured,
      queueStats,
    });

    const status = this.mapReadinessToStatus(readiness);

    return {
      status,
      readiness,
      processRole: getProcessRole(),
      workerSplitEnabled: isDocumentWorkerSplitEnabled(),
      apiRoleActive: shouldRegisterDocumentExtractionApi(),
      workerRoleActive: workerConsumerPresent,
      queueEnabled: this.config.queueEnabled,
      workersEnabled,
      queueReachable,
      workerConsumerPresent,
      workerActive,
      recoverySchedulerActive,
      storageProvider: this.config.storageProvider,
      storageReachable,
      mistralConfigured,
      mistralOcrModel: mistralConfigured ? this.aiCfg.mistralOcrModel : null,
      aiExtractionConfigured,
      processUptimeSeconds: Math.floor(process.uptime()),
      lastSuccessfulProcessing,
      lastFailedProcessing,
      queue: queueStats,
      workerRegistered: workerConsumerPresent,
      mistralOcrConfigured: mistralConfigured,
      storageAvailable: storageReachable,
      waitingJobs: queueStats?.waiting,
      activeJobs: queueStats?.active,
      failedJobs: queueStats?.failed,
    };
  }

  private resolveReadiness(input: {
    queueEnabled: boolean;
    queueReachable: boolean;
    workersEnabled: boolean;
    workerConsumerPresent: boolean;
    storageReachable: boolean;
    mistralConfigured: boolean;
    aiExtractionConfigured: boolean;
    queueStats: DocumentExtractionQueueStats | null;
  }): DocumentExtractionHealthReadiness {
    if (!input.queueEnabled || !input.queueReachable || !input.workersEnabled) {
      return 'not_ready';
    }
    if (!input.workerConsumerPresent) {
      return 'not_ready';
    }
    if (
      !input.storageReachable ||
      !input.mistralConfigured ||
      !input.aiExtractionConfigured
    ) {
      return 'degraded';
    }
    const waiting = input.queueStats?.waiting ?? 0;
    const active = input.queueStats?.active ?? 0;
    const ageSeconds = input.queueStats?.ageSeconds ?? 0;
    if (waiting > 0 && active === 0 && ageSeconds > 600) {
      return 'degraded';
    }
    return 'ready';
  }

  private mapReadinessToStatus(
    readiness: DocumentExtractionHealthReadiness,
  ): DocumentExtractionHealthStatus {
    if (readiness === 'ready') return 'ok';
    if (readiness === 'degraded') return 'degraded';
    return 'error';
  }

  private async probeQueue(): Promise<boolean> {
    if (!canEnqueueQueue()) return false;
    try {
      await this.queue.getJobCounts('waiting', 'active', 'failed');
      return true;
    } catch {
      return false;
    }
  }

  private async collectQueueStats(): Promise<DocumentExtractionQueueStats | null> {
    try {
      const [counts, workerConsumers] = await Promise.all([
        this.queue.getJobCounts('waiting', 'active', 'failed'),
        this.queue.getWorkersCount().catch(() => null),
      ]);

      const prometheusActive = this.metrics
        ? await readPrometheusGaugeValue(this.metrics.documentExtractionActiveJobs)
        : null;
      const prometheusAge = this.metrics
        ? await readPrometheusGaugeValue(this.metrics.documentExtractionQueueAge)
        : null;

      const redisActive = counts.active ?? 0;
      const redisWaiting = counts.waiting ?? 0;
      const redisFailed = counts.failed ?? 0;

      const active =
        prometheusActive != null && prometheusActive >= redisActive
          ? prometheusActive
          : redisActive;
      const ageSeconds =
        prometheusAge != null && prometheusAge >= 0 ? prometheusAge : null;

      return {
        waiting: redisWaiting,
        active,
        failed: redisFailed,
        ageSeconds,
        workerConsumers,
        source:
          prometheusActive != null || prometheusAge != null ? 'prometheus' : 'redis',
      };
    } catch {
      return null;
    }
  }

  private async probeStorage(): Promise<boolean> {
    if (this.config.storageProvider === 'local') {
      if (typeof this.storage.getInternalPath !== 'function') {
        return false;
      }
      try {
        const probeKey = 'health-probe';
        const internalPath = this.storage.getInternalPath(probeKey);
        if (!internalPath) return false;
        await access(resolve(internalPath, '..'));
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  private async loadLastSuccessfulProcessing(): Promise<DocumentExtractionProcessingEvent | null> {
    if (!this.prisma) return null;
    const row = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: {
        status: { in: ['READY_FOR_REVIEW', 'CONFIRMED', 'APPLIED', 'AWAITING_DOCUMENT_TYPE'] },
        processingCompletedAt: { not: null },
      },
      orderBy: { processingCompletedAt: 'desc' },
      select: {
        id: true,
        status: true,
        processingStage: true,
        processingCompletedAt: true,
      },
    });
    if (!row?.processingCompletedAt) return null;
    return {
      extractionId: row.id,
      at: row.processingCompletedAt.toISOString(),
      status: row.status,
      processingStage: row.processingStage,
    };
  }

  private async loadLastFailedProcessing(): Promise<DocumentExtractionProcessingEvent | null> {
    if (!this.prisma) return null;
    const row = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: {
        OR: [{ status: 'FAILED' }, { errorCode: { not: null } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        processingStage: true,
        errorCode: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    return {
      extractionId: row.id,
      at: row.updatedAt.toISOString(),
      status: row.status,
      processingStage: row.processingStage,
      errorCode: row.errorCode,
    };
  }
}
