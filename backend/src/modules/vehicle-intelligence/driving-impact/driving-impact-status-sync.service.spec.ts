import { DrivingImpactStatusSyncService } from './driving-impact-status-sync.service';
import { buildPersistedDrivingImpactOutcome } from './driving-impact-outcome.util';
import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';

describe('DrivingImpactStatusSyncService', () => {
  it('persists impact row and applies coordinator outcome in one transaction', async () => {
    const tx = {
      tripDrivingImpact: { upsert: jest.fn().mockResolvedValue({}) },
      vehicleTrip: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };
    const coordinator = {
      applyDrivingImpactOutcome: jest.fn().mockResolvedValue(undefined),
    };

    const service = new DrivingImpactStatusSyncService(prisma as any, coordinator as any);
    const calculatedAt = new Date('2026-07-16T12:00:00.000Z');
    const outcome = buildPersistedDrivingImpactOutcome({
      quality: 'COMPLETE',
      calculatedAt,
    });

    await service.persistImpactWithStatus(
      'trip-1',
      {
        create: { tripId: 'trip-1', vehicleId: 'v1', modelVersion: C.MODEL_VERSION } as any,
        update: { modelVersion: C.MODEL_VERSION },
        drivingScore: 42,
      },
      outcome,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.tripDrivingImpact.upsert).toHaveBeenCalled();
    expect(tx.vehicleTrip.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: { drivingScore: 42 },
    });
    expect(coordinator.applyDrivingImpactOutcome).toHaveBeenCalledWith(
      'trip-1',
      outcome,
      tx,
    );
  });
});
