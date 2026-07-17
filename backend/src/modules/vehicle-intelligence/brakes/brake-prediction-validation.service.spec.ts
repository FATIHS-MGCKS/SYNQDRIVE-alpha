import { BrakePredictionValidationService } from './brake-prediction-validation.service';

const VEHICLE_ID = 'veh-1';

describe('BrakePredictionValidationService', () => {
  const prisma = {
    brakeHealthSnapshot: { findFirst: jest.fn() },
    brakeEvidence: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new BrakePredictionValidationService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.brakeEvidence.update.mockResolvedValue({});
  });

  it('finds the latest snapshot strictly before measurement time', async () => {
    const measuredAt = new Date('2026-07-15T10:00:00Z');
    prisma.brakeHealthSnapshot.findFirst.mockResolvedValue({ id: 'snap-before' });

    const snapshot = await service.findPreMeasurementSnapshot(VEHICLE_ID, measuredAt);

    expect(snapshot?.id).toBe('snap-before');
    expect(prisma.brakeHealthSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId: VEHICLE_ID,
          generatedAt: { lt: measuredAt },
        }),
      }),
    );
  });

  it('links measurement evidence to pre-measurement snapshot only', async () => {
    const measuredAt = new Date('2026-07-15T10:00:00Z');
    prisma.brakeEvidence.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        measuredAt,
        axle: 'FRONT',
        measuredPadMm: 7.5,
        measuredDiscMm: null,
      },
    ]);
    prisma.brakeHealthSnapshot.findFirst.mockResolvedValue({
      id: 'snap-before',
      generatedAt: new Date('2026-07-10T10:00:00Z'),
      modelVersion: 'brake-wear-v2',
      modelConfigHash: 'hash',
      anchorEvidenceSummary: null,
      frontPadEstimateMm: 8.1,
      rearPadEstimateMm: 7.8,
      frontDiscEstimateMm: null,
      rearDiscEstimateMm: null,
    });
    prisma.brakeEvidence.findUnique.mockResolvedValue({ predictionSnapshotId: null });

    const results = await service.linkPendingMeasurementSnapshots({ vehicleId: VEHICLE_ID });

    expect(results).toEqual([
      expect.objectContaining({
        evidenceId: 'ev-1',
        predictionSnapshotId: 'snap-before',
      }),
    ]);
    expect(prisma.brakeEvidence.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { predictionSnapshotId: 'snap-before' },
    });
  });

  it('skips when no pre-measurement snapshot exists', async () => {
    prisma.brakeEvidence.findMany.mockResolvedValue([
      {
        id: 'ev-early',
        measuredAt: new Date('2026-01-01T00:00:00Z'),
        axle: 'FRONT',
        measuredPadMm: 10,
        measuredDiscMm: null,
      },
    ]);
    prisma.brakeHealthSnapshot.findFirst.mockResolvedValue(null);

    const results = await service.linkPendingMeasurementSnapshots({ vehicleId: VEHICLE_ID });

    expect(results[0]).toMatchObject({
      evidenceId: 'ev-early',
      skipped: true,
      skipReason: 'no_pre_measurement_snapshot',
    });
    expect(prisma.brakeEvidence.update).not.toHaveBeenCalled();
  });
});
