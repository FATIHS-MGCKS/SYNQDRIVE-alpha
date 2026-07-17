import {
  BrakingEventCanonicalType,
  BrakingEventPrimarySource,
  BehaviorEventClassification,
  DrivingEventType,
} from '@prisma/client';
import {
  BRAKING_SOURCE_PRIORITY,
  brakingIncidentKey,
  buildBrakingLedgerSourceFingerprint,
  correlateBrakingCandidates,
  DEFAULT_BRAKING_DEDUPE_WINDOW_MS,
  HARSH_BRAKE_WEAR_MULTIPLIER_STATUS,
  mapDimoIntakeToCandidate,
  mapDrivingEventToCandidate,
  mapTripBehaviorEventToCandidate,
  pickIncidentWinner,
  summarizeCanonicalBrakingIncidents,
  type BrakingEventCandidate,
} from './braking-event-ledger.domain';
import { BrakingEventLedgerService } from './braking-event-ledger.service';

function dimoCandidate(
  overrides?: Partial<BrakingEventCandidate> & { occurredAt?: Date },
): BrakingEventCandidate {
  const occurredAt = overrides?.occurredAt ?? new Date('2026-06-26T12:00:00.000Z');
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    tripId: 'trip-1',
    occurredAt,
    canonicalType: BrakingEventCanonicalType.HARSH_BRAKING,
    severity: 0.6,
    primarySource: BrakingEventPrimarySource.DIMO_PROVIDER,
    providerEventId: 'prov-1',
    confidence: 0.95,
    peakDecelerationMs2: 5.0,
    startSpeedKmh: 55,
    correlatedSourceIds: [{ kind: 'DRIVING_EVENT', id: 'de-1' }],
    ...overrides,
  };
}

function hfBrakingCandidate(overrides?: Partial<BrakingEventCandidate>): BrakingEventCandidate {
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    tripId: 'trip-1',
    occurredAt: new Date('2026-06-26T12:00:00.500Z'),
    canonicalType: BrakingEventCanonicalType.HARSH_BRAKING,
    severity: 0.6,
    primarySource: BrakingEventPrimarySource.SYNQDRIVE_HF_BRAKING,
    providerEventId: null,
    confidence: 0.75,
    peakDecelerationMs2: 4.8,
    startSpeedKmh: 54,
    correlatedSourceIds: [{ kind: 'TRIP_BEHAVIOR_EVENT', id: 'tbe-1' }],
    ...overrides,
  };
}

describe('braking-event-ledger.domain', () => {
  it('collapses identical DIMO and SynqDrive events into one incident', () => {
    const incidents = correlateBrakingCandidates([dimoCandidate(), hfBrakingCandidate()]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].winner.primarySource).toBe(BrakingEventPrimarySource.DIMO_PROVIDER);
    expect(incidents[0].winner.correlatedSourceIds).toHaveLength(2);
  });

  it('keeps two real events shortly apart as separate incidents', () => {
    const incidents = correlateBrakingCandidates([
      dimoCandidate({ occurredAt: new Date('2026-06-26T12:00:00.000Z') }),
      dimoCandidate({
        occurredAt: new Date('2026-06-26T12:00:03.000Z'),
        providerEventId: 'prov-2',
        correlatedSourceIds: [{ kind: 'DRIVING_EVENT', id: 'de-2' }],
      }),
    ]);
    expect(incidents).toHaveLength(2);
  });

  it('supports events without trip assignment', () => {
    const incidents = correlateBrakingCandidates([
      dimoCandidate({ tripId: null, providerEventId: 'prov-orphan' }),
    ]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].winner.tripId).toBeNull();
  });

  it('prefers higher severity canonical type when merging', () => {
    const winner = pickIncidentWinner([
      dimoCandidate({ canonicalType: BrakingEventCanonicalType.HARSH_BRAKING, severity: 0.6 }),
      hfBrakingCandidate({
        canonicalType: BrakingEventCanonicalType.EXTREME_BRAKING,
        severity: 0.9,
        primarySource: BrakingEventPrimarySource.SYNQDRIVE_HF_BRAKING,
      }),
    ]);
    expect(winner.canonicalType).toBe(BrakingEventCanonicalType.EXTREME_BRAKING);
    expect(winner.primarySource).toBe(BrakingEventPrimarySource.DIMO_PROVIDER);
  });

  it('handles out-of-order candidate ingestion deterministically', () => {
    const early = dimoCandidate({ occurredAt: new Date('2026-06-26T12:00:10.000Z'), providerEventId: 'b' });
    const late = dimoCandidate({ occurredAt: new Date('2026-06-26T12:00:00.000Z'), providerEventId: 'a' });
    const incidents = correlateBrakingCandidates([early, late]);
    expect(incidents.map((i) => i.winner.providerEventId)).toEqual(['a', 'b']);
  });

  it('builds stable source fingerprints for idempotent upsert', () => {
    const key = brakingIncidentKey({
      vehicleId: 'veh-a',
      tripId: 'trip-1',
      occurredAt: new Date('2026-06-26T12:00:00.750Z'),
    });
    const fp = buildBrakingLedgerSourceFingerprint({ organizationId: 'org-a', incidentKey: key });
    expect(fp).toHaveLength(32);
    expect(
      buildBrakingLedgerSourceFingerprint({ organizationId: 'org-a', incidentKey: key }),
    ).toBe(fp);
  });

  it('does not merge events outside the dedupe window', () => {
    const keyA = brakingIncidentKey({
      vehicleId: 'veh-a',
      tripId: 'trip-1',
      occurredAt: new Date('2026-06-26T12:00:00.000Z'),
    });
    const keyB = brakingIncidentKey({
      vehicleId: 'veh-a',
      tripId: 'trip-1',
      occurredAt: new Date('2026-06-26T12:00:02.500Z'),
    });
    expect(keyA).not.toBe(keyB);
  });

  it('summarizes canonical counts without double-counting merged incidents', () => {
    const incidents = correlateBrakingCandidates([
      dimoCandidate({ canonicalType: BrakingEventCanonicalType.EXTREME_BRAKING, severity: 0.9 }),
      hfBrakingCandidate({
        canonicalType: BrakingEventCanonicalType.FULL_BRAKING,
        severity: 0.95,
        primarySource: BrakingEventPrimarySource.SYNQDRIVE_HF_ABUSE,
      }),
    ]);
    const summary = summarizeCanonicalBrakingIncidents(incidents);
    expect(summary.totalCanonicalEvents).toBe(1);
    expect(summary.hardBrakeCount).toBe(1);
    expect(summary.fullBrakingCount).toBe(1);
    expect(summary.totalBrakingEvents).toBe(1);
  });

  it('documents harshBrakeWearMultiplier is wired in recalculate wear formula', () => {
    expect(HARSH_BRAKE_WEAR_MULTIPLIER_STATUS.appliedInRecalculate).toBe(true);
    expect(HARSH_BRAKE_WEAR_MULTIPLIER_STATUS.activeWearFormula).toContain('harshBrakeWearMultiplier');
  });

  it('maps provider and HF sources with explicit priority ordering', () => {
    expect(BRAKING_SOURCE_PRIORITY[BrakingEventPrimarySource.DIMO_PROVIDER]).toBeLessThan(
      BRAKING_SOURCE_PRIORITY[BrakingEventPrimarySource.SYNQDRIVE_HF_BRAKING],
    );
    expect(BRAKING_SOURCE_PRIORITY[BrakingEventPrimarySource.SYNQDRIVE_HF_BRAKING]).toBeLessThan(
      BRAKING_SOURCE_PRIORITY[BrakingEventPrimarySource.SYNQDRIVE_HF_ABUSE],
    );
  });

  it('maps driving event and trip behavior rows to candidates', () => {
    const driving = mapDrivingEventToCandidate({
      id: 'de-1',
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      tripId: 'trip-1',
      eventType: DrivingEventType.EXTREME_BRAKING,
      recordedAt: new Date('2026-06-26T12:00:00.000Z'),
      severity: 0.9,
      speedKmh: 70,
      metadataJson: { providerEventId: 'prov-x' },
    });
    expect(driving?.canonicalType).toBe(BrakingEventCanonicalType.EXTREME_BRAKING);

    const hf = mapTripBehaviorEventToCandidate({
      id: 'tbe-1',
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      tripId: 'trip-1',
      eventCategory: 'ABUSE',
      eventType: 'FULL_BRAKING',
      classification: BehaviorEventClassification.SEVERE,
      startedAt: new Date('2026-06-26T12:00:00.000Z'),
      startSpeedKmh: 60,
      endSpeedKmh: 10,
      peakValue: 7.8,
      confidence: 0.8,
    });
    expect(hf?.canonicalType).toBe(BrakingEventCanonicalType.FULL_BRAKING);
  });

  it('maps DIMO intake rows as highest-confidence provider evidence', () => {
    const intake = mapDimoIntakeToCandidate({
      id: 'intake-1',
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      tripId: 'trip-1',
      eventType: DrivingEventType.HARSH_BRAKING,
      eventTimestamp: new Date('2026-06-26T12:00:00.000Z'),
      severity: 0.6,
      providerEventId: 'hash-abc',
    });
    expect(intake?.primarySource).toBe(BrakingEventPrimarySource.DIMO_PROVIDER);
    expect(intake?.confidence).toBeGreaterThan(0.9);
  });
});

describe('BrakingEventLedgerService', () => {
  function makeService(overrides?: {
    trip?: any;
    drivingEvents?: any[];
    behaviorEvents?: any[];
    intakeRows?: any[];
    ledgerFindUnique?: jest.Mock;
    ledgerCreate?: jest.Mock;
    ledgerUpdate?: jest.Mock;
    ledgerFindMany?: jest.Mock;
    ledgerUpdateMany?: jest.Mock;
    ledgerCount?: jest.Mock;
  }) {
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn(async () =>
          overrides?.trip ?? {
            id: 'trip-1',
            vehicleId: 'veh-a',
            vehicle: { organizationId: 'org-a' },
          },
        ),
        findMany: jest.fn(async () => []),
      },
      drivingEvent: {
        findMany: jest.fn(async () => overrides?.drivingEvents ?? []),
      },
      tripBehaviorEvent: {
        findMany: jest.fn(async () => overrides?.behaviorEvents ?? []),
      },
      dimoBrakingEventIntake: {
        findMany: jest.fn(async () => overrides?.intakeRows ?? []),
      },
      brakingEventLedger: {
        findUnique:
          overrides?.ledgerFindUnique ??
          jest.fn(async () => null),
        create: overrides?.ledgerCreate ?? jest.fn(async () => ({})),
        update: overrides?.ledgerUpdate ?? jest.fn(async () => ({})),
        findMany: overrides?.ledgerFindMany ?? jest.fn(async () => []),
        updateMany: overrides?.ledgerUpdateMany ?? jest.fn(async () => ({ count: 0 })),
        count: overrides?.ledgerCount ?? jest.fn(async () => 0),
      },
    };
    const service = new BrakingEventLedgerService(prisma as never);
    return { service, prisma };
  }

  it('reconciles provider duplicate as unchanged on second run (parallel-safe idempotency)', async () => {
    const now = new Date('2026-06-26T12:00:00.000Z');
    const drivingEvents = [
      {
        id: 'de-1',
        organizationId: 'org-a',
        vehicleId: 'veh-a',
        tripId: 'trip-1',
        eventType: DrivingEventType.HARSH_BRAKING,
        recordedAt: now,
        severity: 0.6,
        speedKmh: 50,
        metadataJson: { providerEventId: 'prov-1', provider: 'DIMO' },
        source: 'TELEMETRY_EVENTS',
      },
    ];

    const ledgerFindUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'ledger-1',
        createdAt: now,
        updatedAt: now,
        correlatedSourceIds: [{ kind: 'DRIVING_EVENT', id: 'de-1' }],
        canonicalType: BrakingEventCanonicalType.HARSH_BRAKING,
        primarySource: BrakingEventPrimarySource.DIMO_PROVIDER,
      });

    const { service } = makeService({
      drivingEvents,
      ledgerFindUnique,
      ledgerCreate: jest.fn(async () => ({})),
    });

    const first = await service.reconcileTrip('trip-1');
    const second = await service.reconcileTrip('trip-1');

    expect(first?.created).toBe(1);
    expect(second?.unchanged).toBe(1);
    expect(second?.summary.totalCanonicalEvents).toBe(1);
  });

  it('skips cross-tenant reconcile when organization guard mismatches', async () => {
    const { service } = makeService();
    const result = await service.reconcileTrip('trip-1', {
      expectedOrganizationId: 'org-other',
    });
    expect(result).toBeNull();
  });

  it('plans backfill only for trips with sources but no ledger rows', async () => {
    const { service, prisma } = makeService();
    (prisma.vehicleTrip.findMany as jest.Mock) = jest.fn(async () => [
      {
        id: 'trip-1',
        vehicleId: 'veh-a',
        vehicle: { organizationId: 'org-a' },
        _count: { events: 2, behaviorEvents: 0 },
      },
    ]);
    (prisma.brakingEventLedger.count as jest.Mock) = jest.fn(async () => 0);

    const plan = await service.planBackfill({ organizationId: 'org-a', limit: 10 });
    expect(plan).toHaveLength(1);
    expect(plan[0].tripId).toBe('trip-1');
  });

  it('returns canonical summary used by TDI without duplicate incident rows', async () => {
    const { service, prisma } = makeService();
    prisma.brakingEventLedger.findMany = jest.fn(async () => [
      {
        organizationId: 'org-a',
        vehicleId: 'veh-a',
        tripId: 'trip-1',
        occurredAt: new Date('2026-06-26T12:00:00.000Z'),
        canonicalType: BrakingEventCanonicalType.HARSH_BRAKING,
        severity: 0.6,
        primarySource: BrakingEventPrimarySource.DIMO_PROVIDER,
        providerEventId: 'prov-1',
        confidence: 0.95,
        peakDecelerationMs2: 5,
        startSpeedKmh: 60,
        correlatedSourceIds: [{ kind: 'DRIVING_EVENT', id: 'de-1' }],
      },
    ]);

    const summary = await service.getCanonicalSummaryForTrip('trip-1');
    expect(summary?.hardBrakeCount).toBe(1);
    expect(summary?.totalBrakingEvents).toBe(1);
    expect(summary?.brakingEventRows).toHaveLength(1);
  });
});

describe('BrakingEventLedgerService — TDI count guard', () => {
  it('merged DIMO+HF incident yields single hardBrake count for wear input', () => {
    const incidents = correlateBrakingCandidates([
      dimoCandidate(),
      hfBrakingCandidate(),
    ]);
    const summary = summarizeCanonicalBrakingIncidents(incidents);
    expect(summary.hardBrakeCount).toBe(1);
    expect(summary.totalBrakingEvents).toBe(1);
  });
});
