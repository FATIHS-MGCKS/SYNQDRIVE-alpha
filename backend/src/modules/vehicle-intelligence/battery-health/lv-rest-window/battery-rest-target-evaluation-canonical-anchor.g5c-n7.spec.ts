import {
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { getBatteryRest60mDelayMs, getBatteryRest6hDelayMs } from '@config/battery-health-v2.config';
import { BatteryRestTargetEvaluationService } from './battery-rest-target-evaluation.service';
import { LvRestCanonicalTargetAnchorResolverService } from './lv-rest-canonical-target-anchor.resolver.service';
import { restTargetAt } from './battery-rest-target-evaluation';
import {
  isCanonicalRestAssessmentHandoffEligible,
} from './lv-rest-assessment-handoff.policy';
import {
  isLvRestShadowModeActive,
  resolveLvRestShadowEvidenceEligible,
  resolveLvRestShadowPublicationEligible,
} from './lv-rest-shadow.policy';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const CANONICAL_REST = 'rest-edfdd3df-canonical-anchor';
const FORENSIC_TRIP = '588f50ad-trip-edfdd3df-shape';

/** G5C-N6 forensic shape — canonical anchor vs misaligned LV_REST_WINDOW session. */
const CANONICAL_ANCHOR = new Date('2026-10-13T17:06:40.000Z');
const MISALIGNED_SESSION_START = new Date('2026-10-13T17:29:42.000Z');
const PARKED_12_512 = new Date('2026-10-13T17:19:24.000Z');
const WAKE_14_118 = new Date('2026-10-13T17:20:29.000Z');

function restingLive(
  id: string,
  observedAt: Date,
  numericValue: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    observedAt,
    numericValue,
    providerTimestamp: observedAt,
    context: {
      speedKmh: 0,
      ignitionOn: false,
      engineRunning: false,
      hasActiveTrip: false,
      isLvCharging: false,
      isHvCharging: false,
      providerObservationOutcome: 'NEW_OBSERVATION',
      ...overrides,
    },
    provenance: {},
  };
}

function buildRestEval(prisma: Record<string, unknown>) {
  const policyProfiles = {
    resolveForVehicle: jest.fn().mockResolvedValue({
      driveProfile: 'ICE_LEAD_ACID',
      chemistry: 'LEAD_ACID',
      lvAssessmentAllowed: true,
      supportedMeasurementTypes: [
        BatteryMeasurementType.LIVE_VOLTAGE,
        BatteryMeasurementType.REST_60M,
        BatteryMeasurementType.REST_6H,
      ],
      forbiddenMeasurementTypes: [],
      restingBands: { maxRestingV: 13.2 },
      minimumContext: { restRequiresEngineOff: true },
    }),
  };
  const measurements = { create: jest.fn().mockResolvedValue({ id: 'rest-out-1' }) };
  const canonicalAnchorResolver = new LvRestCanonicalTargetAnchorResolverService(
    prisma as never,
  );
  const restEval = new BatteryRestTargetEvaluationService(
    prisma as never,
    measurements as never,
    policyProfiles as never,
    canonicalAnchorResolver,
  );
  return { restEval, measurements, policyProfiles };
}

function sessionRow(startedAt: Date, tripId: string = FORENSIC_TRIP) {
  return {
    id: SESSION,
    organizationId: ORG,
    vehicleId: VEH,
    type: BatteryMeasurementSessionType.LV_REST_WINDOW,
    status: BatteryMeasurementSessionStatus.ACTIVE,
    startedAt,
    tripId,
    sourceEntityType: 'trip',
    sourceEntityId: tripId,
  };
}

describe('G5C-N7 canonical REST target anchor bridge', () => {
  const prisma = {
    batteryMeasurement: { findFirst: jest.fn(), findMany: jest.fn() },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    batteryRestSession: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.batteryMeasurement.findFirst.mockResolvedValue(null);
    prisma.batteryRestSession.findMany.mockResolvedValue([
      {
        id: CANONICAL_REST,
        organizationId: ORG,
        vehicleId: VEH,
        anchorAt: CANONICAL_ANCHOR,
        sessionStatus: 'RESTING',
        confirmedTripId: FORENSIC_TRIP,
        candidateTripId: null,
      },
    ]);
  });

  it('A: edfdd3df shape — no VALID REST_60M when only pre-60m parked + wake samples exist', async () => {
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      restingLive('parked-12512', PARKED_12_512, 12.512),
      restingLive('wake-14118', WAKE_14_118, 14.118, {
        ignitionOn: true,
        isLvCharging: true,
      }),
    ]);

    const { restEval, measurements } = buildRestEval(prisma);
    const target60m = restTargetAt(
      CANONICAL_ANCHOR,
      'REST_60M',
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_60M',
      now: new Date(target60m.getTime() + 45 * 60_000),
    });

    expect(result.quality).not.toBe(BatteryMeasurementQuality.VALID);
    const createArg = measurements.create.mock.calls[0]?.[0];
    expect(createArg?.quality).not.toBe(BatteryMeasurementQuality.VALID);
    expect(isCanonicalRestAssessmentHandoffEligible(createArg)).toBe(false);
  });

  it('B: valid uninterrupted >=60m parked case links REST_60M with canonical provenance', async () => {
    const validObservedAt = new Date('2026-10-13T18:07:00.000Z');
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      restingLive('valid-60m', validObservedAt, 12.48),
    ]);

    const { restEval, measurements } = buildRestEval(prisma);
    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_60M',
      now: new Date(validObservedAt.getTime() + 60_000),
    });

    expect(result.ok).toBe(true);
    const createArg = measurements.create.mock.calls[0]?.[0];
    expect(createArg?.provenance?.canonicalRestSessionId).toBe(CANONICAL_REST);
    expect(createArg?.context?.restWindowStartedAt).toBe(CANONICAL_ANCHOR.toISOString());
    expect(isCanonicalRestAssessmentHandoffEligible(createArg)).toBe(true);
  });

  it('C: valid >=6h case links REST_6H with separate observation when policy passes', async () => {
    const valid6hAt = new Date('2026-10-13T23:07:00.000Z');
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      restingLive('valid-6h', valid6hAt, 12.42),
    ]);

    const { restEval, measurements } = buildRestEval(prisma);
    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_6H',
      now: new Date(valid6hAt.getTime() + 60_000),
    });

    expect(result.ok).toBe(true);
    const createArg = measurements.create.mock.calls[0]?.[0];
    expect(createArg?.type).toBe(BatteryMeasurementType.REST_6H);
    expect(createArg?.provenance?.canonicalRestSessionId).toBe(CANONICAL_REST);
  });

  it('D: sparse voltage — no fabricated VALID measurement', async () => {
    prisma.batteryMeasurement.findMany.mockResolvedValue([]);
    const { restEval } = buildRestEval(prisma);
    const target60m = restTargetAt(
      CANONICAL_ANCHOR,
      'REST_60M',
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_60M',
      now: new Date(target60m.getTime() + 45 * 60_000),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missed).toBe(true);
    }
  });

  it('E: wake / charging contamination rejected for REST_60M', async () => {
    const target60m = restTargetAt(
      CANONICAL_ANCHOR,
      'REST_60M',
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      restingLive('wake-only', target60m, 14.2, {
        ignitionOn: true,
        isLvCharging: true,
      }),
    ]);
    const { restEval, measurements } = buildRestEval(prisma);
    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_60M',
      now: new Date(target60m.getTime() + 45 * 60_000),
    });
    expect(result.quality).not.toBe(BatteryMeasurementQuality.VALID);
    expect(isCanonicalRestAssessmentHandoffEligible(measurements.create.mock.calls[0]?.[0])).toBe(
      false,
    );
  });

  it('F: duplicate evaluate uses idempotent measurement keys (no second VALID create)', async () => {
    const validObservedAt = new Date('2026-10-13T18:07:00.000Z');
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      restingLive('valid-60m', validObservedAt, 12.48),
    ]);
    const { restEval, measurements } = buildRestEval(prisma);
    await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_60M',
      now: new Date(validObservedAt.getTime() + 60_000),
    });
    await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(MISALIGNED_SESSION_START) as never,
      restTargetType: 'REST_60M',
      now: new Date(validObservedAt.getTime() + 120_000),
    });
    expect(measurements.create).toHaveBeenCalledTimes(2);
    const keys = measurements.create.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it('H/I: shadow provenance helpers fail-closed when shadow-without-publication is active', () => {
    const shadowActive = isLvRestShadowModeActive();
    if (shadowActive) {
      expect(resolveLvRestShadowPublicationEligible()).toBe(false);
      expect(resolveLvRestShadowEvidenceEligible(true)).toBe(false);
    } else {
      expect(resolveLvRestShadowEvidenceEligible(false)).toBe(false);
    }
  });

  it('uses session anchor when no canonical rest session is in tolerance', async () => {
    prisma.batteryRestSession.findMany.mockResolvedValue([]);
    const sessionStart = new Date('2026-08-26T10:00:00.000Z');
    const lvObservedAt = new Date('2026-08-26T11:00:00.000Z');
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      restingLive('live-1', lvObservedAt, 12.41),
    ]);
    const { restEval, measurements } = buildRestEval(prisma);
    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: sessionRow(sessionStart, 'trip-no-canonical-link') as never,
      restTargetType: 'REST_60M',
      now: new Date('2026-08-26T11:00:30.000Z'),
    });
    expect(result.ok).toBe(true);
    const createArg = measurements.create.mock.calls[0]?.[0];
    expect(createArg?.provenance?.canonicalRestSessionId).toBeUndefined();
    expect(createArg?.context?.restWindowStartedAt).toBe(sessionStart.toISOString());
  });
});
