import { evaluateTripAssessability } from './trip-assessability.policy';
import {
  TRIP_ASSESSABILITY_DIMENSIONS,
  TRIP_ASSESSABILITY_POLICY_VERSION,
  type TripAssessabilityPolicyInput,
} from './trip-assessability.types';

function baseInput(overrides: Partial<TripAssessabilityPolicyInput> = {}): TripAssessabilityPolicyInput {
  const start = new Date('2026-07-16T08:00:00Z');
  const end = new Date('2026-07-16T08:45:00Z');
  return {
    calculatedAt: new Date('2026-07-16T09:00:00Z'),
    inputWindowStart: start,
    inputWindowEnd: end,
    tripBoundary: {
      dimoSegmentId: 'seg-1',
      startTime: start,
      endTime: end,
      tripStatus: 'COMPLETED',
      qualityStatus: 'OK',
    },
    route: {
      enrichmentStatus: 'COMPLETED',
      waypointCount: 120,
      coverage: 0.92,
      effectiveCadenceMs: 5000,
      p95CadenceMs: 8000,
      providerError: false,
    },
    behavior: {
      enrichmentStatus: 'COMPLETED',
      nativeEventCount: 4,
      nativeQuerySucceeded: true,
      hfPointsTotal: 400,
      hfPointsCleaned: 380,
      reconstructedEventCount: 6,
      providerError: false,
    },
    drivingImpact: {
      available: true,
      avgEngineLoad: 42,
      avgRpm: 2100,
      avgThrottlePosition: 28,
      abuseScore: 12,
      providerError: false,
    },
    misuse: {
      stageStatus: 'done',
      misuseCaseCount: 0,
      abuseEventCount: 1,
      possibleImpactCount: 0,
    },
    counters: {
      harshBrakeCount: 2,
      hardBrakingEvents: 1,
      brakingEventCount: 5,
      harshCornerCount: 1,
      corneringEvents: 3,
      coldEngineAbuseCount: 0,
      kickdownCount: 0,
      abuseEvents: 1,
    },
    attribution: {
      assignmentStatus: 'ASSIGNED_BOOKING',
      assignmentSubjectType: 'BOOKING_CUSTOMER',
      assignmentSubjectId: 'customer-1',
      isPrivateTrip: false,
    },
    tripMetrics: {
      distanceKm: 18.4,
      durationMinutes: 45,
    },
    capabilities: {
      capabilityVersion: 'cap-probe-v1',
      coverage: 0.9,
      effectiveCadenceMs: 5000,
      p95CadenceMs: 8000,
      nativeBehaviorSupported: true,
      hfCadenceSufficient: true,
      routeSupported: true,
    },
    ...overrides,
  };
}

function statusByDimension(result: ReturnType<typeof evaluateTripAssessability>) {
  return Object.fromEntries(result.dimensions.map((d) => [d.dimension, d.status]));
}

describe('evaluateTripAssessability', () => {
  it('emits all eleven dimensions with policy metadata', () => {
    const result = evaluateTripAssessability(baseInput());
    expect(result.policyVersion).toBe(TRIP_ASSESSABILITY_POLICY_VERSION);
    expect(result.dimensions).toHaveLength(TRIP_ASSESSABILITY_DIMENSIONS.length);
    expect(result.dimensions.map((d) => d.dimension)).toEqual([...TRIP_ASSESSABILITY_DIMENSIONS]);
    for (const row of result.dimensions) {
      expect(row.calculatedAt).toEqual(new Date('2026-07-16T09:00:00Z'));
      expect(row.policyVersion).toBe(TRIP_ASSESSABILITY_POLICY_VERSION);
      expect(row.capabilityVersion).toBe('cap-probe-v1');
      expect(row.inputWindowStart).toEqual(new Date('2026-07-16T08:00:00Z'));
      expect(row.inputWindowEnd).toEqual(new Date('2026-07-16T08:45:00Z'));
    }
  });

  it('mixed dimensions: route assessable, native limited, conduct limited (no calm inference)', () => {
    const result = evaluateTripAssessability(
      baseInput({
        behavior: {
          enrichmentStatus: 'COMPLETED',
          nativeEventCount: 0,
          nativeQuerySucceeded: true,
          hfPointsTotal: 400,
          hfPointsCleaned: 380,
          reconstructedEventCount: 2,
          providerError: false,
        },
      }),
    );
    const statuses = statusByDimension(result);
    expect(statuses.ROUTE).toBe('ASSESSABLE');
    expect(statuses.NATIVE_BEHAVIOR).toBe('LIMITED');
    expect(statuses.DRIVER_CONDUCT).toBe('LIMITED');

    const native = result.dimensions.find((d) => d.dimension === 'NATIVE_BEHAVIOR');
    const conduct = result.dimensions.find((d) => d.dimension === 'DRIVER_CONDUCT');
    expect(native?.reasons).toContain('NO_NATIVE_EVENTS');
    expect(conduct?.reasons).toContain('NO_NATIVE_EVENTS');
    expect(conduct?.reasons).toContain('CONDUCT_REQUIRES_BEHAVIOR_GATE');
  });

  it('distance/duration alone does not make behavior or load dimensions assessable', () => {
    const result = evaluateTripAssessability(
      baseInput({
        route: {
          enrichmentStatus: 'SKIPPED',
          waypointCount: 0,
          coverage: null,
          effectiveCadenceMs: null,
          p95CadenceMs: null,
          providerError: false,
        },
        behavior: {
          enrichmentStatus: 'SKIPPED_NO_HF_DATA',
          nativeEventCount: 0,
          nativeQuerySucceeded: null,
          hfPointsTotal: 0,
          hfPointsCleaned: 0,
          reconstructedEventCount: 0,
          providerError: false,
        },
        drivingImpact: {
          available: false,
          avgEngineLoad: null,
          avgRpm: null,
          avgThrottlePosition: null,
          abuseScore: null,
          providerError: false,
        },
        counters: {
          harshBrakeCount: 0,
          hardBrakingEvents: 0,
          brakingEventCount: 0,
          harshCornerCount: 0,
          corneringEvents: 0,
          coldEngineAbuseCount: 0,
          kickdownCount: 0,
          abuseEvents: 0,
        },
        tripMetrics: { distanceKm: 12, durationMinutes: 20 },
        capabilities: null,
      }),
    );
    const statuses = statusByDimension(result);
    expect(statuses.ROUTE).toBe('INSUFFICIENT_DATA');
    expect(statuses.VEHICLE_LOAD).toBe('INSUFFICIENT_DATA');
    expect(statuses.NATIVE_BEHAVIOR).toBe('INSUFFICIENT_DATA');
    expect(statuses.RECONSTRUCTED_BEHAVIOR).toBe('INSUFFICIENT_DATA');
    expect(statuses.DRIVER_CONDUCT).toBe('INSUFFICIENT_DATA');

    const route = result.dimensions.find((d) => d.dimension === 'ROUTE');
    expect(route?.reasons).toContain('DISTANCE_DURATION_ONLY');
  });

  it('private trip attribution is NOT_APPLICABLE', () => {
    const result = evaluateTripAssessability(
      baseInput({
        attribution: {
          assignmentStatus: null,
          assignmentSubjectType: null,
          assignmentSubjectId: null,
          isPrivateTrip: true,
        },
      }),
    );
    const attribution = result.dimensions.find((d) => d.dimension === 'ATTRIBUTION');
    expect(attribution?.status).toBe('NOT_APPLICABLE');
    expect(attribution?.reasons).toContain('PRIVATE_TRIP_ATTRIBUTION');
  });

  it('route provider error maps to PROVIDER_ERROR with cadence/coverage preserved', () => {
    const result = evaluateTripAssessability(
      baseInput({
        route: {
          enrichmentStatus: 'FAILED',
          waypointCount: 0,
          coverage: 0.1,
          effectiveCadenceMs: 12000,
          p95CadenceMs: 18000,
          providerError: true,
        },
      }),
    );
    const route = result.dimensions.find((d) => d.dimension === 'ROUTE');
    expect(route?.status).toBe('PROVIDER_ERROR');
    expect(route?.reasons).toContain('PROVIDER_ERROR');
    expect(route?.coverage).toBe(0.1);
    expect(route?.effectiveCadenceMs).toBe(12000);
    expect(route?.p95CadenceMs).toBe(18000);
  });
});
