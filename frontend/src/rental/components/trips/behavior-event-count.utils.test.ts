import { describe, expect, it } from 'vitest';
import type { TripBehaviorEvent } from '../../../lib/api';
import type { TripTimelineTrip } from './trips.types';
import {
  countVisibleBehaviorEvents,
  resolveNotableEventCount,
} from './behavior-event-count.utils';

function trip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 't1',
    vehicleId: 'v1',
    tripStatus: 'COMPLETED',
    startTime: '2026-06-01T10:00:00Z',
    behaviorReady: true,
    totalAccelerationEvents: 10,
    totalBrakingEvents: 20,
    abuseEvents: 9,
    ...overrides,
  } as TripTimelineTrip;
}

function event(id: string): TripBehaviorEvent {
  return {
    id,
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
  };
}

describe('resolveNotableEventCount', () => {
  it('uses deduped list length when behavior events are loaded', () => {
    const events = [event('e1'), event('e2')];
    expect(resolveNotableEventCount(trip(), events, true)).toBe(2);
  });

  it('returns zero when loaded list is empty', () => {
    expect(resolveNotableEventCount(trip(), [], true)).toBe(0);
  });

  it('falls back to trip KPI counters when events are not loaded', () => {
    expect(resolveNotableEventCount(trip(), undefined, false)).toBe(39);
  });

  it('day summary sums visible deduped rows per trip', () => {
    const byTrip: Record<string, TripBehaviorEvent[]> = {
      t1: [event('e1')],
      t2: [event('e2'), event('e3')],
    };
    const total =
      resolveNotableEventCount(trip({ id: 't1' }), byTrip.t1, true)! +
      resolveNotableEventCount(trip({ id: 't2' }), byTrip.t2, true)!;
    expect(total).toBe(3);
    expect(countVisibleBehaviorEvents(byTrip.t1)).toBe(1);
  });
});
