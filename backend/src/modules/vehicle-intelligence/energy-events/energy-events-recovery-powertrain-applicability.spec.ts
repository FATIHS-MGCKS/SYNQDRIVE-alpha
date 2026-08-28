/**
 * E3A final merge-gate regressions:
 *   1–5  canonical ICE/EV/PHEV/UNKNOWN applicability
 *   6–7  run-level DIMO request accounting
 *   8–10 sanitizer alias correctness (event-scoped canonical roles, all classes)
 *   11   synthetic QUICK profiles never enter FULL
 *   12   privacy invariants hold for the new artifact fields
 */
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-signals.registry';
import {
  buildCapabilityEvidenceAggregate,
  buildRecoveryVehicleInput,
  isSyntheticQuickTokenId,
  resolveEnergyMechanismApplicability,
  resolveRecoveryVehicleCapabilities,
  toRecoveryPowertrain,
  type RecoveryVehicleDbLoad,
} from './energy-events-recovery-capability';
import {
  createDimoRequestAccounting,
  isTelemetryTotalConsistent,
  mergeDimoRequestAccounting,
  recordCapabilityProbeRequest,
  recordDeveloperAuthRequest,
  recordMechanismRequest,
  recordTokenExchangeRequest,
} from './energy-events-recovery-accounting';
import {
  buildFleetFallbackVehicles,
  mergeAuditedFleetIntoDbVehicles,
} from './energy-events-recovery-read.repository';
import {
  runEnergyEventsRecoveryDryRun,
  type RecoveryVehicleInput,
} from './energy-events-recovery-runner';
import {
  buildSanitizationContext,
  buildSanitizedFullSummaryArtifact,
  sanitizeCandidateEvidence,
} from './energy-events-recovery-artifact-sanitize';
import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
} from './energy-events-recovery.types';

const SYNTHETIC_ICE_VEHICLE_ID = 'test-vehicle-ice';
const SYNTHETIC_EV_VEHICLE_ID = 'test-vehicle-ev';
const SYNTHETIC_PHEV_VEHICLE_ID = 'test-vehicle-phev';
const SYNTHETIC_TOKEN_ID = 900001;
const SOC_SIGNAL = 'powertrainTractionBatteryStateOfChargeCurrent';
const FUEL_RELATIVE_SIGNAL = 'powertrainFuelSystemRelativeLevel';
const FUEL_ABSOLUTE_SIGNAL = 'powertrainFuelSystemAbsoluteLevel';

function buildDbLoad(
  overrides: Partial<RecoveryVehicleDbLoad> = {},
): RecoveryVehicleDbLoad {
  return {
    vehicleId: SYNTHETIC_ICE_VEHICLE_ID,
    label: 'TEST_VEHICLE',
    tokenId: SYNTHETIC_TOKEN_ID,
    provider: 'LTE_R1',
    fuelType: 'GASOLINE',
    dimoAccessAvailable: true,
    existingEvents: [],
    batteryCapabilities: [],
    ...overrides,
  };
}

async function classify(vehicle: RecoveryVehicleInput) {
  const report = await runEnergyEventsRecoveryDryRun([vehicle], {
    fetchSegments: async () => ({
      segments: [],
      outcomes: [],
      accounting: createDimoRequestAccounting(),
    }),
    interRequestDelayMs: 0,
    windowsOverride: [
      {
        from: new Date('2026-08-22T00:00:00.000Z'),
        to: new Date('2026-08-24T00:00:00.000Z'),
      },
    ],
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
  });
  return report;
}

describe('canonical powertrain applicability', () => {
  it('1. pure ICE listing traction SOC stays REFUEL_CANDIDATE, never BOTH', async () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({ fuelType: 'DIESEL' }),
      [FUEL_RELATIVE_SIGNAL, FUEL_ABSOLUTE_SIGNAL, SOC_SIGNAL],
      'full',
    );

    expect(vehicle.powertrain).toBe('ICE');
    expect(vehicle.rechargeSocAvailable).toBe(false);
    expect(vehicle.relativeFuelAvailable).toBe(true);
    expect(vehicle.capabilityEvidence?.applicability).toEqual({
      refuel: 'APPLICABLE',
      recharge: 'NOT_APPLICABLE',
    });
    expect(vehicle.capabilityEvidence?.suppressedRechargeSources).toEqual([
      'DIMO_AVAILABLE_SIGNALS',
    ]);

    const report = await classify(vehicle);
    expect(report.vehicles[0]?.energyClass).toBe('REFUEL_CANDIDATE');
    expect(report.vehicles[0]?.rechargeApplicability).toBe('NOT_APPLICABLE');
  });

  it('1b. stale battery-capability SOC row cannot make ICE recharge-capable', () => {
    const resolved = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({
        fuelType: 'GASOLINE',
        batteryCapabilities: [
          { signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY, status: 'AVAILABLE' },
          { signalKey: 'hv.soc', status: 'AVAILABLE_STALE' },
        ],
      }),
      availableSignals: [FUEL_RELATIVE_SIGNAL],
      mode: 'full',
    });

    expect(resolved.rechargeSocAvailable).toBe(false);
    expect(resolved.capabilityEvidence.suppressedRechargeSources).toEqual([
      'VEHICLE_BATTERY_CAPABILITY',
    ]);
    expect(resolved.capabilityEvidence.confirmedRechargeSources).toEqual([]);
  });

  it('2. EV with an accidentally listed fuel signal stays RECHARGE_CANDIDATE', async () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({
        vehicleId: SYNTHETIC_EV_VEHICLE_ID,
        fuelType: 'ELECTRIC',
      }),
      [SOC_SIGNAL, FUEL_RELATIVE_SIGNAL, FUEL_ABSOLUTE_SIGNAL],
      'full',
    );

    expect(vehicle.powertrain).toBe('EV');
    expect(vehicle.rechargeSocAvailable).toBe(true);
    expect(vehicle.relativeFuelAvailable).toBe(false);
    expect(vehicle.absoluteFuelAvailable).toBe(false);
    expect(vehicle.capabilityEvidence?.suppressedFuelSources).toEqual([
      'DIMO_AVAILABLE_SIGNALS',
    ]);

    const report = await classify(vehicle);
    expect(report.vehicles[0]?.energyClass).toBe('RECHARGE_CANDIDATE');
    expect(report.vehicles[0]?.refuelApplicability).toBe('NOT_APPLICABLE');
  });

  it('3. PHEV with fuel + recharge capability evidence → BOTH', async () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({
        vehicleId: SYNTHETIC_PHEV_VEHICLE_ID,
        fuelType: 'PLUGIN_HYBRID',
        batteryCapabilities: [
          { signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY, status: 'AVAILABLE' },
        ],
      }),
      [FUEL_RELATIVE_SIGNAL, FUEL_ABSOLUTE_SIGNAL, SOC_SIGNAL],
      'full',
    );

    expect(vehicle.powertrain).toBe('PHEV');
    expect(vehicle.relativeFuelAvailable).toBe(true);
    expect(vehicle.rechargeSocAvailable).toBe(true);
    expect(vehicle.capabilityEvidence?.suppressedFuelSources).toEqual([]);
    expect(vehicle.capabilityEvidence?.suppressedRechargeSources).toEqual([]);

    const report = await classify(vehicle);
    expect(report.vehicles[0]?.energyClass).toBe('BOTH');
    expect(report.vehicles[0]?.powertrain).toBe('PHEV');
  });

  it('3b. PHEV without recharge capability evidence is REFUEL_CANDIDATE, not BOTH', () => {
    const resolved = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({ fuelType: 'PHEV' }),
      availableSignals: [FUEL_RELATIVE_SIGNAL],
      mode: 'full',
    });

    expect(resolved.powertrain).toBe('PHEV');
    expect(resolved.relativeFuelAvailable).toBe(true);
    expect(resolved.rechargeSocAvailable).toBe(false);
  });

  it('4. PHEV taxonomy is preserved, never flattened into ICE', () => {
    expect(toRecoveryPowertrain('PLUGIN_HYBRID')).toBe('PHEV');
    expect(toRecoveryPowertrain('PHEV')).toBe('PHEV');
    expect(toRecoveryPowertrain('HYBRID')).toBe('PHEV');
    expect(toRecoveryPowertrain('GASOLINE')).toBe('ICE');
    expect(toRecoveryPowertrain('ELECTRIC')).toBe('EV');
    expect(toRecoveryPowertrain('SOMETHING_ELSE')).toBe('UNKNOWN');

    expect(resolveEnergyMechanismApplicability('PHEV')).toEqual({
      refuel: 'APPLICABLE',
      recharge: 'APPLICABLE',
    });
    expect(resolveEnergyMechanismApplicability('ICE')).toEqual({
      refuel: 'APPLICABLE',
      recharge: 'NOT_APPLICABLE',
    });
    expect(resolveEnergyMechanismApplicability('EV')).toEqual({
      refuel: 'NOT_APPLICABLE',
      recharge: 'APPLICABLE',
    });
    expect(resolveEnergyMechanismApplicability('UNKNOWN')).toEqual({
      refuel: 'UNKNOWN',
      recharge: 'UNKNOWN',
    });
  });

  it('5. UNKNOWN powertrain with insufficient capability evidence → CAPABILITY_UNKNOWN', async () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({
        fuelType: null,
        batteryCapabilities: [
          { signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY, status: 'AVAILABLE' },
        ],
      }),
      null,
      'full',
    );

    expect(vehicle.powertrain).toBe('UNKNOWN');
    expect(vehicle.capabilityLookupStatus).toBe('failed');

    const report = await classify(vehicle);
    expect(report.vehicles[0]?.energyClass).toBe('CAPABILITY_UNKNOWN');
    expect(report.gateBlockers).toContain('CAPABILITY_UNKNOWN:1');
    expect(report.backfillGate).toBe('NOT READY');
  });

  it('5b. UNKNOWN powertrain with a successful runtime probe is determinate', () => {
    const resolved = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({ fuelType: 'UNSPECIFIED' }),
      availableSignals: [SOC_SIGNAL],
      mode: 'full',
    });

    expect(resolved.powertrain).toBe('UNKNOWN');
    expect(resolved.capabilityLookupStatus).toBe('ok');
    expect(resolved.rechargeSocAvailable).toBe(true);
  });

  it('5c. ICE probe failure is rescued only by canonical fuel evidence', () => {
    const withoutFuelEvidence = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({
        fuelType: 'GASOLINE',
        batteryCapabilities: [
          { signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY, status: 'AVAILABLE' },
        ],
      }),
      availableSignals: null,
      mode: 'full',
    });
    expect(withoutFuelEvidence.capabilityLookupStatus).toBe('failed');

    const withFuelEvidence = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({
        fuelType: 'GASOLINE',
        existingEvents: [
          {
            id: 'evt-1',
            dimoSegmentId: 'seg-1',
            kind: 'REFUEL',
            detectionMechanism: 'refuel',
            startTime: new Date('2026-08-01T00:00:00.000Z'),
            endTime: new Date('2026-08-01T00:10:00.000Z'),
            durationSeconds: 600,
            startLatitude: null,
            startLongitude: null,
            endLatitude: null,
            endLongitude: null,
            fuelDeltaLiters: 20,
            fuelDeltaPercent: 30,
            socDeltaPercent: null,
            energyDeltaKwh: null,
            odometerStartKm: null,
            odometerEndKm: null,
            confidence: 'HIGH',
            rawDetectionMeta: null,
          },
        ],
      }),
      availableSignals: null,
      mode: 'full',
    });
    expect(withFuelEvidence.capabilityLookupStatus).toBe('ok');
    expect(withFuelEvidence.capabilityEvidence.confirmedFuelSources).toEqual([
      'SUPPLEMENTAL_WINDOW_EVENTS',
    ]);
  });

  it('aggregates capability provenance without per-vehicle identifiers', () => {
    const ice = buildRecoveryVehicleInput(
      buildDbLoad({ fuelType: 'GASOLINE' }),
      [FUEL_RELATIVE_SIGNAL, SOC_SIGNAL],
      'full',
    );
    const ev = buildRecoveryVehicleInput(
      buildDbLoad({ vehicleId: SYNTHETIC_EV_VEHICLE_ID, fuelType: 'ELECTRIC' }),
      [SOC_SIGNAL],
      'full',
    );

    const aggregate = buildCapabilityEvidenceAggregate([ice, ev]);
    expect(aggregate.vehiclesByPowertrain).toEqual({
      ICE: 1,
      EV: 1,
      PHEV: 0,
      UNKNOWN: 0,
    });
    expect(
      aggregate.suppressedRechargeSourceCounts.DIMO_AVAILABLE_SIGNALS,
    ).toBe(1);
    expect(aggregate.vehiclesWithSuppressedRechargeEvidence).toBe(1);
    expect(aggregate.availableSignalsProbeOk).toBe(2);
    expect(JSON.stringify(aggregate)).not.toMatch(/900001/);
  });
});

describe('run-level DIMO request accounting', () => {
  it('6. availableSignals probes contribute to the TOTAL telemetry request count', async () => {
    const runAccounting = createDimoRequestAccounting();
    recordDeveloperAuthRequest(runAccounting);
    recordTokenExchangeRequest(runAccounting);
    recordCapabilityProbeRequest(runAccounting);
    recordCapabilityProbeRequest(runAccounting);

    expect(runAccounting.capabilityProbeRequests).toBe(2);
    expect(runAccounting.telemetryGraphqlRequests).toBe(2);

    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({ fuelType: 'GASOLINE' }),
      [FUEL_RELATIVE_SIGNAL],
      'full',
    );

    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: async () => {
        const delta = createDimoRequestAccounting();
        recordMechanismRequest('refuel', delta);
        return { segments: [], outcomes: [], accounting: delta };
      },
      interRequestDelayMs: 0,
      windowsOverride: [
        {
          from: new Date('2026-08-22T00:00:00.000Z'),
          to: new Date('2026-08-24T00:00:00.000Z'),
        },
      ],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      accounting: runAccounting,
    });

    // TOTAL = 2 capability probes + 1 mechanism request.
    expect(report.requestAccounting.telemetryGraphqlRequests).toBe(3);
    expect(report.requestAccounting.capabilityProbeRequests).toBe(2);
    expect(report.requestAccounting.mechanismRequests).toBe(1);
    expect(isTelemetryTotalConsistent(report.requestAccounting)).toBe(true);

    expect(report.trafficBudget.expectedCapabilityProbeRequests).toBe(2);
    expect(report.trafficBudget.expectedMechanismRequests).toBe(1);
    expect(report.trafficBudget.expectedTelemetryGraphqlRequests).toBe(3);
  });

  it('7. token exchange and developer auth accounting is not silently lost', async () => {
    const runAccounting = createDimoRequestAccounting();
    recordDeveloperAuthRequest(runAccounting);
    recordTokenExchangeRequest(runAccounting);
    recordTokenExchangeRequest(runAccounting);
    recordTokenExchangeRequest(runAccounting);

    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({ fuelType: 'GASOLINE' }),
      [FUEL_RELATIVE_SIGNAL],
      'full',
    );

    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: async () => {
        const delta = createDimoRequestAccounting();
        recordTokenExchangeRequest(delta);
        recordMechanismRequest('refuel', delta);
        return { segments: [], outcomes: [], accounting: delta };
      },
      interRequestDelayMs: 0,
      windowsOverride: [
        {
          from: new Date('2026-08-22T00:00:00.000Z'),
          to: new Date('2026-08-24T00:00:00.000Z'),
        },
      ],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
      accounting: runAccounting,
    });

    expect(report.requestAccounting.tokenExchangeRequests).toBe(4);
    expect(report.requestAccounting.developerAuthRequests).toBe(1);
    // Token exchange is not telemetry GraphQL traffic and must not inflate it.
    expect(report.requestAccounting.telemetryGraphqlRequests).toBe(1);
  });

  it('7b. mechanism traffic is split per mechanism and merges additively', () => {
    const total = createDimoRequestAccounting();
    const delta = createDimoRequestAccounting();
    recordMechanismRequest('refuel', delta);
    recordMechanismRequest('recharge', delta);
    recordCapabilityProbeRequest(delta);
    recordTokenExchangeRequest(delta);

    mergeDimoRequestAccounting(total, delta);
    mergeDimoRequestAccounting(total, delta);

    expect(total.refuelSegmentRequests).toBe(2);
    expect(total.rechargeSegmentRequests).toBe(2);
    expect(total.mechanismRequests).toBe(4);
    expect(total.capabilityProbeRequests).toBe(2);
    expect(total.telemetryGraphqlRequests).toBe(6);
    expect(total.tokenExchangeRequests).toBe(2);
    expect(isTelemetryTotalConsistent(total)).toBe(true);
  });
});

function buildRechargeCandidate(
  overrides: Partial<EnergyRecoveryCandidate>,
): EnergyRecoveryCandidate {
  return {
    classification: 'WOULD_CREATE',
    mechanism: 'recharge',
    vehicleId: SYNTHETIC_EV_VEHICLE_ID,
    tokenId: SYNTHETIC_TOKEN_ID,
    label: 'TEST_EV',
    dimoSegmentId: 'internal-recharge-a',
    coalescedFromSegmentIds: ['internal-recharge-a'],
    startTime: '2026-07-20T10:00:00.000Z',
    endTime: '2026-07-20T12:00:00.000Z',
    durationSeconds: 7200,
    fuelDeltaLiters: null,
    fuelDeltaPercent: null,
    socDeltaPercent: 40,
    energyDeltaKwh: 20,
    odometerStartKm: 1000,
    odometerEndKm: 1000,
    confidence: 'HIGH',
    detectorConfigVersion: 'e2-2026-08',
    manualReviewReasons: [],
    existingRowId: null,
    windowFrom: '2026-07-20T00:00:00.000Z',
    windowTo: '2026-07-21T00:00:00.000Z',
    ...overrides,
  };
}

function buildAliasReport(): EnergyRecoveryDryRunReport {
  const overlapUpdate = buildRechargeCandidate({
    classification: 'WOULD_UPDATE',
    dimoSegmentId: 'internal-recharge-overlap',
    coalescedFromSegmentIds: ['internal-recharge-overlap'],
    existingRowId: 'internal-existing-row',
    startTime: '2026-07-16T08:00:00.000Z',
    endTime: '2026-07-16T18:00:00.000Z',
  });
  const otherRechargeA = buildRechargeCandidate({
    dimoSegmentId: 'internal-recharge-b',
    coalescedFromSegmentIds: ['internal-recharge-b'],
    startTime: '2026-07-22T10:00:00.000Z',
    endTime: '2026-07-22T12:00:00.000Z',
  });
  const otherRechargeB = buildRechargeCandidate({
    dimoSegmentId: 'internal-recharge-c',
    coalescedFromSegmentIds: ['internal-recharge-c'],
    startTime: '2026-07-24T10:00:00.000Z',
    endTime: '2026-07-24T12:00:00.000Z',
  });
  const phevRefuel = buildRechargeCandidate({
    mechanism: 'refuel',
    vehicleId: SYNTHETIC_PHEV_VEHICLE_ID,
    tokenId: SYNTHETIC_TOKEN_ID + 1,
    label: 'TEST_PHEV',
    dimoSegmentId: 'internal-refuel-phev',
    coalescedFromSegmentIds: ['internal-refuel-phev'],
    socDeltaPercent: null,
    energyDeltaKwh: null,
    fuelDeltaLiters: 30,
    fuelDeltaPercent: 45,
  });

  return {
    generatedAt: '2026-08-28T13:00:00.000Z',
    codeShaUnderTest: 'a'.repeat(40),
    baseMainSha: 'b'.repeat(40),
    detectorConfigVersion: 'e2-2026-08',
    refuelDetectorConfig: { minIncreasePercent: 5 },
    rechargeDetectorConfig: 'default',
    outageStart: '2026-07-16T00:00:00.000Z',
    recoveryCutoff: '2026-08-28T08:00:00.000Z',
    windowSizeHours: 24,
    windowSizesHours: [24],
    windowSemantics: 'test windows',
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    dbVehicleMappingFailures: 0,
    vehicles: [
      {
        vehicleId: SYNTHETIC_EV_VEHICLE_ID,
        label: 'TEST_EV',
        tokenId: SYNTHETIC_TOKEN_ID,
        provider: 'LTE_R1',
        powertrain: 'EV',
        dimoAccessAvailable: true,
        dbVehicleMapped: true,
        refuelApplicability: 'NOT_APPLICABLE',
        rechargeApplicability: 'APPLICABLE',
        relativeFuelAvailable: false,
        absoluteFuelAvailable: false,
        rechargeSocAvailable: true,
        capabilityLookupStatus: 'ok',
        existingEventCountInWindow: 1,
        energyClass: 'RECHARGE_CANDIDATE',
      },
      {
        vehicleId: SYNTHETIC_PHEV_VEHICLE_ID,
        label: 'TEST_PHEV',
        tokenId: SYNTHETIC_TOKEN_ID + 1,
        provider: 'LTE_R1',
        powertrain: 'PHEV',
        dimoAccessAvailable: true,
        dbVehicleMapped: true,
        refuelApplicability: 'APPLICABLE',
        rechargeApplicability: 'APPLICABLE',
        relativeFuelAvailable: true,
        absoluteFuelAvailable: true,
        rechargeSocAvailable: true,
        capabilityLookupStatus: 'ok',
        existingEventCountInWindow: 0,
        energyClass: 'BOTH',
      },
    ],
    capabilityEvidenceAggregate: buildCapabilityEvidenceAggregate([]),
    requestAccounting: createDimoRequestAccounting(),
    refuelDetections: 1,
    rechargeDetections: 3,
    deduplicatedCandidateCount: 4,
    summary: {
      WOULD_CREATE: 3,
      WOULD_UPDATE: 1,
      ALREADY_IDENTICAL: 0,
      WOULD_SKIP_NOT_PERSISTABLE: 0,
      WOULD_REPLACE_LEGACY_SUBSEGMENTS: 0,
      MANUAL_REVIEW_REQUIRED: 0,
      FETCH_FAILED: 0,
    },
    candidates: [overlapUpdate, otherRechargeA, otherRechargeB, phevRefuel],
    manualReviewReport: [],
    legacySubsegmentsWouldReplace: [],
    fetchFailures: [],
    trafficBudget: {
      eligibleVehicles: 2,
      inaccessibleVehicles: 0,
      capabilityUnknownVehicles: 0,
      windowsPerVehicle: 1,
      mechanismsPerWindowAverage: 1.5,
      expectedMechanismRequests: 3,
      expectedCapabilityProbeRequests: 2,
      expectedTelemetryGraphqlRequests: 5,
      worstCaseWithRetries: 15,
      proposedConcurrency: 2,
      interRequestDelayMs: 500,
      estimatedRuntimeMinutes: 1,
    },
    acceptance: {
      canonicalRefuel: { found: false, classification: 'NOT_FOUND', segmentStart: null },
      canonicalEvRecharge: {
        detectedSessions: 3,
        wouldCreate: 2,
        alreadyIdentical: 0,
        manualReview: 0,
      },
    },
    dbWritesPerformed: false,
    backfillGate: 'NOT READY',
    manualReviewCount: 0,
    gateBlockers: [],
  };
}

describe('sanitizer alias correctness', () => {
  const report = buildAliasReport();
  const ctx = buildSanitizationContext(report);
  const [overlapUpdate, otherRechargeA, otherRechargeB, phevRefuel] =
    report.candidates;

  it('8. the canonical recharge alias applies only to the overlap update event', () => {
    expect(sanitizeCandidateEvidence(overlapUpdate, report, ctx).alias).toBe(
      'CANONICAL_RECHARGE_OVERLAP_CASE',
    );
  });

  it('9. other recharge sessions on the same EV remain EV_A', () => {
    expect(sanitizeCandidateEvidence(otherRechargeA, report, ctx).alias).toBe('EV_A');
    expect(sanitizeCandidateEvidence(otherRechargeB, report, ctx).alias).toBe('EV_A');
    // The canonical event still reports its owning vehicle alias separately.
    expect(
      sanitizeCandidateEvidence(overlapUpdate, report, ctx).vehicleAlias,
    ).toBe('EV_A');
  });

  it('10. BOTH inventory aliases never fall through to UNKNOWN', () => {
    const artifact = buildSanitizedFullSummaryArtifact(report) as {
      vehicles: Array<{ alias: string; energyClass: string }>;
    };
    const bothRow = artifact.vehicles.find((row) => row.energyClass === 'BOTH');
    expect(bothRow?.alias).toBe('PHEV_A');
    expect(artifact.vehicles.every((row) => row.alias !== 'UNKNOWN')).toBe(true);

    expect(sanitizeCandidateEvidence(phevRefuel, report, ctx).alias).toBe('PHEV_A');
  });

  it('11. synthetic QUICK profiles never enter a FULL inventory', () => {
    const dbVehicle = buildRecoveryVehicleInput(
      buildDbLoad({ tokenId: SYNTHETIC_TOKEN_ID }),
      [FUEL_RELATIVE_SIGNAL],
      'full',
    );
    const merged = mergeAuditedFleetIntoDbVehicles(
      [dbVehicle],
      { [SYNTHETIC_TOKEN_ID]: true, 100001: true, 100005: true },
      true,
    );

    expect(merged).toHaveLength(1);
    expect(merged.some((vehicle) => isSyntheticQuickTokenId(vehicle.tokenId))).toBe(
      false,
    );

    // QUICK mode still resolves the synthetic fleet, with applicability enforced.
    const quick = buildFleetFallbackVehicles({ 100001: true, 100005: true });
    const quickEv = quick.find((vehicle) => vehicle.powertrain === 'EV');
    expect(quickEv?.relativeFuelAvailable).toBe(false);
    expect(quick.every((vehicle) => vehicle.dbVehicleMapped === false)).toBe(true);
  });

  it('12. new artifact fields carry no operational identifiers', () => {
    const json = JSON.stringify(buildSanitizedFullSummaryArtifact(report));
    expect(json).not.toMatch(/"tokenId"/);
    expect(json).not.toMatch(/"vehicleId"/);
    expect(json).not.toMatch(/"dimoSegmentId"/);
    expect(json).not.toMatch(/"existingRowId"/);
    expect(json).not.toMatch(/"label"/);
    expect(json).not.toMatch(/internal-recharge-overlap/);
    expect(json).not.toMatch(/internal-existing-row/);
    expect(json).not.toMatch(/TEST_EV/);
    expect(json).not.toMatch(/TEST_PHEV/);
  });
});
