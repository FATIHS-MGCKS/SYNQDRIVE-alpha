import {
  buildBrakeRecalculationInputPayload,
  computeBrakeHealthConfigHash,
  computeBrakeRecalculationInputFingerprint,
  buildBrakeRecalculationJobId,
} from './brake-recalculation-fingerprint';

const baseContext = () => ({
  vehicleId: 'v1',
  organizationId: 'org-1',
  anchor: {
    isInitialized: true,
    anchorServiceDate: '2026-01-01T00:00:00.000Z',
    anchorOdometerKm: 10000,
    anchorValidationStatus: 'measured_anchor',
    calibrationCount: 0,
    frontPadAnchorMm: 12,
    rearPadAnchorMm: 10,
    frontDiscAnchorMm: 28,
    rearDiscAnchorMm: 26,
    frontPadKFactor: 1,
    rearPadKFactor: 1,
    frontDiscKFactor: 1,
    rearDiscKFactor: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  vehicle: { fuelType: 'GASOLINE', brakeForceFrontPercent: 72 },
  latestOdometerKm: 12000,
  componentInstallations: [],
  referenceSpecs: [],
  evidence: [],
  tdiAggregate: {
    tripCount: 2,
    rawDistanceKm: 200,
    authoritativeDistanceKm: 200,
    latestTripStartedAt: '2026-02-01T00:00:00.000Z',
    latestUpdatedAt: '2026-02-01T01:00:00.000Z',
    hardBrakePer100KmSum: 4,
    fullBrakingPer100KmSum: 1,
  },
  ledgerAggregate: {
    totalEvents: 3,
    harshBraking: 1,
    extremeBraking: 0,
    fullBraking: 1,
    highSpeedBraking: 1,
    latestOccurredAt: '2026-02-01T00:30:00.000Z',
  },
  activeDtc: [],
  gapPolicyVersion: 'brake-coverage-gap-v1',
});

describe('computeBrakeRecalculationInputFingerprint', () => {
  it('is stable for identical canonical input', () => {
    const ctx = baseContext();
    const a = computeBrakeRecalculationInputFingerprint(ctx);
    const b = computeBrakeRecalculationInputFingerprint(ctx);
    expect(a.inputFingerprint).toBe(b.inputFingerprint);
    expect(a.modelConfigHash).toBe(computeBrakeHealthConfigHash());
  });

  it('changes when a new trip aggregate arrives', () => {
    const before = computeBrakeRecalculationInputFingerprint(baseContext());
    const after = computeBrakeRecalculationInputFingerprint({
      ...baseContext(),
      tdiAggregate: {
        ...baseContext().tdiAggregate,
        tripCount: 3,
        rawDistanceKm: 320,
        authoritativeDistanceKm: 320,
      },
    });
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes when a new measurement is recorded', () => {
    const before = computeBrakeRecalculationInputFingerprint(baseContext());
    const after = computeBrakeRecalculationInputFingerprint({
      ...baseContext(),
      evidence: [
        {
          id: 'e1',
          createdAt: '2026-03-01T00:00:00.000Z',
          measuredAt: '2026-03-01T00:00:00.000Z',
          source: 'MANUAL_MEASUREMENT',
          axle: 'FRONT',
          measuredPadMm: 8.5,
          measuredDiscMm: null,
          brakeFluidStatus: null,
          discCondition: null,
          dtcSeverity: null,
          immediateReplacement: null,
        },
      ],
    });
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes when reference spec thresholds change', () => {
    const before = computeBrakeRecalculationInputFingerprint(baseContext());
    const after = computeBrakeRecalculationInputFingerprint({
      ...baseContext(),
      referenceSpecs: [
        {
          id: 'spec-1',
          updatedAt: '2026-03-02T00:00:00.000Z',
          frontPadMinimumThicknessMm: 3,
          rearPadMinimumThicknessMm: 2.5,
          frontDiscMinimumThicknessMm: 24,
          rearDiscMinimumThicknessMm: 22,
          thresholdSource: 'MANUFACTURER_MINIMUM',
          thresholdConfirmedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
    });
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes when active brake DTC state changes', () => {
    const before = computeBrakeRecalculationInputFingerprint(baseContext());
    const after = computeBrakeRecalculationInputFingerprint({
      ...baseContext(),
      activeDtc: [
        {
          code: 'C1234',
          severity: 'WARNING',
          isActive: true,
          lastSeenAt: '2026-03-03T00:00:00.000Z',
        },
      ],
    });
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('includes gap policy version in payload', () => {
    const payload = buildBrakeRecalculationInputPayload(baseContext());
    expect(payload.gapPolicyVersion).toBe('brake-coverage-gap-v1');
  });
});

describe('buildBrakeRecalculationJobId', () => {
  it('uses vehicle id for burst coalescing and hour bucket for scheduler', () => {
    expect(buildBrakeRecalculationJobId('v1')).toBe('brake-recalc:v1');
    expect(buildBrakeRecalculationJobId('v1', 42)).toBe('brake-recalc:v1:42');
  });
});
