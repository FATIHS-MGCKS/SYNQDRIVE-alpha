import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import documentExtractionConfig from '@config/document-extraction.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { MistralOcrService } from '@modules/ai/providers/mistral/mistral-ocr.service';
import { DocumentAiExtractionService } from '@modules/ai/documents/document-ai-extraction.service';
import {
  DOCUMENT_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';

export interface DocumentExtractionHealthSnapshot {
  status: 'ok' | 'degraded' | 'error';
  queueEnabled: boolean;
  workersEnabled: boolean;
  queueReachable: boolean;
  workerRegistered: boolean;
  mistralOcrConfigured: boolean;
  aiExtractionConfigured: boolean;
  storageProvider: string;
  storageAvailable: boolean;
  waitingJobs?: number;
  activeJobs?: number;
  failedJobs?: number;
}

@Injectable()
export class DocumentExtractionHealthService {
  constructor(
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
    @InjectQueue(QUEUE_NAMES.DOCUMENT_EXTRACTION) private readonly queue: Queue,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly mistralOcr: MistralOcrService,
    private readonly aiExtraction: DocumentAiExtractionService,
  ) {}

  async getHealth(): Promise<DocumentExtractionHealthSnapshot> {
    const workersEnabled = RuntimeStatusRegistry.getWorkersEnabled();
    const queueReachable = await this.probeQueue();
    const counts = queueReachable ? await this.safeQueueCounts() : null;
    const storageAvailable = this.probeStorage();

    const mistralOcrConfigured = this.mistralOcr.isConfigured();
    const aiExtractionConfigured = this.aiExtraction.isEnabled();

    const hardOk =
      this.config.queueEnabled &&
      workersEnabled &&
      queueReachable &&
      storageAvailable &&
      mistralOcrConfigured &&
      aiExtractionConfigured;

    const status: DocumentExtractionHealthSnapshot['status'] = hardOk
      ? 'ok'
      : !this.config.queueEnabled || !workersEnabled || !queueReachable
        ? 'error'
        : 'degraded';

    return {
      status,
      queueEnabled: this.config.queueEnabled,
      workersEnabled,
      queueReachable,
      workerRegistered: workersEnabled && queueReachable,
      mistralOcrConfigured,
      aiExtractionConfigured,
      storageProvider: this.config.storageProvider,
      storageAvailable,
      waitingJobs: counts?.waiting,
      activeJobs: counts?.active,
      failedJobs: counts?.failed,
    };
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

  private async safeQueueCounts(): Promise<{
    waiting: number;
    active: number;
    failed: number;
  } | null> {
    try {
      const counts = await this.queue.getJobCounts('waiting', 'active', 'failed');
      return {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
      };
    } catch {
      return null;
    }
  }

  private probeStorage(): boolean {
    if (this.config.storageProvider === 'local') {
      return typeof this.storage.getInternalPath === 'function';
    }
    return true;
  }
}
