import { describe, expect, it } from 'vitest';
import type { TripBehaviorEvent } from '../../../lib/api';
import { deriveBehaviorOverallStatus } from './behavior-ui.utils';
import type { TripTimelineTrip } from './timeline.types';
import {
  formatBehaviorEventCountLabel,
  getStressScoreMissingMessage,
  resolveBehaviorEventCount,
  STRESS_SCORE_MISSING_GENERIC,
  STRESS_SCORE_MISSING_WITH_NATIVE_EVENTS,
} from './trip-assessment-copy';

function trip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 't1',
    vehicleId: 'v1',
    tripStatus: 'COMPLETED',
    startTime: '2026-06-01T10:00:00Z',
    ...overrides,
  } as TripTimelineTrip;
}

function event(overrides: Partial<TripBehaviorEvent> = {}): TripBehaviorEvent {
  return {
    id: 'e1',
    organizationId: 'o1',
    vehicleId: 'v1',
    tripId: 't1',
    eventCategory: 'ACCELERATION',
    eventType: 'HARSH_ACCELERATION',
    classification: 'HARD',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: null,
    durationMs: null,
    startSpeedKmh: null,
    endSpeedKmh: null,
    peakValue: null,
    peakValueUnit: null,
    peakG: null,
    maxThrottlePos: null,
    maxEngineRpm: null,
    maxCoolantTemp: null,
    latitude: null,
    longitude: null,
    metadataJson: {},
    provenance: 'NATIVE',
    ...overrides,
  };
}

describe('getStressScoreMissingMessage', () => {
  it('uses native-specific copy when native behavior events exist', () => {
    expect(
      getStressScoreMissingMessage({
        hasNativeBehaviorEvents: true,
        behaviorEventCount: 39,
      }),
    ).toBe(STRESS_SCORE_MISSING_WITH_NATIVE_EVENTS);
  });

  it('uses generic copy when no stress score and no behavior events', () => {
    expect(getStressScoreMissingMessage({ behaviorEventCount: 0 })).toBe(
      STRESS_SCORE_MISSING_GENERIC,
    );
  });

  it('uses behavior-events copy for reconstructed events without native provenance', () => {
    expect(
      getStressScoreMissingMessage({
        behaviorEventCount: 5,
        hasNativeBehaviorEvents: false,
      }),
    ).toContain('Fahrverhalten wird über erkannte Fahrereignisse bewertet');
  });
});

describe('formatBehaviorEventCountLabel', () => {
  it('labels native events separately from Fahrbelastung', () => {
    const events = Array.from({ length: 39 }, (_, i) =>
      event({ id: `e-${i}`, provenance: 'NATIVE' }),
    );
    expect(formatBehaviorEventCountLabel(events, trip())).toBe(
      '39 erkannte native Fahrereignisse',
    );
  });

  it('prefers loaded event list count over trip KPI counters', () => {
    expect(
      resolveBehaviorEventCount(
        [event(), event({ id: 'e2' })],
        trip({
          totalAccelerationEvents: 99,
          totalBrakingEvents: 0,
          abuseEvents: 0,
          behaviorReady: true,
        }),
      ),
    ).toBe(2);
  });
});

describe('deriveBehaviorOverallStatus — Fahrbelastung vs Fahrverhalten', () => {
  it('returns not_assessable only without events and insufficient data', () => {
    expect(deriveBehaviorOverallStatus(trip(), [], { assessable: false })).toBe(
      'not_assessable',
    );
  });

  it('returns not_assessable without conduct events even when data is sufficient', () => {
    expect(deriveBehaviorOverallStatus(trip(), [], { assessable: true })).toBe(
      'not_assessable',
    );
  });

  it('does not infer notable Fahrverhalten from high vehicle stress alone', () => {
    expect(
      deriveBehaviorOverallStatus(
        trip({ drivingStressScore: 88, stressLevel: 'critical' }),
        [],
        { assessable: true },
      ),
    ).toBe('not_assessable');
  });

  it('does not infer unremarkable Fahrverhalten from low vehicle stress alone', () => {
    expect(
      deriveBehaviorOverallStatus(
        trip({ drivingStressScore: 18, stressLevel: 'low' }),
        [],
        { assessable: true },
      ),
    ).toBe('not_assessable');
  });

  it('returns notable when native behavior events are present', () => {
    expect(
      deriveBehaviorOverallStatus(
        trip({ drivingStressScore: null }),
        [event({ classification: 'HARD' })],
        { assessable: true },
      ),
    ).toBe('notable');
  });
});
