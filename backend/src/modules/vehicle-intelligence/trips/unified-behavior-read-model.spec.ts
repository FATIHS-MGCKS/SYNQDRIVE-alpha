import {
  buildUnifiedBehaviorEvents,
  dedupeUnifiedBehaviorEvents,
  deriveDerivedAbuseRelevance,
  deriveNativeAbuseRelevance,
  mapDrivingEventRow,
  countVisibleUnifiedBehaviorEvents,
  type BehaviorEventRow,
  type DrivingEventRow,
} from './unified-behavior-read-model';

const TRIP = 'trip-1';
const VEH = 'veh-1';
const ORG = 'org-1';
const T0 = new Date('2026-01-01T10:00:00.000Z');

function nativeEvent(
  overrides: Partial<DrivingEventRow> & { eventType: string },
): DrivingEventRow {
  return {
    id: `de-${Math.random().toString(36).slice(2)}`,
    organizationId: ORG,
    vehicleId: VEH,
    tripId: TRIP,
    severity: 0.9,
    latitude: null,
    longitude: null,
    speedKmh: 50,
    deltaKmh: null,
    durationMs: 1000,
    metadataJson: {},
    recordedAt: T0,
    createdAt: T0,
    ...overrides,
  };
}

function behaviorEvent(
  overrides: Partial<BehaviorEventRow> & { eventCategory: string; eventType: string },
): BehaviorEventRow {
  return {
    id: `be-${Math.random().toString(36).slice(2)}`,
    organizationId: ORG,
    vehicleId: VEH,
    tripId: TRIP,
    classification: 'SEVERE',
    startedAt: T0,
    endedAt: null,
    durationMs: 1000,
    startSpeedKmh: 50,
    endSpeedKmh: 0,
    peakValue: 1,
    peakValueUnit: 'g',
    peakG: null,
    maxThrottlePos: null,
    maxEngineRpm: null,
    maxCoolantTemp: null,
    metadataJson: {},
    createdAt: T0,
    ...overrides,
  };
}

describe('deriveNativeAbuseRelevance', () => {
  it('flags native EXTREME_BRAKING as abuse-relevant (mirrors abuse KPI)', () => {
    const r = deriveNativeAbuseRelevance('EXTREME_BRAKING');
    expect(r.abuseRelevant).toBe(true);
    expect(r.abuseCategory).toBe('BRAKE_ABUSE_PATTERN');
    expect(r.abuseReason).toBeTruthy();
  });

  it('does NOT flag normal harsh braking / acceleration', () => {
    expect(deriveNativeAbuseRelevance('HARSH_BRAKING').abuseRelevant).toBe(false);
    expect(deriveNativeAbuseRelevance('HARSH_ACCELERATION').abuseRelevant).toBe(false);
    expect(deriveNativeAbuseRelevance('HARSH_CORNERING').abuseRelevant).toBe(false);
  });
});

describe('deriveDerivedAbuseRelevance', () => {
  it('flags any ABUSE-category HF event as abuse-relevant', () => {
    const r = deriveDerivedAbuseRelevance('ABUSE', 'FULL_BRAKING');
    expect(r.abuseRelevant).toBe(true);
    expect(r.abuseCategory).toBe('BRAKE_ABUSE_PATTERN');
  });

  it('does NOT flag non-abuse HF categories', () => {
    expect(deriveDerivedAbuseRelevance('BRAKING', 'BRAKING').abuseRelevant).toBe(false);
    expect(deriveDerivedAbuseRelevance('ACCELERATION', 'ACCELERATION').abuseRelevant).toBe(false);
  });
});

describe('mapDrivingEventRow', () => {
  it('prefers stored classification (extreme acceleration stays EXTREME)', () => {
    const row = nativeEvent({
      eventType: 'HARSH_ACCELERATION',
      metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
    });
    const mapped = mapDrivingEventRow(row, TRIP);
    expect(mapped.classification).toBe('EXTREME');
    expect(mapped.eventCategory).toBe('ACCELERATION');
    expect(mapped.provenance).toBe('NATIVE');
    expect(mapped.originalEventName).toBe('behavior.extremeAcceleration');
    // Extreme acceleration is NOT abuse-KPI relevant (only extreme braking is).
    expect(mapped.abuseRelevant).toBe(false);
  });

  it('surfaces native original event name + source for the read-model', () => {
    const row = nativeEvent({
      eventType: 'EXTREME_BRAKING',
      metadataJson: { dimoEventName: 'behavior.extremeBraking', dimoEventSource: 'dimo/macaron' },
    });
    const mapped = mapDrivingEventRow(row, TRIP);
    expect(mapped.originalEventName).toBe('behavior.extremeBraking');
    expect(mapped.originalEventSource).toBe('dimo/macaron');
  });
});

describe('buildUnifiedBehaviorEvents', () => {
  it('native extremeBraking is abuse-relevant and appears in the detail list', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [nativeEvent({ eventType: 'EXTREME_BRAKING' })],
      behaviorEvents: [],
      tripId: TRIP,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].provenance).toBe('NATIVE');
    expect(merged[0].abuseRelevant).toBe(true);
  });

  it('native harshAcceleration stays visible and is not duplicated', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [nativeEvent({ eventType: 'HARSH_ACCELERATION' })],
      behaviorEvents: [],
      tripId: TRIP,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].abuseRelevant).toBe(false);
    expect(merged[0].eventCategory).toBe('ACCELERATION');
  });

  it('derived event without native counterpart appears as reconstructed', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [],
      behaviorEvents: [behaviorEvent({ eventCategory: 'ABUSE', eventType: 'FULL_BRAKING' })],
      tripId: TRIP,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].provenance).toBe('RECONSTRUCTED');
    expect(merged[0].abuseRelevant).toBe(true);
  });

  it('native + derived SAME category within dedup window → native preferred', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [nativeEvent({ eventType: 'EXTREME_BRAKING', recordedAt: T0 })],
      behaviorEvents: [
        behaviorEvent({
          eventCategory: 'BRAKING',
          eventType: 'BRAKING',
          startedAt: new Date(T0.getTime() + 2_000), // within ±2s bucket
        }),
      ],
      tripId: TRIP,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].provenance).toBe('NATIVE');
  });

  it('same timestamp/type/source => one visible row', () => {
    const row = nativeEvent({ eventType: 'HARSH_BRAKING', recordedAt: T0 });
    const mapped = mapDrivingEventRow(row, TRIP);
    const deduped = dedupeUnifiedBehaviorEvents([mapped, mapped], TRIP);
    expect(deduped).toHaveLength(1);
  });

  it('context classification does not add a separate row', () => {
    const bare = mapDrivingEventRow(
      nativeEvent({ eventType: 'HARSH_ACCELERATION', recordedAt: T0 }),
      TRIP,
    );
    const withContext = mapDrivingEventRow(
      nativeEvent({
        eventType: 'HARSH_ACCELERATION',
        recordedAt: T0,
        metadataJson: {
          contextAssessment: {
            status: 'COMPLETED',
            classifications: ['AGGRESSIVE_START', 'KICKDOWN_LIKELY'],
            confidence: 'MEDIUM',
            evidenceGrade: 'B',
          },
        },
      }),
      TRIP,
    );
    const deduped = dedupeUnifiedBehaviorEvents([bare, withContext], TRIP);
    expect(deduped).toHaveLength(1);
    const ca = deduped[0].contextAssessment as { classifications?: string[] };
    expect(ca.classifications).toEqual(
      expect.arrayContaining(['AGGRESSIVE_START', 'KICKDOWN_LIKELY']),
    );
  });

  it('higher severity wins for same native incident bucket', () => {
    const moderate = mapDrivingEventRow(
      nativeEvent({
        eventType: 'HARSH_BRAKING',
        recordedAt: T0,
        metadataJson: { classification: 'MODERATE' },
      }),
      TRIP,
    );
    const hard = mapDrivingEventRow(
      nativeEvent({
        eventType: 'HARSH_BRAKING',
        recordedAt: new Date(T0.getTime() + 1_000),
        metadataJson: { classification: 'HARD' },
      }),
      TRIP,
    );
    const deduped = dedupeUnifiedBehaviorEvents([moderate, hard], TRIP);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].classification).toBe('HARD');
  });

  it('reprocessing duplicate inputs yields stable visible count', () => {
    const input = {
      drivingEvents: [
        nativeEvent({ eventType: 'HARSH_BRAKING', recordedAt: T0 }),
        nativeEvent({ eventType: 'HARSH_ACCELERATION', recordedAt: new Date(T0.getTime() + 60_000) }),
      ],
      behaviorEvents: [
        behaviorEvent({
          eventCategory: 'BRAKING',
          eventType: 'BRAKING',
          startedAt: T0,
        }),
      ],
      tripId: TRIP,
    };
    const first = buildUnifiedBehaviorEvents(input);
    const second = buildUnifiedBehaviorEvents({
      ...input,
      drivingEvents: [...input.drivingEvents, ...input.drivingEvents],
      behaviorEvents: [...input.behaviorEvents, ...input.behaviorEvents],
    });
    expect(countVisibleUnifiedBehaviorEvents(first)).toBe(2);
    expect(countVisibleUnifiedBehaviorEvents(second)).toBe(2);
  });

  it('visible event count equals deduped list length', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [
        nativeEvent({ eventType: 'HARSH_BRAKING', recordedAt: T0 }),
        nativeEvent({ eventType: 'HARSH_CORNERING', recordedAt: new Date(T0.getTime() + 30_000) }),
      ],
      behaviorEvents: [
        behaviorEvent({
          eventCategory: 'BRAKING',
          eventType: 'BRAKING',
          startedAt: T0,
        }),
      ],
      tripId: TRIP,
    });
    expect(countVisibleUnifiedBehaviorEvents(merged)).toBe(merged.length);
    expect(merged).toHaveLength(2);
  });

  it('native + derived DIFFERENT category → not deduped (both kept)', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [nativeEvent({ eventType: 'EXTREME_BRAKING', recordedAt: T0 })],
      behaviorEvents: [
        behaviorEvent({
          eventCategory: 'ABUSE',
          eventType: 'COLD_ENGINE_HIGH_RPM',
          startedAt: new Date(T0.getTime() + 1_000), // overlapping in time, different category
        }),
      ],
      tripId: TRIP,
    });
    expect(merged).toHaveLength(2);
  });

  it('detail abuse-relevant count equals the abuse KPI contribution', () => {
    // KPI on LTE_R1: abuseEvents = (#HF abuse) + (#native EXTREME_BRAKING)
    const hfAbuse = [
      behaviorEvent({ eventCategory: 'ABUSE', eventType: 'FULL_BRAKING', startedAt: new Date(T0.getTime() + 60_000) }),
      behaviorEvent({ eventCategory: 'ABUSE', eventType: 'KICKDOWN', startedAt: new Date(T0.getTime() + 120_000) }),
    ];
    const native = [
      nativeEvent({ eventType: 'EXTREME_BRAKING', recordedAt: T0 }),
      nativeEvent({ eventType: 'HARSH_BRAKING', recordedAt: new Date(T0.getTime() + 200_000) }),
      nativeEvent({ eventType: 'HARSH_ACCELERATION', recordedAt: new Date(T0.getTime() + 300_000) }),
    ];
    const kpiAbuseContribution = hfAbuse.length + native.filter((n) => n.eventType === 'EXTREME_BRAKING').length;

    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: native,
      behaviorEvents: hfAbuse,
      tripId: TRIP,
    });
    const detailAbuseCount = merged.filter((e) => e.abuseRelevant).length;
    expect(detailAbuseCount).toBe(kpiAbuseContribution);
    expect(detailAbuseCount).toBe(3);
  });
});
