import { describe, expect, it } from 'vitest';
import { computeDayTripNumbers } from './utils/trip-day-numbering';
import {
  deriveTripOverallRating,
  TRIP_OVERALL_RATING_LABEL,
} from './utils/trip-overall-status';
import {
  countBehaviorEventsByCategory,
  eventMatchesCategoryFilter,
  isCorneringEvent,
} from './behavior-category.utils';
import type { TripTimelineItem, TripTimelineTrip, TripBehaviorEvent } from './timeline.types';

function makeTrip(id: string, startTime: string, overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id,
    vehicleId: 'veh-1',
    tripStatus: 'COMPLETED',
    startTime,
    endTime: startTime,
    distanceKm: 10,
    durationMinutes: 30,
    ...overrides,
  };
}

describe('trip day numbering', () => {
  it('numbers trips chronologically per day regardless of display order', () => {
    const items: TripTimelineItem[] = [
      { itemType: 'trip', id: 't3', startTime: '2026-06-29T21:36:00.000Z', trip: makeTrip('t3', '2026-06-29T21:36:00.000Z') },
      { itemType: 'trip', id: 't1', startTime: '2026-06-29T08:00:00.000Z', trip: makeTrip('t1', '2026-06-29T08:00:00.000Z') },
      { itemType: 'trip', id: 't2', startTime: '2026-06-29T12:00:00.000Z', trip: makeTrip('t2', '2026-06-29T12:00:00.000Z') },
    ];

    const numbers = computeDayTripNumbers(items);
    expect(numbers.get('t1')).toBe(1);
    expect(numbers.get('t2')).toBe(2);
    expect(numbers.get('t3')).toBe(3);
  });
});

describe('trip overall rating UI mapping', () => {
  it('prioritizes Auffällig over Beobachten', () => {
    const trip = makeTrip('t1', '2026-06-29T08:00:00.000Z', {
      stressLevel: 'moderate',
      abuseEventCount: 1,
    });
    expect(TRIP_OVERALL_RATING_LABEL[deriveTripOverallRating(trip)]).toBe('Auffällig');
  });

  it('maps moderate stress-only trips to Beobachten', () => {
    const trip = makeTrip('t1', '2026-06-29T08:00:00.000Z', {
      stressLevel: 'moderate',
      drivingStressScore: 40,
    });
    expect(TRIP_OVERALL_RATING_LABEL[deriveTripOverallRating(trip, [])]).toBe('Beobachten');
  });
});

describe('behavior category bars', () => {
  const baseEvent: TripBehaviorEvent = {
    id: 'ev-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 't1',
    eventCategory: 'ACCELERATION',
    eventType: 'HARSH_ACCELERATION',
    classification: 'HARD',
    startedAt: '2026-06-29T08:05:00.000Z',
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
    metadataJson: null,
  };

  it('counts cornering from event type', () => {
    expect(isCorneringEvent({ ...baseEvent, eventType: 'HARSH_CORNERING' })).toBe(true);
    const counts = countBehaviorEventsByCategory([
      baseEvent,
      { ...baseEvent, id: 'ev-2', eventCategory: 'BRAKING', eventType: 'HARSH_BRAKING' },
      { ...baseEvent, id: 'ev-3', eventType: 'HARSH_CORNERING', eventCategory: 'BRAKING' },
      { ...baseEvent, id: 'ev-4', eventCategory: 'ABUSE', eventType: 'COLD_ENGINE_HIGH_RPM' },
    ]);
    expect(counts.ACCELERATION).toBe(1);
    expect(counts.BRAKING).toBe(1);
    expect(counts.CORNERING).toBe(1);
    expect(counts.ABUSE).toBe(1);
  });

  it('filters by Kurvenfahrt category', () => {
    const corner = { ...baseEvent, eventType: 'HARSH_CORNERING' };
    expect(eventMatchesCategoryFilter(corner, 'CORNERING')).toBe(true);
    expect(eventMatchesCategoryFilter(baseEvent, 'CORNERING')).toBe(false);
  });
});
