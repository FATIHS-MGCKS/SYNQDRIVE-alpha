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
    mergeParentTripId: null,
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
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    tireTripUsageLedger: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
    tireTripUsageLedger: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  } as any;

  const metrics = {
    recordTripUsageProcessed: jest.fn(),
    recordMetric: jest.fn(),
  };
  const svc = new TireTripUsageService(mockPrisma, metrics as never);

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
    mockTx.tireTripUsageLedger.findMany.mockResolvedValue([]);
    mockTx.tireTripUsageLedger.create.mockImplementation(async ({ data }: any) => ({
      id: 'ledger-1',
      invalidatedAt: null,
      revisionNumber: 1,
      ...data,
    }));
    mockTx.tireTripUsageLedger.findMany.mockImplementation(async () => {
      const lastCreate = mockTx.tireTripUsageLedger.create.mock.calls.at(-1)?.[0]?.data;
      if (!lastCreate) return [];
      return [
        {
          invalidatedAt: null,
          distanceKm: lastCreate.distanceKm,
          cityKm: lastCreate.cityKm,
          ruralKm: lastCreate.ruralKm,
          highwayKm: lastCreate.highwayKm,
          harshAccelerationCount: lastCreate.harshAccelerationCount,
          harshBrakingCount: lastCreate.harshBrakingCount,
          harshCorneringCount: lastCreate.harshCorneringCount,
        },
      ];
    });
    mockTx.vehicleTrip.update.mockResolvedValue({});
    mockTx.vehicleTireSetup.update.mockResolvedValue({});
    mockTx.tireEvent.create.mockResolvedValue({});
    mockPrisma.vehicleTrip.update.mockResolvedValue({});
    mockPrisma.tireTripUsageLedger.findFirst.mockResolvedValue(null);
  });

  it('applies usage for a normal final trip', async () => {
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('APPLIED');
    expect(result.ledgerAction).toBe('CREATED');
    expect(mockTx.$executeRaw).toHaveBeenCalled();
    expect(mockTx.tireTripUsageLedger.create).toHaveBeenCalled();
    expect(mockTx.vehicleTireSetup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalKmOnSet: 42,
          harshBrakeEvents: 2,
        }),
      }),
    );
    expect(mockTx.tireEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: TireEventType.TRIP_USAGE_ATTRIBUTED }),
      }),
    );
    expect(metrics.recordMetric).toHaveBeenCalledWith('ledger_created', expect.any(Object));
    expect(metrics.recordMetric).toHaveBeenCalledWith('aggregate_rebuilt', expect.any(Object));
  });

  it('is strict no-op on identical fingerprint (no events, no rebuild)', async () => {
    await svc.processCanonicalTripFinalization(tripId);
    const fingerprint =
      mockTx.tireTripUsageLedger.create.mock.calls[0][0].data.sourceFingerprint;
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: fingerprint,
      invalidatedAt: null,
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
    expect(mockTx.tireEvent.create).toHaveBeenCalledTimes(1);
    expect(mockTx.vehicleTrip.update).toHaveBeenCalledTimes(1);
    expect(metrics.recordMetric).toHaveBeenCalledWith('duplicate_prevented', {
      tripId,
      tireSetupId: setupId,
    });
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
      invalidatedAt: null,
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
    expect(mockTx.tireEvent.create).toHaveBeenCalledTimes(1);
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

  it('uses historical setup after setup change (stored setup, not current)', async () => {
    mockPrisma.vehicleTireSetupMountPeriod.findMany.mockResolvedValue([
      {
        tireSetupId: 'setup-old',
        installedAt: new Date('2026-06-01T00:00:00.000Z'),
        removedAt: new Date('2026-07-10T12:00:00.000Z'),
      },
      {
        tireSetupId: 'setup-new',
        installedAt: new Date('2026-07-10T12:00:00.000Z'),
        removedAt: null,
      },
    ]);
    mockPrisma.vehicleTireSetup.findUnique.mockResolvedValue({
      id: 'setup-old',
      vehicleId,
      organizationId: orgId,
    });
    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.tireSetupId).toBe('setup-old');
    expect(result.attributionStatus).toBe('APPLIED');
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

  it('rebuilds aggregates from ledger when fingerprint changes (distance correction)', async () => {
    await svc.processCanonicalTripFinalization(tripId);
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: 'old-fp',
      invalidatedAt: null,
      distanceKm: 40,
      cityKm: 20,
      ruralKm: 8,
      highwayKm: 12,
      harshAccelerationCount: 1,
      harshBrakingCount: 1,
      harshCorneringCount: 0,
      revisionNumber: 1,
    });
    mockTx.tireTripUsageLedger.findMany.mockResolvedValue([
      {
        invalidatedAt: null,
        distanceKm: 45,
        cityKm: 22.5,
        ruralKm: 9,
        highwayKm: 13.5,
        harshAccelerationCount: 1,
        harshBrakingCount: 3,
        harshCorneringCount: 0,
      },
    ]);
    mockTx.tireTripUsageLedger.update.mockImplementation(async ({ data }: any) => ({
      id: 'ledger-1',
      invalidatedAt: null,
      revisionNumber: 2,
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
          totalKmOnSet: 45,
          harshBrakeEvents: 3,
        }),
      }),
    );
    expect(mockTx.tireEvent.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: TireEventType.TRIP_USAGE_REVISED }),
      }),
    );
    expect(metrics.recordMetric).toHaveBeenCalledWith('ledger_revised', expect.any(Object));
  });

  it('invalidates ledger for cancelled trip with prior attribution', async () => {
    mockPrisma.vehicleTrip.findUnique.mockImplementation(async (args: any) => {
      if (args?.include?.tireTripUsageLedgers) {
        return {
          id: tripId,
          vehicleId,
          startTime: tripStart,
          endTime: tripEnd,
          vehicle: { id: vehicleId, organizationId: orgId },
          tireTripUsageLedgers: [
            {
              id: 'ledger-1',
              tireSetupId: setupId,
              tripStartedAt: tripStart,
              tripEndedAt: tripEnd,
              organizationId: orgId,
              sourceFingerprint: 'fp-old',
              invalidatedAt: null,
              revisionNumber: 1,
            },
          ],
        };
      }
      return {
        ...terminalTrip({ tripStatus: TripStatus.CANCELLED }),
      };
    });
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: 'fp-old',
      invalidatedAt: null,
      revisionNumber: 1,
      distanceKm: 42,
      cityKm: 21,
      ruralKm: 8.4,
      highwayKm: 12.6,
      harshAccelerationCount: 1,
      harshBrakingCount: 2,
      harshCorneringCount: 0,
    });
    mockTx.tireTripUsageLedger.update.mockImplementation(async ({ data }: any) => ({
      id: 'ledger-1',
      invalidatedAt: new Date(),
      ...data,
    }));
    mockTx.tireTripUsageLedger.findMany.mockResolvedValue([]);

    const result = await svc.invalidateTripUsageForTrip(tripId, {
      reason: 'trip_cancelled',
    });
    expect(result.attributionStatus).toBe('INVALIDATED');
    expect(mockTx.tireEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TireEventType.TRIP_USAGE_REVISED,
          payload: expect.objectContaining({ command: 'invalidateTripUsage' }),
        }),
      }),
    );
    expect(mockTx.vehicleTireSetup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalKmOnSet: 0 }),
      }),
    );
  });

  it('invalidates merged child trip via mergeParentTripId', async () => {
    mockPrisma.vehicleTrip.findUnique.mockImplementation(async (args: any) => {
      if (args?.include?.tireTripUsageLedgers) {
        return {
          id: tripId,
          vehicleId,
          startTime: tripStart,
          endTime: tripEnd,
          vehicle: { id: vehicleId, organizationId: orgId },
          tireTripUsageLedgers: [
            {
              id: 'ledger-1',
              tireSetupId: setupId,
              tripStartedAt: tripStart,
              tripEndedAt: tripEnd,
              organizationId: orgId,
              sourceFingerprint: 'fp-old',
              invalidatedAt: null,
              revisionNumber: 1,
            },
          ],
        };
      }
      return terminalTrip({ mergeParentTripId: 'parent-trip' });
    });
    mockTx.tireTripUsageLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: orgId,
      sourceFingerprint: 'fp-old',
      invalidatedAt: null,
      revisionNumber: 1,
      distanceKm: 42,
      cityKm: 21,
      ruralKm: 8.4,
      highwayKm: 12.6,
      harshAccelerationCount: 1,
      harshBrakingCount: 2,
      harshCorneringCount: 0,
    });
    mockTx.tireTripUsageLedger.update.mockImplementation(async ({ data }: any) => ({
      id: 'ledger-1',
      invalidatedAt: new Date(),
      ...data,
    }));
    mockTx.tireTripUsageLedger.findMany.mockResolvedValue([]);

    const result = await svc.processCanonicalTripFinalization(tripId);
    expect(result.attributionStatus).toBe('INVALIDATED');
    expect(result.reason).toBe('trip_merged');
  });

  it('records metrics hook', async () => {
    await svc.processCanonicalTripFinalization(tripId);
    expect(metrics.recordTripUsageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ attributionStatus: 'APPLIED' }),
    );
  });
});
