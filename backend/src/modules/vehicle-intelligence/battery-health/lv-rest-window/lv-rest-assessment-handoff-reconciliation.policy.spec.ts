import {
  compareRestAssessmentHandoffReconcileFairness,
  maxScannedRestAssessmentHandoffCandidates,
  shouldDeferRestAssessmentHandoffVehicleRepair,
} from './lv-rest-assessment-handoff-reconciliation.policy';

describe('lv-rest-assessment-handoff-reconciliation.policy', () => {
  it('bounds per-invocation inspect budget from batch size', () => {
    expect(maxScannedRestAssessmentHandoffCandidates(100)).toBe(2000);
  });

  it('orders never-inspected candidates before previously inspected ones', () => {
    expect(
      compareRestAssessmentHandoffReconcileFairness(
        { id: 'b', lastAttemptAt: null },
        { id: 'a', lastAttemptAt: '2026-09-02T10:00:00.000Z' },
      ),
    ).toBeLessThan(0);
  });

  it('orders older lastAttemptAt before newer attempts', () => {
    expect(
      compareRestAssessmentHandoffReconcileFairness(
        { id: 'b', lastAttemptAt: '2026-09-02T09:00:00.000Z' },
        { id: 'a', lastAttemptAt: '2026-09-02T10:00:00.000Z' },
      ),
    ).toBeLessThan(0);
  });

  it('uses measurement id as deterministic tie-breaker', () => {
    const attemptAt = '2026-09-02T10:00:00.000Z';
    expect(
      compareRestAssessmentHandoffReconcileFairness(
        { id: 'aaa', lastAttemptAt: attemptAt },
        { id: 'bbb', lastAttemptAt: attemptAt },
      ),
    ).toBeLessThan(0);
  });

  it('defers additional repairs for a vehicle already enqueued this pass', () => {
    const repaired = new Set(['veh-a']);
    expect(shouldDeferRestAssessmentHandoffVehicleRepair('veh-a', repaired)).toBe(true);
    expect(shouldDeferRestAssessmentHandoffVehicleRepair('veh-b', repaired)).toBe(false);
  });
});
