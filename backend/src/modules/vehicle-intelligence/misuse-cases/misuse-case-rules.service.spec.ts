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
    ...overrides,
  };
}

describe('MisuseCaseRulesService', () => {
  const service = new MisuseCaseRulesService();

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

  it('safety.collision + possible impact increases confidence', () => {
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
    expect(dimo?.confidence).toBe(MisuseCaseConfidence.HIGH);
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
