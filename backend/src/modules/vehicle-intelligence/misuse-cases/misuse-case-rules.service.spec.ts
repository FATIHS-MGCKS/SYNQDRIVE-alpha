import { MisuseCaseRulesService } from './misuse-case-rules.service';
import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  TripAssignmentStatus,
} from '@prisma/client';
import type { TripEvaluationContext } from './misuse-case.types';
import { resolveAttribution, buildCaseFingerprint } from './misuse-case.types';

const baseTrip = {
  id: 'trip-1',
  vehicleId: 'veh-1',
  organizationId: 'org-1',
  startTime: new Date('2026-06-01T10:00:00Z'),
  endTime: new Date('2026-06-01T11:00:00Z'),
  assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
  assignmentSubjectType: 'BOOKING_CUSTOMER' as const,
  assignmentSubjectId: 'cust-1',
  assignedBookingId: 'book-1',
  isPrivateTrip: false,
  kickdownCount: 0,
  possibleImpactCount: 0,
  coldEngineAbuseCount: 0,
  hardAccelerationCount: 0,
  hardBrakingCount: 0,
  fullBrakingCount: 0,
  abuseEvents: 0,
};

function ctx(overrides: Partial<TripEvaluationContext>): TripEvaluationContext {
  return {
    trip: baseTrip,
    behaviorEvents: [],
    drivingEvents: [],
    dimoSafetyEvents: [],
    dtcEvents: [],
    contextAnchors: [],
    ...overrides,
  };
}

function mkAnchor(
  id: string,
  opts: {
    anchorType?: 'DIMO_NATIVE_BEHAVIOR_EVENT';
    classifications: string[];
    reasonCodes: string[];
    sampleCount?: number;
  },
): any {
  const sig = (max: number | null = null, extra: Record<string, unknown> = {}) => ({
    signal: 'x',
    count: 10,
    nonNullCount: 8,
    firstValue: null,
    lastValue: null,
    min: null,
    max,
    avg: null,
    nearestValueToAnchor: null,
    nearestSampleDistanceMs: 0,
    valueBeforeAnchor: null,
    valueAfterAnchor: null,
    medianIntervalMs: 1000,
    p95IntervalMs: 2000,
    maxGapMs: 3000,
    gapsOver2s: 0,
    gapsOver5s: 0,
    gapsOver10s: 0,
    coverageQuality: 'GOOD',
    ...extra,
  });
  return {
    source: 'DRIVING_EVENT',
    anchorId: id,
    occurredAt: new Date('2026-06-01T10:10:00Z'),
    assessment: {
      version: 1,
      status: 'COMPLETED',
      anchorType: opts.anchorType ?? 'DIMO_NATIVE_BEHAVIOR_EVENT',
      anchorEvent: null,
      anchorTimestamp: '2026-06-01T10:10:00.000Z',
      windowStart: '2026-06-01T10:09:30.000Z',
      windowEnd: '2026-06-01T10:11:30.000Z',
      engineSignalsApplicable: true,
      engineOnHint: true,
      dataQuality: {
        sampleCount: opts.sampleCount ?? 12,
        medianIntervalMs: 1000,
        p95IntervalMs: 2000,
        maxGapMs: 3000,
        nearestSampleToAnchorMs: 0,
        coverage: [],
      },
      signalCoverage: [{ signal: 'rpm', nonNullCount: 8, quality: 'GOOD' }],
      speedContext: sig(),
      rpmContext: sig(4200),
      throttleContext: sig(95),
      engineLoadContext: sig(70),
      coolantContext: sig(90),
      reasonCodes: opts.reasonCodes,
      preliminaryClassifications: opts.classifications,
      confidence: 'MEDIUM',
      evidenceGrade: 'B',
      generatedAt: '2026-06-01T10:12:00.000Z',
      error: null,
    },
  };
}

describe('MisuseCaseRulesService', () => {
  const service = new MisuseCaseRulesService();

  it('two harsh accelerations create CHECK_RECOMMENDED notable acceleration case', () => {
    const result = service.evaluate(
      ctx({
        drivingEvents: [
          {
            id: 'a1',
            eventType: 'HARSH_ACCELERATION',
            recordedAt: new Date('2026-06-01T10:05:00Z'),
          },
          {
            id: 'a2',
            eventType: 'HARSH_ACCELERATION',
            recordedAt: new Date('2026-06-01T10:08:00Z'),
          },
        ] as any,
      }),
    );
    const notable = result.find((c) => c.type === MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN);
    expect(notable).toBeDefined();
    const evidenceCase = (notable?.evidenceSummary as any)?.evidenceCase;
    expect(evidenceCase?.evidenceLevel).toBe('CHECK_RECOMMENDED');
    expect(evidenceCase?.chargeable).toBe(false);
    expect(evidenceCase?.requiresHumanReview).toBe(true);
  });

  it('single kickdown does not create aggressive driving case', () => {
    const result = service.evaluate(
      ctx({
        behaviorEvents: [
          {
            id: 'e1',
            eventCategory: 'ABUSE',
            eventType: 'KICKDOWN',
            startedAt: new Date('2026-06-01T10:15:00Z'),
          } as any,
        ],
      }),
    );
    expect(result.find((c) => c.type === MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN)).toBeUndefined();
  });

  it('multiple kickdowns create AGGRESSIVE_DRIVING_PATTERN', () => {
    const kickdowns = Array.from({ length: 5 }).map((_, i) => ({
      id: `k${i}`,
      eventCategory: 'ABUSE' as const,
      eventType: 'KICKDOWN',
      startedAt: new Date(`2026-06-01T10:${String(10 + i).padStart(2, '0')}:00Z`),
    }));
    const result = service.evaluate(ctx({ behaviorEvents: kickdowns as any }));
    expect(result.some((c) => c.type === MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN)).toBe(true);
  });

  it('single short ENGINE_REV_IN_IDLE does not create case', () => {
    const result = service.evaluate(
      ctx({
        behaviorEvents: [
          {
            id: 'r1',
            eventCategory: 'ABUSE',
            eventType: 'ENGINE_REV_IN_IDLE',
            startedAt: new Date('2026-06-01T10:05:00Z'),
            durationMs: 2000,
          } as any,
        ],
      }),
    );
    expect(result.find((c) => c.type === MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE)).toBeUndefined();
  });

  it('repeated ENGINE_REV_IN_IDLE creates case', () => {
    const revs = [0, 3, 6].map((m) => ({
      id: `r${m}`,
      eventCategory: 'ABUSE' as const,
      eventType: 'ENGINE_REV_IN_IDLE',
      startedAt: new Date(`2026-06-01T10:${String(m).padStart(2, '0')}:00Z`),
      durationMs: 3000,
    }));
    const result = service.evaluate(ctx({ behaviorEvents: revs as any }));
    expect(result.some((c) => c.type === MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE)).toBe(true);
  });

  it('COLD_ENGINE_FULL_THROTTLE creates COLD_ENGINE_ABUSE', () => {
    const result = service.evaluate(
      ctx({
        behaviorEvents: [
          {
            id: 'c1',
            eventCategory: 'ABUSE',
            eventType: 'COLD_ENGINE_FULL_THROTTLE',
            classification: 'SEVERE',
            startedAt: new Date('2026-06-01T10:05:00Z'),
          } as any,
        ],
      }),
    );
    expect(result.some((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE)).toBe(true);
  });

  it('POSSIBLE_IMPACT creates DAMAGE_SUSPICION case', () => {
    const result = service.evaluate(
      ctx({
        behaviorEvents: [
          {
            id: 'p1',
            eventCategory: 'ABUSE',
            eventType: 'POSSIBLE_IMPACT',
            classification: 'CRITICAL',
            startedAt: new Date('2026-06-01T10:20:00Z'),
          } as any,
        ],
      }),
    );
    const impact = result.find((c) => c.type === MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT);
    expect(impact).toBeDefined();
    expect(impact?.category).toBe(MisuseCaseCategory.DAMAGE_SUSPICION);
    expect(impact?.severity).toBe(MisuseCaseSeverity.SEVERE);
  });

  it('DIMO safety.collision creates DIMO_COLLISION_REPORTED', () => {
    const result = service.evaluate(
      ctx({
        dimoSafetyEvents: [
          {
            timestamp: '2026-06-01T10:25:00.000Z',
            name: 'safety.collision',
            source: '0xabc',
            durationNs: 0,
            metadata: null,
          },
        ],
      }),
    );
    const dimo = result.find((c) => c.type === MisuseCaseType.DIMO_COLLISION_REPORTED);
    expect(dimo).toBeDefined();
    expect(dimo?.severity).toBe(MisuseCaseSeverity.CRITICAL);
  });

  it('safety.collision + possible impact increases confidence and dedupes to one case', () => {
    const result = service.evaluate(
      ctx({
        behaviorEvents: [
          {
            id: 'p1',
            eventCategory: 'ABUSE',
            eventType: 'POSSIBLE_IMPACT',
            startedAt: new Date('2026-06-01T10:20:00Z'),
          } as any,
        ],
        drivingEvents: [
          {
            id: 'de-col',
            eventType: 'SAFETY_COLLISION',
            recordedAt: new Date('2026-06-01T10:20:00Z'),
            metadataJson: { dimoEventName: 'safety.collision' },
          } as any,
        ],
        dimoSafetyEvents: [
          {
            timestamp: '2026-06-01T10:25:00.000Z',
            name: 'safety.collision',
            source: '0xabc',
            durationNs: 0,
            metadata: null,
          },
        ],
      }),
    );
    const dimo = result.find((c) => c.type === MisuseCaseType.DIMO_COLLISION_REPORTED);
    const proxy = result.find((c) => c.type === MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT);
    expect(dimo).toBeDefined();
    expect(dimo?.confidence).toBe(MisuseCaseConfidence.HIGH);
    expect(proxy).toBeUndefined();
    expect(dimo?.description).toContain('POSSIBLE_IMPACT-Proxy');
    expect(dimo?.evidenceSummary?.damageIncident).toBeDefined();
  });

  it('LAUNCH_LIKE_START creates LAUNCH_ABUSE_PATTERN when rule threshold met', () => {
    const launches = [
      {
        id: 'l1',
        eventCategory: 'ABUSE' as const,
        eventType: 'LAUNCH_LIKE_START',
        classification: 'SEVERE',
        startedAt: new Date('2026-06-01T10:05:00Z'),
      },
      {
        id: 'l2',
        eventCategory: 'ABUSE' as const,
        eventType: 'LAUNCH_LIKE_START',
        classification: 'MODERATE',
        startedAt: new Date('2026-06-01T10:10:00Z'),
      },
    ];
    const result = service.evaluate(ctx({ behaviorEvents: launches as any }));
    const launchCase = result.find((c) => c.type === MisuseCaseType.LAUNCH_ABUSE_PATTERN);
    expect(launchCase).toBeDefined();
    expect(launchCase?.title).not.toMatch(/Launch Control/i);
    expect(launchCase?.description).not.toMatch(/Launch Control/i);
    expect(launchCase?.recommendedAction).not.toMatch(/Launch Control/i);
  });

  it('LAUNCH_CONTROL alone does not create LAUNCH_ABUSE_PATTERN', () => {
    const result = service.evaluate(
      ctx({
        behaviorEvents: [
          {
            id: 'lc1',
            eventCategory: 'ABUSE',
            eventType: 'LAUNCH_CONTROL',
            classification: 'SEVERE',
            startedAt: new Date('2026-06-01T10:05:00Z'),
          } as any,
        ],
      }),
    );
    expect(result.find((c) => c.type === MisuseCaseType.LAUNCH_ABUSE_PATTERN)).toBeUndefined();
  });

  it('multiple native context anchors overlap => one combined aggressive case', () => {
    const aggStart = mkAnchor('de-1', {
      classifications: ['AGGRESSIVE_START'],
      reasonCodes: ['NATIVE_EVENT_ANCHOR', 'HIGH_RPM', 'HIGH_THROTTLE'],
    });
    const highRpmConst = mkAnchor('de-2', {
      classifications: ['HIGH_RPM_CONSTANT'],
      reasonCodes: ['NATIVE_EVENT_ANCHOR', 'HIGH_RPM'],
      sampleCount: 9,
    });

    const result = service.evaluate(ctx({ contextAnchors: [aggStart, highRpmConst] }));
    const aggressive = result.filter(
      (c) => c.type === MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
    );
    expect(aggressive).toHaveLength(1);
    const summary = aggressive[0].evidenceSummary?.contextEvidence as any;
    expect(summary.sourceAnchors.drivingEventIds).toContain('de-1');
    expect(summary.sourceAnchors.drivingEventIds).toContain('de-2');
    expect(aggressive[0].evidence).toHaveLength(2);
  });
});

describe('resolveAttribution', () => {
  it('PRIVATE_UNASSIGNED does not assign customer', () => {
    const attr = resolveAttribution({
      ...baseTrip,
      assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: true,
    });
    expect(attr.attributionScope).toBe(MisuseAttributionScope.PRIVATE_UNASSIGNED);
    expect(attr.customerId).toBeNull();
    expect(attr.bookingId).toBeNull();
  });

  it('ASSIGNED_BOOKING_CUSTOMER sets booking and customer', () => {
    const attr = resolveAttribution(baseTrip);
    expect(attr.attributionScope).toBe(MisuseAttributionScope.BOOKING_CUSTOMER);
    expect(attr.customerId).toBe('cust-1');
    expect(attr.bookingId).toBe('book-1');
  });
});

describe('buildCaseFingerprint', () => {
  it('is stable per org trip and type', () => {
    const fp = buildCaseFingerprint('org-1', 'trip-1', MisuseCaseType.COLD_ENGINE_ABUSE);
    expect(fp).toBe('org-1:trip-1:COLD_ENGINE_ABUSE');
  });
});
