import { runDtc02AdaptiveSchedulerShadowBatch } from './dtc-02-adaptive-shadow.runtime';

describe('runDtc02AdaptiveSchedulerShadowBatch', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('does not throw when shadow load fails', async () => {
    process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED = 'true';
    process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST =
      'c10351f8-b6a2-4258-947f-631aeaa6d359';

    const prisma = {
      vehicle: { findMany: async () => { throw new Error('db down'); } },
      vehicleDtcEvent: { groupBy: async () => [] },
      vehicleDtcSourceHead: { findMany: async () => [] },
      vehicleTripDetectionState: { findMany: async () => [] },
      vehicleTrip: { findMany: async () => [] },
      vehicleSignalCapabilityProfile: { findMany: async () => [] },
    };

    await expect(
      runDtc02AdaptiveSchedulerShadowBatch({
        prisma: prisma as never,
        candidateVehicleIds: ['c10351f8-b6a2-4258-947f-631aeaa6d359'],
        evaluatedAtMs: Date.now(),
      }),
    ).resolves.toBeUndefined();
  });
});
