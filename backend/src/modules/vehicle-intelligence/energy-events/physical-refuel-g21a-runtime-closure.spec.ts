import { FuelStationEnrichmentRecoveryScheduler } from '@workers/schedulers/fuel-station-enrichment-recovery.scheduler';
import { EnergyEventKind, PhysicalRefuelFinalityState } from '@prisma/client';

describe('G2.1a legacy recovery G2 bypass closure', () => {
  const cutover = new Date('2026-09-01T00:00:00.000Z');

  it('legacy fuel-station recovery skips V2-owned SETTLING refuel when flag ON', async () => {
    const event = {
      id: 'settling',
      kind: EnergyEventKind.REFUEL,
      startTime: new Date('2026-09-02T00:00:00.000Z'),
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
    };
    const prisma = {
      vehicleEnergyEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
      },
      vehicleEnergyEventRefuelReconciliation: {
        findUnique: jest.fn().mockResolvedValue({
          energyEventId: event.id,
          finalityState: PhysicalRefuelFinalityState.SETTLING,
        }),
      },
    };
    const producer = { enqueueAfterPersistFromEvent: jest.fn().mockResolvedValue('job-1') };
    const physicalRefuelRuntime = {
      isEnabled: () => true,
      resolveV2OwnershipCutoverAt: () => cutover,
    };

    const scheduler = new FuelStationEnrichmentRecoveryScheduler(
      {
        enabled: true,
        recoveryEnabled: true,
        recoveryBatchSize: 10,
        cutoverAt: cutover,
        cutoverState: 'valid',
      } as never,
      { v2OwnershipCutoverAt: cutover } as never,
      prisma as never,
      producer as never,
      { shouldRun: () => true } as never,
      physicalRefuelRuntime as never,
    );

    const recovered = await scheduler.recoverMissedEnrichments();
    expect(recovered).toBe(0);
    expect(producer.enqueueAfterPersistFromEvent).not.toHaveBeenCalled();
  });
});
