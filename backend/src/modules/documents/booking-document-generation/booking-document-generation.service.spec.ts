import {
  BOOKING_DOCUMENT_GENERATION_JOB_TYPE,
  BOOKING_DOCUMENT_GENERATION_STATUS,
} from './booking-document-generation.constants';
import { buildBookingDocumentGenerationIdempotencyKey } from './booking-document-generation.contract';
import { BookingDocumentGenerationRepository } from './booking-document-generation.repository';
import { BookingDocumentGenerationDispatcherService } from './booking-document-generation.dispatcher.service';
import { BookingDocumentGenerationProcessorService } from './booking-document-generation.processor.service';
import { DOCUMENT_TYPE } from '../documents.constants';
import { BookingDocumentGenerationTenantError } from './booking-document-generation.errors';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('booking-document-generation.contract', () => {
  it('builds stable idempotency keys per booking and document type', () => {
    const key = buildBookingDocumentGenerationIdempotencyKey({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.REGENERATE,
      documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
    });
    expect(key).toBe('booking-doc:regen:org-1:bk-1:RENTAL_CONTRACT');
  });
});

describe('BookingDocumentGenerationRepository', () => {
  it('deduplicates by idempotency key', async () => {
    const existing = {
      id: 'job-1',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      status: BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
      idempotencyKey: 'booking-doc:initial:org-1:bk-1',
    };
    const prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue({ id: 'bk-1', organizationId: 'org-1' }) },
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue(null) },
      bookingDocumentGenerationJob: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    } as any;
    const repo = new BookingDocumentGenerationRepository(prisma);
    const result = await repo.persistOrGet({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
    });
    expect(result.deduplicated).toBe(true);
    expect(result.job.id).toBe('job-1');
    expect(prisma.bookingDocumentGenerationJob.create).not.toHaveBeenCalled();
  });
});

describe('BookingDocumentGenerationDispatcherService', () => {
  it('does not enqueue duplicate jobs when status is SUCCEEDED', async () => {
    const repo = {
      persistOrGet: jest.fn().mockResolvedValue({
        job: { id: 'job-1', status: BOOKING_DOCUMENT_GENERATION_STATUS.SUCCEEDED, organizationId: 'org-1', bookingId: 'bk-1', jobType: 'INITIAL_BUNDLE' },
        created: false,
        deduplicated: true,
        idempotencyKey: 'k',
      }),
      shouldSkipEnqueue: jest.fn().mockReturnValue(true),
      markEnqueued: jest.fn(),
    } as any;
    const config = { get: jest.fn().mockReturnValue(true) } as any;
    const queue = { add: jest.fn() } as any;
    const dispatcher = new BookingDocumentGenerationDispatcherService(repo, config, queue);

    const result = await dispatcher.enqueueInitialBundle('org-1', 'bk-1');
    expect(result.enqueued).toBe(false);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('manual retry resets job and re-enqueues', async () => {
    const job = {
      id: 'job-1',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      status: BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_FINAL,
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
      documentType: null,
      handoverProtocolId: null,
      correlationId: 'initial-bundle:bk-1',
    };
    const repo = {
      findById: jest.fn().mockResolvedValue(job),
      resetForManualRetry: jest.fn().mockResolvedValue(undefined),
      persistOrGet: jest.fn().mockResolvedValue({
        job: { ...job, status: BOOKING_DOCUMENT_GENERATION_STATUS.PENDING },
        created: false,
        deduplicated: false,
        idempotencyKey: 'k',
      }),
      shouldSkipEnqueue: jest.fn().mockReturnValue(false),
      markEnqueued: jest.fn(),
    } as any;
    const config = { get: jest.fn().mockReturnValue(true) } as any;
    const queue = { add: jest.fn().mockResolvedValue({ id: 'bull-1' }) } as any;
    const dispatcher = new BookingDocumentGenerationDispatcherService(repo, config, queue);

    const result = await dispatcher.manualRetry('org-1', 'job-1', 'user-1');
    expect(repo.resetForManualRetry).toHaveBeenCalledWith('job-1');
    expect(queue.add).toHaveBeenCalled();
    expect(result.enqueued).toBe(true);
  });
});

describe('BookingDocumentGenerationProcessorService', () => {
  it('skips terminal SUCCEEDED jobs on duplicate queue delivery', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        status: BOOKING_DOCUMENT_GENERATION_STATUS.SUCCEEDED,
        jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
        documentType: null,
        handoverProtocolId: null,
        requestedByUserId: null,
        attemptCount: 1,
        maxAttempts: 5,
      }),
      isTerminalStatus: jest.fn().mockReturnValue(true),
      markProcessing: jest.fn(),
      markSucceeded: jest.fn(),
      markFailedRetryable: jest.fn(),
      markFailedFinal: jest.fn(),
    } as any;
    const bundle = { generateInitialBundle: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue(true) } as any;
    const processor = new BookingDocumentGenerationProcessorService(repo, bundle, config);

    const outcome = await processor.processPersistentJob('org-1', 'job-1', {
      persistentJobId: 'job-1',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
    });

    expect(outcome).toBe('completed');
    expect(bundle.generateInitialBundle).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant queue payload', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        status: BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
        attemptCount: 0,
        maxAttempts: 5,
      }),
      isTerminalStatus: jest.fn().mockReturnValue(false),
      markProcessing: jest.fn(),
      markFailedFinal: jest.fn(),
    } as any;
    const bundle = {} as any;
    const config = { get: jest.fn().mockReturnValue(true) } as any;
    const processor = new BookingDocumentGenerationProcessorService(repo, bundle, config);

    const outcome = await processor.processPersistentJob('org-1', 'job-1', {
      persistentJobId: 'job-1',
      organizationId: 'org-OTHER',
      bookingId: 'bk-1',
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
    });

    expect(outcome).toBe('failed_final');
    expect(repo.markFailedFinal).toHaveBeenCalled();
  });

  it('schedules retry on retryable execution failure', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        status: BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
        jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
        documentType: null,
        handoverProtocolId: null,
        requestedByUserId: null,
        attemptCount: 0,
        maxAttempts: 5,
      }),
      isTerminalStatus: jest.fn().mockReturnValue(false),
      markProcessing: jest.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
        attemptCount: 1,
        maxAttempts: 5,
      }),
      markFailedRetryable: jest.fn(),
      markFailedFinal: jest.fn(),
      markSucceeded: jest.fn(),
    } as any;
    const bundle = {
      generateInitialBundle: jest.fn().mockRejectedValue(new Error('transient render failure')),
    } as any;
    const config = { get: jest.fn().mockReturnValue(true) } as any;
    const processor = new BookingDocumentGenerationProcessorService(repo, bundle, config);

    const outcome = await processor.processPersistentJob('org-1', 'job-1');
    expect(outcome).toBe('retry');
    expect(repo.markFailedRetryable).toHaveBeenCalled();
  });

  it('marks FAILED_FINAL after max attempts', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        status: BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_RETRYABLE,
        jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
        documentType: null,
        handoverProtocolId: null,
        requestedByUserId: null,
        attemptCount: 4,
        maxAttempts: 5,
      }),
      isTerminalStatus: jest.fn().mockReturnValue(false),
      markProcessing: jest.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
        attemptCount: 5,
        maxAttempts: 5,
      }),
      markFailedRetryable: jest.fn(),
      markFailedFinal: jest.fn(),
      markSucceeded: jest.fn(),
    } as any;
    const bundle = {
      generateInitialBundle: jest.fn().mockRejectedValue(new Error('still failing')),
    } as any;
    const config = { get: jest.fn().mockReturnValue(true) } as any;
    const processor = new BookingDocumentGenerationProcessorService(repo, bundle, config);

    const outcome = await processor.processPersistentJob('org-1', 'job-1');
    expect(outcome).toBe('failed_final');
    expect(repo.markFailedFinal).toHaveBeenCalled();
  });
});

describe('BookingDocumentGenerationRecoveryScheduler', () => {
  it('marks stale PROCESSING jobs as FAILED_RETRYABLE on recovery', async () => {
    const staleJob = {
      id: 'job-stale',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      attemptCount: 2,
    };
    const repo = {
      findStaleProcessingJobs: jest.fn().mockResolvedValue([staleJob]),
      markFailedRetryable: jest.fn(),
      findRetryableJobs: jest.fn().mockResolvedValue([]),
    } as any;
    const dispatcher = { enqueue: jest.fn() } as any;
    const { BookingDocumentGenerationRecoveryScheduler } = await import(
      './booking-document-generation.recovery.scheduler'
    );
    const scheduler = new BookingDocumentGenerationRecoveryScheduler(repo, dispatcher);

    await scheduler.recoverStaleProcessing();

    expect(repo.markFailedRetryable).toHaveBeenCalledWith(
      'job-stale',
      2,
      'STALE_PROCESSING',
      expect.stringContaining('stale'),
    );
  });
});
