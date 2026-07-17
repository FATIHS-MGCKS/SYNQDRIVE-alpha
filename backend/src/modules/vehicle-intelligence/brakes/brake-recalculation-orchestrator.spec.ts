import { BadRequestException } from '@nestjs/common';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';
import { buildBrakeRecalculationJobId } from './brake-recalculation-fingerprint';

const vehicleId = 'veh-1';

function createOrchestrator(deps?: {
  queueAdd?: jest.Mock;
  getJob?: jest.Mock;
  lockAcquire?: jest.Mock;
  recalculate?: jest.Mock;
  workersEnabled?: boolean;
}) {
  const queue = {
    add: deps?.queueAdd ?? jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: deps?.getJob ?? jest.fn().mockResolvedValue(null),
  };
  const brakeHealth = {
    recalculate: deps?.recalculate ?? jest.fn().mockResolvedValue({ skipped: true, skipReason: 'identical_input_fingerprint' }),
  };
  const lockService = {
    acquire:
      deps?.lockAcquire ??
      jest.fn().mockResolvedValue({
        acquired: true,
        handle: { key: 'k', token: 't', acquiredAt: new Date() },
      }),
    release: jest.fn().mockResolvedValue(true),
  };
  const observability = {
    recordRecalculation: jest.fn(),
    recordRecalculationLockContended: jest.fn(),
  };

  const orchestrator = new BrakeRecalculationOrchestratorService(
    queue as never,
    brakeHealth as never,
    lockService as never,
    observability as never,
  );

  return { orchestrator, queue, brakeHealth, lockService, observability };
}

describe('BrakeRecalculationOrchestratorService', () => {
  beforeEach(() => {
    jest.spyOn(require('@shared/queue/queue-producer.util'), 'canEnqueueQueue').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires reason for force recalculation', async () => {
    const { orchestrator } = createOrchestrator();
    await expect(
      orchestrator.enqueue({ vehicleId, trigger: 'manual', force: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enqueues a deduped job per vehicle', async () => {
    const queueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
    const { orchestrator } = createOrchestrator({ queueAdd });
    const result = await orchestrator.enqueue({ vehicleId, trigger: 'post_trip' });
    expect(result.queued).toBe(true);
    expect(queueAdd).toHaveBeenCalledWith(
      'brake-recalc',
      expect.objectContaining({ vehicleId, trigger: 'post_trip' }),
      expect.objectContaining({ jobId: buildBrakeRecalculationJobId(vehicleId) }),
    );
  });

  it('uses hour bucket for scheduler dedupe', async () => {
    const queueAdd = jest.fn().mockResolvedValue({ id: 'job-2' });
    const { orchestrator } = createOrchestrator({ queueAdd });
    await orchestrator.enqueue({ vehicleId, trigger: 'scheduler', hourBucket: 99 });
    expect(queueAdd).toHaveBeenCalledWith(
      'brake-recalc',
      expect.any(Object),
      expect.objectContaining({ jobId: buildBrakeRecalculationJobId(vehicleId, 99) }),
    );
  });

  it('executes inline when queue is unavailable', async () => {
    jest.spyOn(require('@shared/queue/queue-producer.util'), 'canEnqueueQueue').mockReturnValue(false);
    const recalculate = jest.fn().mockResolvedValue({ padsHealthPct: 80 });
    const { orchestrator } = createOrchestrator({ recalculate });
    const result = await orchestrator.enqueue({ vehicleId, trigger: 'manual' });
    expect(result.executedInline).toBe(true);
    expect(recalculate).toHaveBeenCalledWith(vehicleId, expect.objectContaining({ trigger: 'manual' }));
  });

  it('records deduplicated metric when fingerprint matches', async () => {
    const recalculate = jest.fn().mockResolvedValue({
      skipped: true,
      skipReason: 'identical_input_fingerprint',
    });
    const { orchestrator, observability } = createOrchestrator({ recalculate });
    await orchestrator.executeWithLock({
      vehicleId,
      trigger: 'scheduler',
      requestedAt: new Date().toISOString(),
    });
    expect(observability.recordRecalculation).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'deduplicated' }),
    );
  });

  it('throws on lock contention for retry/dead-letter handling', async () => {
    const lockAcquire = jest.fn().mockResolvedValue({ acquired: false, reason: 'contended' });
    const { orchestrator } = createOrchestrator({ lockAcquire });
    await expect(
      orchestrator.executeWithLock({
        vehicleId,
        trigger: 'post_trip',
        requestedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('brake_recalc_lock_contended');
  });

  it('clears terminal failed jobs before re-enqueue', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const getJob = jest.fn().mockResolvedValue({
      getState: jest.fn().mockResolvedValue('failed'),
      remove,
    });
    const queueAdd = jest.fn().mockResolvedValue({ id: 'job-3' });
    const { orchestrator } = createOrchestrator({ getJob, queueAdd });
    await orchestrator.enqueue({ vehicleId, trigger: 'service' });
    expect(remove).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalled();
  });

  it('isolates tenants via vehicle-scoped job ids', async () => {
    const queueAdd = jest.fn().mockResolvedValue({ id: 'job-a' });
    const { orchestrator } = createOrchestrator({ queueAdd });
    await orchestrator.enqueue({ vehicleId: 'veh-a', organizationId: 'org-a', trigger: 'manual' });
    await orchestrator.enqueue({ vehicleId: 'veh-b', organizationId: 'org-b', trigger: 'manual' });
    const ids = queueAdd.mock.calls.map((call) => call[2].jobId);
    expect(ids).toEqual(['brake-recalc:veh-a', 'brake-recalc:veh-b']);
  });
});
