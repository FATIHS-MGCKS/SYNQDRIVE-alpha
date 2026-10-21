import { BatteryGroundTruthVerificationStatus } from '@prisma/client';
import { BatteryGroundTruthBackedSourceGuard } from './ground-truth-backed-source.guard';
import { GroundTruthSourceCorrectionRequiredError } from './ground-truth-emission.errors';

describe('BatteryGroundTruthBackedSourceGuard', () => {
  it('MAN-J — GT-backed delete requires explicit correction workflow', async () => {
    const prisma = {
      batteryGroundTruthEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'gt-1',
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
        }),
      },
    };
    const guard = new BatteryGroundTruthBackedSourceGuard(prisma as any);

    await expect(
      guard.assertServiceEventMutable('veh-1', 'evt-1', 'delete'),
    ).rejects.toBeInstanceOf(GroundTruthSourceCorrectionRequiredError);
  });

  it('MAN-J — GT-backed material update blocked', async () => {
    const prisma = {
      batteryGroundTruthEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'gt-1',
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
        }),
      },
    };
    const guard = new BatteryGroundTruthBackedSourceGuard(prisma as any);

    await expect(
      guard.assertServiceEventMutable('veh-1', 'evt-1', 'update', { eventDate: '2026-01-02' }),
    ).rejects.toBeInstanceOf(GroundTruthSourceCorrectionRequiredError);
  });
});
