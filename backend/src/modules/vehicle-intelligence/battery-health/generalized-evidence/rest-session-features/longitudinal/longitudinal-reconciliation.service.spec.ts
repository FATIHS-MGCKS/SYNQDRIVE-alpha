import { LongitudinalReconciliationService } from './longitudinal-reconciliation.service';
import { LongitudinalReconciliationInvariantViolationError } from './longitudinal-reconciliation.invariants';
import type { LongitudinalReconciliationCandidateRepository } from './longitudinal-reconciliation-candidate.repository';
import type { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

describe('LongitudinalReconciliationService', () => {
  const envBackup = process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED;
  const batchBackup = process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE;

  afterEach(() => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = envBackup;
    process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE = batchBackup;
  });

  function buildService(deps: {
    findCandidates: jest.Mock;
    materialize: jest.Mock;
  }) {
    return new LongitudinalReconciliationService(
      { findCandidates: deps.findCandidates } as unknown as LongitudinalReconciliationCandidateRepository,
      { materialize: deps.materialize } as unknown as LongitudinalProfileMaterializationRuntimeService,
    );
  }

  it('flag OFF — zero candidate DB work', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'false';
    const findCandidates = jest.fn();
    const materialize = jest.fn();
    const outcome = await buildService({ findCandidates, materialize }).runBoundedReconciliationTick();
    expect(outcome.status).toBe('SKIPPED_FLAG_OFF');
    expect(findCandidates).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it('no candidates — zero materialization calls', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest.fn().mockResolvedValue([]);
    const materialize = jest.fn();
    const outcome = await buildService({ findCandidates, materialize }).runBoundedReconciliationTick();
    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.candidateCount).toBe(0);
    expect(materialize).not.toHaveBeenCalled();
  });

  it('exactly one candidate — one facade call', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest.fn().mockResolvedValue([
      { organizationId: 'o1', vehicleId: 'v1', outstandingChangeAtMs: 1 },
    ]);
    const materialize = jest.fn().mockResolvedValue({ outcome: 'CREATED', revisionId: 'r1' });
    const outcome = await buildService({ findCandidates, materialize }).runBoundedReconciliationTick();
    expect(outcome.candidateCount).toBe(1);
    expect(outcome.createdCount).toBe(1);
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it('batch cap — findCandidates receives configured max batch size', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE = '3';
    const findCandidates = jest.fn().mockResolvedValue([]);
    await buildService({ findCandidates, materialize: jest.fn() }).runBoundedReconciliationTick();
    expect(findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 3 }),
    );
  });

  it('multi-org candidates preserve identity on materialize', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest.fn().mockResolvedValue([
      { organizationId: 'org-a', vehicleId: 'veh-1', outstandingChangeAtMs: 1 },
      { organizationId: 'org-b', vehicleId: 'veh-2', outstandingChangeAtMs: 2 },
    ]);
    const materialize = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'EXISTING', revisionId: 'r1' })
      .mockResolvedValueOnce({ outcome: 'CREATED', revisionId: 'r2' });
    const outcome = await buildService({ findCandidates, materialize }).runBoundedReconciliationTick();
    expect(outcome.existingCount).toBe(1);
    expect(outcome.createdCount).toBe(1);
    expect(materialize).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ organizationId: 'org-a', vehicleId: 'veh-1' }),
    );
    expect(materialize).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ organizationId: 'org-b', vehicleId: 'veh-2' }),
    );
  });

  it('D1_REJECTED and D2_REJECTED isolation', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest.fn().mockResolvedValue([
      { organizationId: 'o1', vehicleId: 'v1', outstandingChangeAtMs: 1 },
      { organizationId: 'o1', vehicleId: 'v2', outstandingChangeAtMs: 2 },
    ]);
    const materialize = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'D1_REJECTED', reason: 'NO_SESSIONS' })
      .mockResolvedValueOnce({ outcome: 'D2_REJECTED', reason: 'PROFILE_REJECTED' });
    const outcome = await buildService({ findCandidates, materialize }).runBoundedReconciliationTick();
    expect(outcome.d1RejectedCount).toBe(1);
    expect(outcome.d2RejectedCount).toBe(1);
    expect(outcome.errorCount).toBe(0);
  });

  it('isolates per-candidate failures (ERROR isolation)', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest.fn().mockResolvedValue([
      { organizationId: 'o1', vehicleId: 'v1', outstandingChangeAtMs: 1 },
      { organizationId: 'o1', vehicleId: 'v2', outstandingChangeAtMs: 2 },
    ]);
    const materialize = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ outcome: 'CREATED', revisionId: 'r1' });
    const outcome = await buildService({ findCandidates, materialize }).runBoundedReconciliationTick();
    expect(outcome.errorCount).toBe(1);
    expect(outcome.createdCount).toBe(1);
    expect(materialize).toHaveBeenCalledTimes(2);
  });

  it('T24–T27 typed org/vehicle mismatch — invariant metric, no materialization', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest
      .fn()
      .mockRejectedValue(
        new LongitudinalReconciliationInvariantViolationError('VEHICLE_ORGANIZATION_MISMATCH'),
      );
    const materialize = jest.fn();
    const metrics = new TripMetricsService();
    const invariantInc = jest.spyOn(
      metrics.batteryLongitudinalReconciliationInvariantFailuresTotal,
      'inc',
    );
    await expect(
      new LongitudinalReconciliationService(
        { findCandidates } as unknown as LongitudinalReconciliationCandidateRepository,
        { materialize } as unknown as LongitudinalProfileMaterializationRuntimeService,
        metrics,
      ).runBoundedReconciliationTick(),
    ).rejects.toBeInstanceOf(LongitudinalReconciliationInvariantViolationError);
    expect(invariantInc).toHaveBeenCalledWith({ type: 'VEHICLE_ORGANIZATION_MISMATCH' });
    expect(materialize).not.toHaveBeenCalled();
  });
});
