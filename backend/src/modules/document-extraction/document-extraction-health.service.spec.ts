import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import documentExtractionConfig from '@config/document-extraction.config';
import aiConfig from '@config/ai.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { MistralOcrService } from '@modules/ai/providers/mistral/mistral-ocr.service';
import { DocumentAiExtractionService } from '@modules/ai/documents/document-ai-extraction.service';
import { DOCUMENT_STORAGE } from './storage/document-storage.interface';
import { DocumentExtractionHealthService } from './document-extraction-health.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { Gauge, Registry } from 'prom-client';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

jest.mock('@shared/runtime/process-role.util', () => ({
  getProcessRole: jest.fn(() => 'all'),
  isDocumentWorkerSplitEnabled: jest.fn(() => false),
  shouldRegisterDocumentExtractionApi: jest.fn(() => true),
  shouldRegisterDocumentExtractionConsumers: jest.fn(() => true),
}));

import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  getProcessRole,
  isDocumentWorkerSplitEnabled,
  shouldRegisterDocumentExtractionApi,
  shouldRegisterDocumentExtractionConsumers,
} from '@shared/runtime/process-role.util';

describe('DocumentExtractionHealthService', () => {
  const docConfig = {
    queueEnabled: true,
    storageProvider: 'local',
    localStorageDir: './storage/documents',
  };
  const aiCfg = { mistralOcrModel: 'mistral-ocr-latest' };

  function buildMetrics(active = 1, ageSeconds = 0) {
    const registry = new Registry();
    const documentExtractionActiveJobs = new Gauge({
      name: 'synqdrive_document_extraction_active_jobs_test',
      help: 'test',
      registers: [registry],
    });
    const documentExtractionQueueAge = new Gauge({
      name: 'synqdrive_document_extraction_queue_age_seconds_test',
      help: 'test',
      registers: [registry],
    });
    documentExtractionActiveJobs.set(active);
    documentExtractionQueueAge.set(ageSeconds);
    return {
      documentExtractionActiveJobs,
      documentExtractionQueueAge,
    } as unknown as TripMetricsService;
  }

  function buildModule(overrides: {
    queue?: Record<string, unknown>;
    storage?: Record<string, unknown>;
    mistral?: Partial<Record<'isConfigured', jest.Mock>>;
    ai?: Partial<Record<'isEnabled', jest.Mock>>;
    prisma?: Record<string, unknown>;
    metrics?: TripMetricsService;
  } = {}) {
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 1, failed: 0 }),
      getWorkersCount: jest.fn().mockResolvedValue(1),
      ...(overrides.queue ?? {}),
    };
    const storage = {
      getInternalPath: jest.fn().mockReturnValue('/tmp/docs/health-probe'),
      ...(overrides.storage ?? {}),
    };
    const mistralOcr = { isConfigured: jest.fn().mockReturnValue(true), ...(overrides.mistral ?? {}) };
    const aiExtraction = { isEnabled: jest.fn().mockReturnValue(true), ...(overrides.ai ?? {}) };
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue(null),
        ...(overrides.prisma ?? {}),
      },
    };

    return Test.createTestingModule({
      providers: [
        DocumentExtractionHealthService,
        { provide: documentExtractionConfig.KEY, useValue: docConfig },
        { provide: aiConfig.KEY, useValue: aiCfg },
        { provide: getQueueToken(QUEUE_NAMES.DOCUMENT_EXTRACTION), useValue: queue },
        { provide: DOCUMENT_STORAGE, useValue: storage },
        { provide: MistralOcrService, useValue: mistralOcr },
        { provide: DocumentAiExtractionService, useValue: aiExtraction },
        { provide: PrismaService, useValue: prisma },
        { provide: TripMetricsService, useValue: overrides.metrics ?? buildMetrics() },
      ],
    }).compile();
  }

  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    (canEnqueueQueue as jest.Mock).mockReturnValue(true);
    (getProcessRole as jest.Mock).mockReturnValue('all');
    (isDocumentWorkerSplitEnabled as jest.Mock).mockReturnValue(false);
    (shouldRegisterDocumentExtractionApi as jest.Mock).mockReturnValue(true);
    (shouldRegisterDocumentExtractionConsumers as jest.Mock).mockReturnValue(true);
    jest.spyOn(require('fs/promises'), 'access').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports ready with runtime fields when pipeline is healthy', async () => {
    const successAt = new Date('2026-07-17T10:00:00.000Z');
    const module = await buildModule({
      prisma: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'ext-ok',
            status: 'READY_FOR_REVIEW',
            processingStage: 'REVIEW',
            processingCompletedAt: successAt,
          })
          .mockResolvedValueOnce(null),
      },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();

    expect(health.readiness).toBe('ready');
    expect(health.status).toBe('ok');
    expect(health.apiRoleActive).toBe(true);
    expect(health.workerRoleActive).toBe(true);
    expect(health.workerConsumerPresent).toBe(true);
    expect(health.recoverySchedulerActive).toBe(true);
    expect(health.mistralConfigured).toBe(true);
    expect(health.mistralOcrModel).toBe('mistral-ocr-latest');
    expect(health.storageReachable).toBe(true);
    expect(health.processUptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(health.queue).toMatchObject({ waiting: 2, active: 1, failed: 0, workerConsumers: 1 });
    expect(health.lastSuccessfulProcessing).toEqual({
      extractionId: 'ext-ok',
      at: successAt.toISOString(),
      status: 'READY_FOR_REVIEW',
      processingStage: 'REVIEW',
    });
  });

  it('reports not_ready when no BullMQ consumer is connected in api split mode', async () => {
    (getProcessRole as jest.Mock).mockReturnValue('api');
    (isDocumentWorkerSplitEnabled as jest.Mock).mockReturnValue(true);
    (shouldRegisterDocumentExtractionConsumers as jest.Mock).mockReturnValue(false);

    const module = await buildModule({
      queue: {
        getWorkersCount: jest.fn().mockResolvedValue(0),
      },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();

    expect(health.readiness).toBe('not_ready');
    expect(health.status).toBe('error');
    expect(health.apiRoleActive).toBe(true);
    expect(health.workerRoleActive).toBe(false);
    expect(health.workerConsumerPresent).toBe(false);
    expect(health.recoverySchedulerActive).toBe(false);
  });

  it('reports error when queue is unreachable', async () => {
    const module = await buildModule({
      queue: { getJobCounts: jest.fn().mockRejectedValue(new Error('redis down')) },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.readiness).toBe('not_ready');
    expect(health.queueReachable).toBe(false);
    expect(health.queue).toBeNull();
  });

  it('reports degraded when OCR is not configured', async () => {
    const module = await buildModule({
      mistral: { isConfigured: jest.fn().mockReturnValue(false) },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.readiness).toBe('degraded');
    expect(health.status).toBe('degraded');
    expect(health.mistralConfigured).toBe(false);
    expect(health.mistralOcrModel).toBeNull();
  });

  it('reports degraded when backlog is stale with no active workers', async () => {
    const module = await buildModule({
      queue: {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 5, active: 0, failed: 0 }),
        getWorkersCount: jest.fn().mockResolvedValue(1),
      },
      metrics: buildMetrics(0, 900),
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.readiness).toBe('degraded');
    expect(health.queue?.ageSeconds).toBe(900);
  });

  it('includes last failed processing without leaking message content', async () => {
    const failedAt = new Date('2026-07-17T09:00:00.000Z');
    const module = await buildModule({
      prisma: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'ext-fail',
            status: 'FAILED',
            processingStage: 'OCR',
            errorCode: 'OCR_TIMEOUT',
            updatedAt: failedAt,
          }),
      },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.lastFailedProcessing).toEqual({
      extractionId: 'ext-fail',
      at: failedAt.toISOString(),
      status: 'FAILED',
      processingStage: 'OCR',
      errorCode: 'OCR_TIMEOUT',
    });
    expect(health.lastFailedProcessing).not.toHaveProperty('errorMessage');
  });
});
