import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import documentExtractionConfig from '@config/document-extraction.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { MistralOcrService } from '@modules/ai/providers/mistral/mistral-ocr.service';
import { DocumentAiExtractionService } from '@modules/ai/documents/document-ai-extraction.service';
import { DOCUMENT_STORAGE } from './storage/document-storage.interface';
import { DocumentExtractionHealthService } from './document-extraction-health.service';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

describe('DocumentExtractionHealthService', () => {
  const docConfig = {
    queueEnabled: true,
    storageProvider: 'local',
  };

  function buildModule(overrides: {
    queue?: Partial<Record<'getJobCounts', jest.Mock>>;
    storage?: Record<string, unknown>;
    mistral?: Partial<Record<'isConfigured', jest.Mock>>;
    ai?: Partial<Record<'isEnabled', jest.Mock>>;
  } = {}) {
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 1, failed: 0 }),
      ...(overrides.queue ?? {}),
    };
    const storage = {
      getInternalPath: jest.fn().mockReturnValue('/tmp/docs'),
      ...(overrides.storage ?? {}),
    };
    const mistralOcr = { isConfigured: jest.fn().mockReturnValue(true), ...(overrides.mistral ?? {}) };
    const aiExtraction = { isEnabled: jest.fn().mockReturnValue(true), ...(overrides.ai ?? {}) };

    return Test.createTestingModule({
      providers: [
        DocumentExtractionHealthService,
        { provide: documentExtractionConfig.KEY, useValue: docConfig },
        { provide: getQueueToken(QUEUE_NAMES.DOCUMENT_EXTRACTION), useValue: queue },
        { provide: DOCUMENT_STORAGE, useValue: storage },
        { provide: MistralOcrService, useValue: mistralOcr },
        { provide: DocumentAiExtractionService, useValue: aiExtraction },
      ],
    }).compile();
  }

  afterEach(() => {
    jest.restoreAllMocks();
    (canEnqueueQueue as jest.Mock).mockReturnValue(true);
  });

  it('reports ok when queue, storage, OCR, and AI extraction are available', async () => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    const module = await buildModule();
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.status).toBe('ok');
    expect(health.queueReachable).toBe(true);
    expect(health.mistralOcrConfigured).toBe(true);
    expect(health.aiExtractionConfigured).toBe(true);
    expect(health.waitingJobs).toBe(2);
    expect(health.activeJobs).toBe(1);
  });

  it('reports error when queue is unreachable', async () => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    const module = await buildModule({
      queue: { getJobCounts: jest.fn().mockRejectedValue(new Error('redis down')) },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.status).toBe('error');
    expect(health.queueReachable).toBe(false);
  });

  it('reports degraded when OCR is not configured', async () => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    const module = await buildModule({
      mistral: { isConfigured: jest.fn().mockReturnValue(false) },
    });
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.status).toBe('degraded');
    expect(health.mistralOcrConfigured).toBe(false);
  });

  it('reports error when workers are disabled', async () => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(false);
    const module = await buildModule();
    const svc = module.get(DocumentExtractionHealthService);
    const health = await svc.getHealth();
    expect(health.workersEnabled).toBe(false);
    expect(health.status).toBe('error');
  });
});
