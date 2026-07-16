import { DrivingIntelligenceJobDispatcherService } from './driving-intelligence-jobs.dispatcher.service';
import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs.repository';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

function makeQueue() {
  return { add: jest.fn().mockResolvedValue({ id: 'bull-1' }) };
}

describe('DrivingIntelligenceJobDispatcherService', () => {
  let repository: jest.Mocked<Pick<DrivingIntelligenceJobRepository, 'prepareEnqueue' | 'markEnqueued' | 'shouldSkipEnqueue' | 'findById'>>;
  let queue: ReturnType<typeof makeQueue>;
  let dispatcher: DrivingIntelligenceJobDispatcherService;

  beforeEach(() => {
    repository = {
      prepareEnqueue: jest.fn(),
      markEnqueued: jest.fn(),
      shouldSkipEnqueue: jest.fn(),
      findById: jest.fn(),
    };
    queue = makeQueue();
    dispatcher = new DrivingIntelligenceJobDispatcherService(
      repository as unknown as DrivingIntelligenceJobRepository,
      queue as any,
    );
  });

  it('enqueues bull job and marks persistent row ENQUEUED', async () => {
    repository.prepareEnqueue.mockResolvedValue({
      job: {
        id: 'job-1',
        organizationId: 'org-1',
        vehicleId: 'vehicle-1',
        tripId: 'trip-1',
        bookingId: null,
        analysisRunId: 'run-1',
        jobType: 'DRIVING_ROUTE_ENRICH',
        modelVersion: 'di-v1',
        idempotencyKey: 'idem-1',
        correlationId: 'corr-1',
        requestedAt: new Date(),
        status: 'PENDING',
        bullJobId: null,
      } as any,
      created: true,
      deduplicated: false,
    });
    repository.shouldSkipEnqueue.mockReturnValue(false);
    repository.markEnqueued.mockResolvedValue({
      id: 'job-1',
      status: 'ENQUEUED',
      bullJobId: 'di-job-1',
    } as any);

    const result = await dispatcher.enqueue({
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      jobType: 'DRIVING_ROUTE_ENRICH',
      modelVersion: 'di-v1',
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1',
      requestedAt: '2026-07-16T10:00:00.000Z',
    });

    expect(result.enqueued).toBe(true);
    expect(queue.add).toHaveBeenCalledWith(
      'DRIVING_ROUTE_ENRICH',
      expect.objectContaining({ persistentJobId: 'job-1' }),
      expect.objectContaining({ jobId: 'di-job-1' }),
    );
    expect(repository.markEnqueued).toHaveBeenCalledWith('job-1', 'di-job-1');
  });

  it('does not enqueue when persistent row is already in flight', async () => {
    repository.prepareEnqueue.mockResolvedValue({
      job: { id: 'job-1', status: 'ENQUEUED' } as any,
      created: false,
      deduplicated: true,
    });
    repository.shouldSkipEnqueue.mockReturnValue(true);

    const result = await dispatcher.enqueue({
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      analysisRunId: 'run-1',
      jobType: 'DRIVING_IMPACT_COMPUTE',
      modelVersion: 'di-v1',
      idempotencyKey: 'idem-2',
      correlationId: 'corr-2',
      requestedAt: '2026-07-16T10:00:00.000Z',
    });

    expect(result.enqueued).toBe(false);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
