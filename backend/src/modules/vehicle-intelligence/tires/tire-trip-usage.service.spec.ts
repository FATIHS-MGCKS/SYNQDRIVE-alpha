import { TireEventType, TripStatus } from '@prisma/client';
import { TireTripUsageService } from './tire-trip-usage.service';

const orgId = 'org-1';
const vehicleId = 'veh-1';
const tripId = 'trip-1';
const setupId = 'setup-1';
const tripStart = new Date('2026-07-10T10:00:00.000Z');
const tripEnd = new Date('2026-07-10T11:00:00.000Z');

function terminalTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: tripId,
    vehicleId,
    tripStatus: TripStatus.COMPLETED,
    startTime: tripStart,
    endTime: tripEnd,
    distanceKm: 42,
    citySharePercent: 50,
    highwaySharePercent: 30,
    countrySharePercent: 20,
    harshAccelCount: 1,
    harshBrakeCount: 2,
    harshCornerCount: 0,
    tripAnalysisStatus: 'COMPLETED',
    drivingImpactStatus: 'READY',
    analysisStagesJson: {
      behavior: 'done',
      route: 'done',
      misuse: 'done',
      drivingImpact: 'done',
    },
    vehicle: { id: vehicleId, organizationId: orgId },
    ...overrides,
  };
}

describe('TireTripUsageService', () => {
  const mockTx = {
    tireTripUsageLedger: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vehicleTireSetup: { update: jest.fn() },
    tireEvent: { create: jest.fn() },
    vehicleTrip: { update: jest.fn() },
  };

  const mockPrisma = {
    vehicleTrip: { findUnique: jest.fn(), update: jest.fn() },
    vehicleTireSetupMountPeriod: { findMany: jest.fn() },
    vehicleTireSetup: { findMany: jest.fn(), findUnique: jest.fn() },
    tripDrivingImpact: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  } as any;

  const metrics = { recordTripUsageProcessed: jest.fn() };
  const svc = new TireTripUsageService(mockPrisma, metrics);

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.vehicleTrip.findUnique.mockResolvedValue(terminalTrip());
    mockPrisma.vehicleTireSetupMountPeriod.findMany.mockResolvedValue([
      {
        tireSetupId: setupId,
        installedAt: new Date('2026-07-01T00:00:00.000Z'),
        removedAt: null,
      },
    ]);
    mockPrisma.vehicleTireSetup.findUnique.mockResolvedValue({
      id: setupId,
      vehicleId,
      organizationId: orgId,
    });
    mockPrisma.tripDrivingImpact.findUnique.mockResolvedValue(null);
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue(null);
    mockTx.tireTripUsageLedger.create.mockImplementation(async ({ data }: any) => ({
      id: 'ledger-1',
      ...data,
    }));
    mockTx.vehicleTrip.update.mockResolvedValue({});
    mockTx.vehicleTireSetup.update.mockResolvedValue({});
    mockTx.tireEvent.create.mockResolvedValue({});
    mockPrisma.vehicleTrip.update.mockResolvedValue({});
  });

  it('applies usage for a normal final trip', async () => {
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('APPLIED');
    expect(result.ledgerAction).toBe('CREATED');
    expect(mockTx.tireTripUsageLedger.create).toHaveBeenCalled();
    expect(mockTx.vehicleTireSetup.update).toHaveBeenCalled();
    expect(mockTx.tireEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: TireEventType.TRIP_USAGE_ATTRIBUTED }),
      }),
    );
  });

  it('is idempotent on retry (UNCHANGED)', async () => {
    await svc.processCanonicalTripFinalization(tripId);
    const fingerprint =
      mockTx.tireTripUsageLedger.create.mock.calls[0][0].data.sourceFingerprint;
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: fingerprint,
      distanceKm: 42,
      cityKm: 21,
      ruralKm: 8.4,
      highwayKm: 12.6,
      harshAccelerationCount: 1,
      harshBrakingCount: 2,
      harshCorneringCount: 0,
    });

    const retry = await svc.processCanonicalTripFinalization(tripId);
    expect(retry.attributionStatus).toBe('UNCHANGED');
    expect(retry.ledgerAction).toBe('UNCHANGED');
    expect(mockTx.tireTripUsageLedger.create).toHaveBeenCalledTimes(1);
    expect(mockTx.vehicleTireSetup.update).toHaveBeenCalledTimes(1);
  });

  it('no-ops aggregate on duplicate enrichment call with unchanged fingerprint', async () => {
    const first = await svc.processCanonicalTripFinalization(tripId, {
      trigger: 'manual_route_enrich',
    });
    const fingerprint = first.sourceFingerprint!;
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: fingerprint,
      distanceKm: 42,
      cityKm: 21,
      ruralKm: 8.4,
      highwayKm: 12.6,
      harshAccelerationCount: 1,
      harshBrakingCount: 2,
      harshCorneringCount: 0,
    });
    const second = await svc.processCanonicalTripFinalization(tripId, {
      trigger: 'manual_route_enrich',
    });
    expect(second.attributionStatus).toBe('UNCHANGED');
    expect(mockTx.vehicleTireSetup.update).toHaveBeenCalledTimes(1);
  });

  it('skips when trip analysis is not terminal yet', async () => {
    mockPrisma.vehicleTrip.findUnique.mockResolvedValue(
      terminalTrip({
        tripAnalysisStatus: 'IN_PROGRESS',
        analysisStagesJson: {
          behavior: 'done',
          route: 'pending',
          misuse: 'pending',
          drivingImpact: 'pending',
        },
      }),
    );
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('SKIPPED_NOT_FINAL');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips late trip when no setup matches historical interval', async () => {
    mockPrisma.vehicleTireSetupMountPeriod.findMany.mockResolvedValue([]);
    mockPrisma.vehicleTireSetup.findMany.mockResolvedValue([]);
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('SKIPPED_NO_SETUP');
  });

  it('marks overlapping trip as REQUIRES_REVIEW', async () => {
    mockPrisma.vehicleTireSetupMountPeriod.findMany.mockResolvedValue([
      {
        tireSetupId: 'setup-old',
        installedAt: new Date('2026-06-01T00:00:00.000Z'),
        removedAt: new Date('2026-07-10T10:30:00.000Z'),
      },
      {
        tireSetupId: 'setup-new',
        installedAt: new Date('2026-07-10T10:30:00.000Z'),
        removedAt: null,
      },
    ]);
    mockPrisma.vehicleTrip.findUnique.mockResolvedValue(
      terminalTrip({
        startTime: new Date('2026-07-10T10:15:00.000Z'),
        endTime: new Date('2026-07-10T11:00:00.000Z'),
      }),
    );
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('REQUIRES_REVIEW');
    expect(result.requiresReviewSetupIds).toEqual(
      expect.arrayContaining(['setup-old', 'setup-new']),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects wrong organization via tenant guard', async () => {
    mockPrisma.vehicleTireSetup.findUnique.mockResolvedValue({
      id: setupId,
      vehicleId,
      organizationId: 'org-other',
    });
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('SKIPPED_ORG_MISMATCH');
  });

  it('applies aggregate delta on reprocessing when fingerprint changes', async () => {
    await svc.processCanonicalTripFinalization(tripId);
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: 'old-fp',
      distanceKm: 40,
      cityKm: 20,
      ruralKm: 8,
      highwayKm: 12,
      harshAccelerationCount: 1,
      harshBrakingCount: 1,
      harshCorneringCount: 0,
    });
    mockTx.tireTripUsageLedger.update.mockImplementation(async ({ data }: any) => ({
      id: 'ledger-1',
      ...data,
    }));
    mockPrisma.vehicleTrip.findUnique.mockResolvedValue(
      terminalTrip({ distanceKm: 45, harshBrakeCount: 3 }),
    );

    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('APPLIED');
    expect(result.ledgerAction).toBe('UPDATED');
    expect(mockTx.vehicleTireSetup.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalKmOnSet: { increment: 5 },
          harshBrakeEvents: { increment: 2 },
        }),
      }),
    );
  });

  it('records metrics hook', async () => {
    await svc.processCanonicalTripFinalization(tripId);
    expect(metrics.recordTripUsageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ attributionStatus: 'APPLIED' }),
    );
  });
});
