import { TireEventType } from '@prisma/client';
import {
  auditTripBackfillCandidate,
  buildSyntheticTripUsageBackfillFixtures,
  computeTripUsageBackfillReportHash,
  TRIP_USAGE_BACKFILL_AUDIT_VERSION,
  TRIP_USAGE_BACKFILL_SCHEMA_VERSION,
} from './tire-trip-usage-backfill-audit';
import {
  isAutoApplicableTrip,
  planTripUsageBackfillApply,
  validateTripUsageBackfillApplyRequest,
  type TripUsageBackfillApplyRequest,
} from './tire-trip-usage-backfill-apply';
import { assertSafeTireTripUsageBackfillApplyTarget } from './tire-trip-usage-backfill-apply.safety';
import { TireTripUsageBackfillService } from './tire-trip-usage-backfill.service';
import { TireTripUsageLedgerReconciliationService } from './tire-trip-usage-ledger-reconciliation.service';
import { sumActiveLedgerRows } from './tire-trip-usage-replay';

function baseApplyRequest(
  overrides: Partial<TripUsageBackfillApplyRequest> = {},
): TripUsageBackfillApplyRequest {
  return {
    apply: false,
    expectedAuditVersion: TRIP_USAGE_BACKFILL_AUDIT_VERSION,
    confirmGitRef: 'abc123',
    confirmSchemaVersion: TRIP_USAGE_BACKFILL_SCHEMA_VERSION,
    confirmBackup: true,
    operator: 'ops@test',
    reason: 'prompt-13-test',
    maxBatchSize: 50,
    ...overrides,
  };
}

function auditTripsFromFixtures(salt = 'test-salt') {
  return buildSyntheticTripUsageBackfillFixtures().map((f) =>
    auditTripBackfillCandidate(f, salt),
  );
}

describe('tire-trip-usage-backfill-apply guards', () => {
  const trips = auditTripsFromFixtures();

  it('defaults to dry run plan', () => {
    const plan = planTripUsageBackfillApply({
      auditTrips: trips,
      request: baseApplyRequest({ organizationId: 'fixture-org' }),
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.autoApplicable.length).toBeGreaterThan(0);
  });

  it('rejects apply without organization or vehicle selection', () => {
    expect(() =>
      validateTripUsageBackfillApplyRequest(baseApplyRequest({ apply: true })),
    ).toThrow(/organization-id, --vehicle-id, or explicit --trip-id/);
  });

  it('rejects apply without backup confirmation', () => {
    expect(() =>
      validateTripUsageBackfillApplyRequest(
        baseApplyRequest({
          apply: true,
          organizationId: 'fixture-org',
          confirmBackup: false,
        }),
      ),
    ).toThrow(/confirm-backup/);
  });

  it('rejects audit version mismatch', () => {
    expect(() =>
      validateTripUsageBackfillApplyRequest(
        baseApplyRequest({
          apply: true,
          organizationId: 'fixture-org',
          expectedAuditVersion: 'wrong',
        }),
      ),
    ).toThrow(/Audit version mismatch/);
  });

  it('rejects report hash mismatch on apply', () => {
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    expect(() =>
      planTripUsageBackfillApply({
        auditTrips: scoped,
        request: baseApplyRequest({
          apply: true,
          organizationId: 'fixture-org',
          expectedReportHash: 'deadbeefdeadbeef',
        }),
      }),
    ).toThrow(/Report hash mismatch/);
  });

  it('accepts matching report hash on apply', () => {
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    const reportHash = computeTripUsageBackfillReportHash(scoped);
    const plan = planTripUsageBackfillApply({
      auditTrips: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'fixture-org',
        expectedReportHash: reportHash,
      }),
    });
    expect(plan.reportHash).toBe(reportHash);
    expect(plan.autoApplicable.some((i) => i.tripId === 'fixture-single')).toBe(true);
  });

  it('blocks production-like apply without override', () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://synqdrive-prod/db';
    expect(() => assertSafeTireTripUsageBackfillApplyTarget()).toThrow(/production-like/);
    process.env.DATABASE_URL = prev;
  });
});

describe('tire-trip-usage-backfill-apply classification', () => {
  const trips = auditTripsFromFixtures();

  it('auto-applies only SINGLE_SETUP without odometer conflict', () => {
    const single = trips.find((t) => t.tripId === 'fixture-single')!;
    expect(isAutoApplicableTrip(single)).toBe(true);

    const plan = planTripUsageBackfillApply({
      auditTrips: trips,
      request: baseApplyRequest({ organizationId: 'fixture-org' }),
    });
    expect(plan.autoApplicable.some((i) => i.tripId === 'fixture-single')).toBe(true);
  });

  it('keeps setup conflicts in manual review', () => {
    const plan = planTripUsageBackfillApply({
      auditTrips: trips,
      request: baseApplyRequest({ organizationId: 'fixture-org' }),
    });
    expect(plan.manualReview.some((i) => i.tripId === 'fixture-conflict-multi')).toBe(true);
    expect(plan.autoApplicable.some((i) => i.tripId === 'fixture-conflict-multi')).toBe(false);
  });

  it('keeps odometer conflict in manual review', () => {
    const plan = planTripUsageBackfillApply({
      auditTrips: trips,
      request: baseApplyRequest({ organizationId: 'fixture-org' }),
    });
    expect(plan.manualReview.some((i) => i.tripId === 'fixture-odometer-conflict')).toBe(true);
  });

  it('skips idempotent duplicate fingerprint', () => {
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    const single = scoped.find((t) => t.tripId === 'fixture-single')!;
    const fingerprints = new Set([
      `${single.tripId}:${single.attributedSetupId}:${single.projectedFingerprint}`,
    ]);
    const plan = planTripUsageBackfillApply({
      auditTrips: scoped,
      request: baseApplyRequest({ organizationId: 'fixture-org' }),
      alreadyAppliedFingerprints: fingerprints,
    });
    expect(plan.skipped.some((i) => i.tripId === 'fixture-single')).toBe(true);
  });

  it('scopes apply plan by organization (cross-tenant guard)', () => {
    const plan = planTripUsageBackfillApply({
      auditTrips: trips,
      request: baseApplyRequest({ organizationId: 'other-org' }),
    });
    expect(plan.autoApplicable.length).toBe(0);
    expect(plan.manualReview.length).toBe(0);
    expect(plan.skipped.length).toBe(0);
  });

  it('includes stored setup trip in auto apply', () => {
    const plan = planTripUsageBackfillApply({
      auditTrips: trips,
      request: baseApplyRequest({ organizationId: 'fixture-org' }),
    });
    expect(plan.autoApplicable.some((i) => i.tripId === 'fixture-stored-setup')).toBe(true);
  });
});

describe('tire-trip-usage-ledger-reconciliation', () => {
  const mockLedger = {
    findMany: jest.fn(),
  };
  const mockSetup = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const mockVehicle = { findUnique: jest.fn() };
  const mockTireEvent = { create: jest.fn() };
  const mockPrisma = {
    vehicleTireSetup: mockSetup,
    tireTripUsageLedger: mockLedger,
    vehicle: mockVehicle,
    tireEvent: mockTireEvent,
    $transaction: jest.fn(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
  } as any;

  const svc = new TireTripUsageLedgerReconciliationService(mockPrisma);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetup.findUnique.mockResolvedValue({
      id: 'setup-1',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      totalKmOnSet: 100,
      cityKm: 50,
      ruralKm: 20,
      highwayKm: 30,
      harshAccelEvents: 1,
      harshBrakeEvents: 2,
      harshCornerEvents: 0,
    });
    mockLedger.findMany.mockResolvedValue([
      {
        invalidatedAt: null,
        distanceKm: 80,
        cityKm: 40,
        ruralKm: 16,
        highwayKm: 24,
        harshAccelerationCount: 1,
        harshBrakingCount: 1,
        harshCorneringCount: 0,
      },
    ]);
    mockSetup.update.mockResolvedValue({});
    mockTireEvent.create.mockResolvedValue({});
  });

  it('detects aggregate diff vs ledger in dry run', async () => {
    const diff = await svc.compareSetupAggregates('setup-1');
    expect(diff?.hasDiff).toBe(true);
    expect(diff?.delta.totalKmOnSet).toBe(-20);

    const result = await svc.dryRunReconcileSetupAggregates(['setup-1'], {
      operator: 'ops@test',
      reason: 'test',
    });
    expect(result.dryRun).toBe(true);
    expect(result.repaired).toBe(0);
    expect(result.diffs[0]?.hasDiff).toBe(true);
    expect(mockSetup.update).not.toHaveBeenCalled();
  });

  it('repairs aggregates from ledger and writes audit event', async () => {
    const result = await svc.repairSetupAggregates(['setup-1'], {
      operator: 'ops@test',
      reason: 'test-repair',
    });
    expect(result.repaired).toBe(1);
    expect(mockSetup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalKmOnSet: 80 }),
      }),
    );
    expect(mockTireEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: TireEventType.TRIP_USAGE_REVISED }),
      }),
    );
  });

  it('is no-op when aggregates already match ledger', async () => {
    mockSetup.findUnique.mockResolvedValue({
      id: 'setup-1',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      totalKmOnSet: 80,
      cityKm: 40,
      ruralKm: 16,
      highwayKm: 24,
      harshAccelEvents: 1,
      harshBrakeEvents: 1,
      harshCornerEvents: 0,
    });
    const result = await svc.repairSetupAggregates(['setup-1'], {
      operator: 'ops@test',
      reason: 'noop',
    });
    expect(result.unchanged).toBe(1);
    expect(result.repaired).toBe(0);
    expect(mockSetup.update).not.toHaveBeenCalled();
  });
});

describe('tire-trip-usage-backfill service', () => {
  const trips = auditTripsFromFixtures();
  const tripUsage = {
    processCanonicalTripFinalization: jest.fn(),
  };
  const reconcile = {
    repairSetupAggregates: jest.fn().mockResolvedValue({
      dryRun: false,
      diffs: [],
      repaired: 1,
      unchanged: 0,
      auditLog: [{ action: 'REPAIR', setupId: 'fixture-setup-active' }],
      errors: [],
    }),
  };
  const tireHealth = { recalculate: jest.fn() };
  const mockPrisma = {
    tireTripUsageLedger: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;

  const svc = new TireTripUsageBackfillService(
    mockPrisma,
    tripUsage as any,
    reconcile as any,
    tireHealth as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tripUsage.processCanonicalTripFinalization.mockResolvedValue({
      tripId: 'fixture-single',
      vehicleId: 'fixture-vehicle-1',
      attributionStatus: 'APPLIED',
      ledgerAction: 'CREATED',
      tireSetupId: 'fixture-setup-active',
    });
  });

  it('executes apply for auto-applicable trips and reconciles setups', async () => {
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    const reportHash = computeTripUsageBackfillReportHash(scoped);
    const { result } = await svc.run({
      auditTrips: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'fixture-org',
        expectedReportHash: reportHash,
        maxBatchSize: 5,
      }),
      allowRemote: true,
    });
    expect(result.applied).toBeGreaterThan(0);
    expect(tripUsage.processCanonicalTripFinalization).toHaveBeenCalled();
    expect(reconcile.repairSetupAggregates).toHaveBeenCalled();
    expect(result.auditLog.some((e) => e.action === 'APPLY_LEDGER')).toBe(true);
  });

  it('treats UNCHANGED as idempotent without failure', async () => {
    tripUsage.processCanonicalTripFinalization.mockResolvedValue({
      attributionStatus: 'UNCHANGED',
      ledgerAction: 'UNCHANGED',
    });
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    const reportHash = computeTripUsageBackfillReportHash(scoped);
    const { result } = await svc.run({
      auditTrips: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'fixture-org',
        expectedReportHash: reportHash,
        maxBatchSize: 1,
      }),
      allowRemote: true,
    });
    expect(result.unchanged).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
  });

  it('records partial batch failure without stopping audit log', async () => {
    tripUsage.processCanonicalTripFinalization
      .mockResolvedValueOnce({
        attributionStatus: 'APPLIED',
        tireSetupId: 'fixture-setup-active',
        ledgerAction: 'CREATED',
      })
      .mockRejectedValueOnce(new Error('db_timeout'));
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    const reportHash = computeTripUsageBackfillReportHash(scoped);
    const { result } = await svc.run({
      auditTrips: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'fixture-org',
        expectedReportHash: reportHash,
        maxBatchSize: 2,
      }),
      allowRemote: true,
    });
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors.some((e) => e.includes('db_timeout'))).toBe(true);
  });

  it('optionally recalculates affected vehicles with batch limit', async () => {
    const scoped = trips.filter((t) => t.organizationId === 'fixture-org');
    const reportHash = computeTripUsageBackfillReportHash(scoped);
    const { result } = await svc.run({
      auditTrips: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'fixture-org',
        expectedReportHash: reportHash,
        maxBatchSize: 3,
        recalculate: true,
        recalculateMaxSetups: 1,
      }),
      allowRemote: true,
    });
    expect(tireHealth.recalculate).toHaveBeenCalledTimes(1);
    expect(result.recalculatedVehicleIds.length).toBe(1);
  });
});

describe('sumActiveLedgerRows aggregate rebuild source', () => {
  it('rebuilds expected totals from active rows only', () => {
    const totals = sumActiveLedgerRows([
      {
        invalidatedAt: null,
        distanceKm: 40,
        cityKm: 20,
        ruralKm: 8,
        highwayKm: 12,
        harshAccelerationCount: 1,
        harshBrakingCount: 2,
        harshCorneringCount: 0,
      },
      {
        invalidatedAt: new Date(),
        distanceKm: 99,
        cityKm: 99,
        ruralKm: 99,
        highwayKm: 99,
        harshAccelerationCount: 9,
        harshBrakingCount: 9,
        harshCorneringCount: 9,
      },
    ]);
    expect(totals.distanceKm).toBe(40);
    expect(totals.activeLedgerRows).toBe(1);
  });
});
