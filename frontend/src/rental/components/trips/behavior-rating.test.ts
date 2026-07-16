import { describe, expect, it } from 'vitest';
import { deriveBehaviorOverallStatus } from './behavior-ui.utils';
import type { TripTimelineTrip } from './timeline.types';
import type { TripBehaviorEvent } from '../../../lib/api';

function trip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 't1',
    vehicleId: 'v1',
    tripStatus: 'COMPLETED',
    startTime: '2026-06-01T10:00:00Z',
    ...overrides,
  } as TripTimelineTrip;
}

const noEvents: TripBehaviorEvent[] = [];

describe('deriveBehaviorOverallStatus — assessability gate', () => {
  it('returns not_assessable for a trip without conduct events', () => {
    expect(
      deriveBehaviorOverallStatus(trip(), noEvents, { assessable: true }),
    ).toBe('not_assessable');
  });

  it('returns "not_assessable" for a clean trip with insufficient data', () => {
    expect(
      deriveBehaviorOverallStatus(trip(), noEvents, { assessable: false }),
    ).toBe('not_assessable');
  });

  it('never downgrades an abuse trip to not_assessable', () => {
    expect(
      deriveBehaviorOverallStatus(trip({ abuseEvents: 2 }), noEvents, {
        assessable: false,
      }),
    ).toBe('abuse_suspect');
  });

  it('defaults to not_assessable when no conduct events are present', () => {
    expect(deriveBehaviorOverallStatus(trip(), noEvents)).toBe('not_assessable');
  });

  it('does not return not_assessable when behavior events are loaded', () => {
    const native: TripBehaviorEvent = {
      id: 'e1',
      organizationId: 'o1',
      vehicleId: 'v1',
      tripId: 't1',
      eventCategory: 'ACCELERATION',
      eventType: 'HARSH_ACCELERATION',
      classification: 'MODERATE',
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
    };
    expect(
      deriveBehaviorOverallStatus(trip(), [native], { assessable: false }),
    ).toBe('watch');
  });
});
