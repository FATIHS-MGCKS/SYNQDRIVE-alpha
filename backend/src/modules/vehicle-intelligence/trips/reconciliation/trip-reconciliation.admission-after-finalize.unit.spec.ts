import { TripReconciliationService } from './trip-reconciliation.service';

describe('TripReconciliationService.reconcileAdmissionAfterFinalization', () => {
  it('runs a narrow fast reconcile window padded around the finalized trip', async () => {
    const reconcileWindow = jest.fn().mockResolvedValue({
      repairsProposed: 0,
      repairsApplied: 0,
      repairsRejected: 0,
      durationMs: 1,
    });
    const service = Object.create(TripReconciliationService.prototype) as TripReconciliationService;
    (service as unknown as { reconcileWindow: typeof reconcileWindow }).reconcileWindow =
      reconcileWindow;

    const start = new Date('2026-10-22T10:21:00.000Z');
    const end = new Date('2026-10-22T10:41:37.000Z');
    await service.reconcileAdmissionAfterFinalization('veh-1', start, end);

    expect(reconcileWindow).toHaveBeenCalledTimes(1);
    const [vehicleId, from, to, tier, options] = reconcileWindow.mock.calls[0];
    expect(vehicleId).toBe('veh-1');
    expect(tier).toBe('fast');
    expect(options).toEqual({ useDimoSegmentFallback: true });
    expect(from.toISOString()).toBe('2026-10-22T09:51:00.000Z');
    expect(to.toISOString()).toBe('2026-10-22T11:11:37.000Z');
  });
});
