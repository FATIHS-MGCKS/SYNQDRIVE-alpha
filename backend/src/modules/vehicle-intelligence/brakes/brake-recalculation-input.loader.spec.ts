import { BrakeRecalculationInputLoader } from './brake-recalculation-input.loader';

describe('BrakeRecalculationInputLoader.loadAsOf', () => {
  const prisma = {
    brakeHealthCurrent: { findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn() },
    vehicleLatestState: { findUnique: jest.fn() },
    brakeComponentInstallation: { findMany: jest.fn() },
    vehicleBrakeReferenceSpec: { findMany: jest.fn() },
    brakeEvidence: { findMany: jest.fn() },
    tripDrivingImpact: { findMany: jest.fn() },
    brakingEventLedger: { findMany: jest.fn() },
    vehicleDtcEvent: { findMany: jest.fn() },
  };

  const loader = new BrakeRecalculationInputLoader(prisma as never);
  const asOf = new Date('2026-06-15T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.brakeHealthCurrent.findUnique.mockResolvedValue({
      isInitialized: true,
      anchorServiceDate: new Date('2026-01-01T00:00:00Z'),
      anchorOdometerKm: 10000,
      anchorValidationStatus: 'measured_anchor',
      calibrationCount: 2,
      frontPadAnchorMm: 12,
      rearPadAnchorMm: 10,
      frontDiscAnchorMm: 28,
      rearDiscAnchorMm: 26,
      frontPadKFactor: 1.1,
      rearPadKFactor: 1.05,
      frontDiscKFactor: 1,
      rearDiscKFactor: 1,
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      lastRecalculatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    prisma.vehicle.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      fuelType: 'GASOLINE',
      brakeForceFrontPercent: null,
    });
    prisma.vehicleLatestState.findUnique.mockResolvedValue({ odometerKm: 12000 });
    prisma.brakeComponentInstallation.findMany.mockResolvedValue([]);
    prisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValue([]);
    prisma.brakeEvidence.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.brakingEventLedger.findMany.mockResolvedValue([]);
    prisma.vehicleDtcEvent.findMany.mockResolvedValue([]);
  });

  it('excludes trips after as-of (future leakage guard)', async () => {
    await loader.loadAsOf('veh-1', asOf);

    expect(prisma.tripDrivingImpact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tripStartedAt: expect.objectContaining({ lte: asOf }),
        }),
      }),
    );
  });

  it('includes only installations active at as-of', async () => {
    await loader.loadAsOf('veh-1', asOf);

    expect(prisma.brakeComponentInstallation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          installedAt: { lte: asOf },
        }),
      }),
    );
  });

  it('does not apply later calibration when replaying before last recalculation', async () => {
    const context = await loader.loadAsOf('veh-1', asOf);

    expect(context?.anchor.calibrationCount).toBe(0);
    expect(context?.anchor.frontPadKFactor).toBe(1);
  });

  it('returns null when anchor did not exist yet at as-of', async () => {
    const result = await loader.loadAsOf('veh-1', new Date('2025-12-01T00:00:00Z'));
    expect(result).toBeNull();
  });

  it('filters reference specs updated after as-of', async () => {
    await loader.loadAsOf('veh-1', asOf);

    expect(prisma.vehicleBrakeReferenceSpec.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: { lte: asOf },
        }),
      }),
    );
  });
});
