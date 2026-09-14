import { RawRefuelG2HandoffService } from './raw-refuel-g2-handoff.service';
import {
  RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';

describe('RawRefuelG2HandoffService', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  function authorizeAll(): void {
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'true';
    process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV] = 'true';
  }

  it('skips non-promoted statuses', async () => {
    const service = new RawRefuelG2HandoffService({
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: jest.fn(),
    } as never);

    const result = await service.handoffAfterPromotionCommit({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      tokenId: 1,
      fallbackVehicleEnergyEventId: 'vee-1',
      promotionStatus: 'FAIL_CLOSED',
    });

    expect(result.status).toBe('SKIPPED_NOT_PROMOTED');
  });

  it('skips when handoff authority is off', async () => {
    delete process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV];
    const reconcile = jest.fn();
    const service = new RawRefuelG2HandoffService({
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: reconcile,
    } as never);

    const result = await service.handoffAfterPromotionCommit({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      tokenId: 1,
      fallbackVehicleEnergyEventId: 'vee-1',
      promotionStatus: 'PROMOTED',
    });

    expect(result.status).toBe('SKIPPED_NOT_AUTHORIZED');
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('invokes G2 only after promotion commit path with full authority', async () => {
    authorizeAll();
    const reconcile = jest.fn().mockResolvedValue({
      decisions: [{ siblingEventIds: ['vee-1'] }],
      enqueuedEventIds: ['vee-1'],
      dedupedEventIds: [],
      heldEventIds: [],
    });
    const service = new RawRefuelG2HandoffService({
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: reconcile,
    } as never);

    const result = await service.handoffAfterPromotionCommit({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      tokenId: 1,
      fallbackVehicleEnergyEventId: 'vee-1',
      promotionStatus: 'PROMOTED',
    });

    expect(result.status).toBe('HANDOFF_COMPLETED');
    expect(reconcile).toHaveBeenCalledWith({
      vehicleId: 'veh-1',
      triggerEventId: 'vee-1',
      organizationId: 'org-1',
      tokenId: 1,
    });
  });

  it('preserves promotion on thrown G2 handoff', async () => {
    authorizeAll();
    const service = new RawRefuelG2HandoffService({
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: jest.fn().mockRejectedValue(new Error('g2 boom')),
    } as never);

    const result = await service.handoffAfterPromotionCommit({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      tokenId: 1,
      fallbackVehicleEnergyEventId: 'vee-1',
      promotionStatus: 'PROMOTED',
    });

    expect(result.status).toBe('HANDOFF_FAILED');
    expect(result.fallbackVehicleEnergyEventId).toBe('vee-1');
  });
});
