import {
  assertTireTripUsageTenantContext,
  buildTireTripUsageLedgerWriteData,
  invalidateTireTripUsageLedgerEntry,
  TireTripUsageLedgerTenantMismatchError,
  upsertTireTripUsageLedgerEntry,
} from './tire-trip-usage-ledger.repository';
import {
  buildInvalidatedTripUsageFingerprintInput,
  computeTripUsageSourceFingerprint,
  deriveTripUsageRoadKm,
  TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
} from './tire-trip-usage-ledger';

const tenant = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  vehicleOrganizationId: 'org-1',
  tireSetupId: 'setup-1',
  setupVehicleId: 'veh-1',
  setupOrganizationId: 'org-1',
  tripId: 'trip-1',
  tripVehicleId: 'veh-1',
};

const baseInput = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  tripId: 'trip-1',
  tireSetupId: 'setup-1',
  tripStartedAt: '2026-07-01T10:00:00.000Z',
  tripEndedAt: '2026-07-01T10:45:00.000Z',
  distanceKm: 42.5,
  cityKm: 20,
  ruralKm: 10,
  highwayKm: 12.5,
  harshAccelerationCount: 1,
  harshBrakingCount: 2,
  harshCorneringCount: 0,
  drivingImpactSummary: { drivingStressScore: 34 },
  sourceVersion: TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
};

describe('tire-trip-usage-ledger fingerprint', () => {
  it('is deterministic for identical authoritative inputs', () => {
    const a = computeTripUsageSourceFingerprint(baseInput);
    const b = computeTripUsageSourceFingerprint({ ...baseInput });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when trip distance changes (reprocessing)', () => {
    const before = computeTripUsageSourceFingerprint(baseInput);
    const after = computeTripUsageSourceFingerprint({ ...baseInput, distanceKm: 43.1 });
    expect(before).not.toBe(after);
  });

  it('changes when driving impact summary changes', () => {
    const before = computeTripUsageSourceFingerprint(baseInput);
    const after = computeTripUsageSourceFingerprint({
      ...baseInput,
      drivingImpactSummary: { drivingStressScore: 40 },
    });
    expect(before).not.toBe(after);
  });

  it('supports invalidated trip fingerprint for deleted trips', () => {
    const invalidated = buildInvalidatedTripUsageFingerprintInput({
      tripId: 'trip-1',
      tireSetupId: 'setup-1',
      tripStartedAt: baseInput.tripStartedAt,
      tripEndedAt: baseInput.tripEndedAt,
      invalidationReason: 'trip_deleted',
    });
    const fp = computeTripUsageSourceFingerprint(invalidated);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    expect(fp).not.toBe(computeTripUsageSourceFingerprint(baseInput));
  });
});

describe('tire-trip-usage-ledger road split helper', () => {
  it('derives city/rural/highway km from share percents', () => {
    const split = deriveTripUsageRoadKm({
      distanceKm: 100,
      citySharePercent: 50,
      highwaySharePercent: 30,
      countrySharePercent: 20,
    });
    expect(split).toEqual({ cityKm: 50, highwayKm: 30, ruralKm: 20 });
  });
});

describe('tire-trip-usage-ledger tenant guards', () => {
  it('accepts aligned org/vehicle/setup/trip context', () => {
    expect(() => assertTireTripUsageTenantContext(tenant)).not.toThrow();
  });

  it('rejects cross-tenant vehicle organization', () => {
    expect(() =>
      assertTireTripUsageTenantContext({
        ...tenant,
        vehicleOrganizationId: 'org-other',
      }),
    ).toThrow(TireTripUsageLedgerTenantMismatchError);
  });

  it('rejects setup on different vehicle', () => {
    expect(() =>
      assertTireTripUsageTenantContext({
        ...tenant,
        setupVehicleId: 'veh-other',
      }),
    ).toThrow(/does not belong to vehicle/);
  });

  it('rejects trip on different vehicle', () => {
    expect(() =>
      assertTireTripUsageTenantContext({
        ...tenant,
        tripVehicleId: 'veh-other',
      }),
    ).toThrow(/does not belong to vehicle/);
  });
});

describe('tire-trip-usage-ledger repository upsert', () => {
  const mockLedger = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { tireTripUsageLedger: mockLedger } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new ledger row', async () => {
    mockLedger.findUnique.mockResolvedValue(null);
    mockLedger.create.mockResolvedValue({ id: 'ledger-1', ...baseInput });

    const result = await upsertTireTripUsageLedgerEntry(prisma, baseInput, tenant);

    expect(result.action).toBe('CREATED');
    expect(mockLedger.create).toHaveBeenCalledTimes(1);
    expect(mockLedger.update).not.toHaveBeenCalled();
    expect(result.sourceFingerprint).toBeTruthy();
  });

  it('skips update when source fingerprint is unchanged (idempotent)', async () => {
    const fingerprint = computeTripUsageSourceFingerprint(baseInput);
    mockLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: 'org-1',
      sourceFingerprint: fingerprint,
    });

    const result = await upsertTireTripUsageLedgerEntry(prisma, baseInput, tenant);

    expect(result.action).toBe('UNCHANGED');
    expect(mockLedger.create).not.toHaveBeenCalled();
    expect(mockLedger.update).not.toHaveBeenCalled();
  });

  it('updates when authoritative evaluation fingerprint changed', async () => {
    mockLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: 'org-1',
      sourceFingerprint: 'old-fingerprint',
      revisionNumber: 1,
    });
    mockLedger.update.mockResolvedValue({ id: 'ledger-1' });

    const result = await upsertTireTripUsageLedgerEntry(
      prisma,
      { ...baseInput, distanceKm: 99 },
      tenant,
    );

    expect(result.action).toBe('UPDATED');
    expect(result.previousFingerprint).toBe('old-fingerprint');
    expect(mockLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ledger-1' },
        data: expect.objectContaining({
          distanceKm: 99,
          revisionNumber: 2,
          previousFingerprint: 'old-fingerprint',
          sourceFingerprint: expect.not.stringMatching(/^old-fingerprint$/),
        }),
      }),
    );
  });

  it('soft-invalidates an active ledger row without deleting it', async () => {
    mockLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: 'org-1',
      sourceFingerprint: computeTripUsageSourceFingerprint(baseInput),
      invalidatedAt: null,
      revisionNumber: 1,
    });
    mockLedger.update.mockImplementation(async ({ data }) => ({
      id: 'ledger-1',
      ...data,
    }));

    const result = await invalidateTireTripUsageLedgerEntry(prisma, {
      tripId: baseInput.tripId,
      tireSetupId: baseInput.tireSetupId,
      organizationId: baseInput.organizationId,
      reason: 'trip_cancelled',
      fingerprintInput: baseInput,
    });

    expect(result?.action).toBe('UPDATED');
    expect(mockLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          distanceKm: 0,
          invalidatedAt: expect.any(Date),
          invalidationReason: 'trip_cancelled',
        }),
      }),
    );
  });

  it('rejects cross-tenant upsert against existing row', async () => {
    mockLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      organizationId: 'org-other',
      sourceFingerprint: 'fp',
    });

    await expect(
      upsertTireTripUsageLedgerEntry(prisma, baseInput, tenant),
    ).rejects.toThrow(/another organization/);
  });

  it('builds write data with source fingerprint', () => {
    const fp = computeTripUsageSourceFingerprint(baseInput);
    const data = buildTireTripUsageLedgerWriteData(baseInput, fp);
    expect(data.sourceFingerprint).toBe(fp);
    expect(data.sourceVersion).toBe(TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION);
    expect(data.organizationId).toBe('org-1');
  });
});
