import { LongitudinalReconciliationService } from './longitudinal-reconciliation.service';
import type { LongitudinalReconciliationCandidateRepository } from './longitudinal-reconciliation-candidate.repository';
import type { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';

describe('LongitudinalReconciliationService', () => {
  const envBackup = process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED;

  afterEach(() => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = envBackup;
  });

  it('flag OFF — zero candidate DB work', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'false';
    const findCandidates = jest.fn();
    const materialize = jest.fn();
    const service = new LongitudinalReconciliationService(
      { findCandidates } as unknown as LongitudinalReconciliationCandidateRepository,
      { materialize } as unknown as LongitudinalProfileMaterializationRuntimeService,
    );
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.status).toBe('SKIPPED_FLAG_OFF');
    expect(findCandidates).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it('isolates per-candidate failures', async () => {
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'true';
    const findCandidates = jest.fn().mockResolvedValue([
      { organizationId: 'o1', vehicleId: 'v1', outstandingChangeAtMs: 1 },
      { organizationId: 'o1', vehicleId: 'v2', outstandingChangeAtMs: 2 },
    ]);
    const materialize = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ outcome: 'CREATED', revisionId: 'r1' });
    const service = new LongitudinalReconciliationService(
      { findCandidates } as unknown as LongitudinalReconciliationCandidateRepository,
      { materialize } as unknown as LongitudinalProfileMaterializationRuntimeService,
    );
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.errorCount).toBe(1);
    expect(outcome.createdCount).toBe(1);
    expect(materialize).toHaveBeenCalledTimes(2);
  });
});
