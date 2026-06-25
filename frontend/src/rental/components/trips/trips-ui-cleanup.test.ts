import { describe, expect, it } from 'vitest';
import { RENTAL_COPY, TIMELINE_COPY } from './trips-view-ui';
import { buildInstantLine } from './timeline.utils';
import type { TripTimelineTrip } from './timeline.types';

function makeTrip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 'trip-1',
    vehicleId: 'veh-1',
    tripStatus: 'COMPLETED',
    startTime: '2026-02-27T08:00:00.000Z',
    endTime: '2026-02-27T08:30:00.000Z',
    distanceKm: 12.4,
    durationMinutes: 30,
    ...overrides,
  };
}

describe('Trips UI cleanup', () => {
  it('renames the misuse section to "Missbrauchs-/Schadensverdacht"', () => {
    expect(RENTAL_COPY.misuseSectionTitle).toBe('Missbrauchs-/Schadensverdacht');
  });

  it('provides a calm positive empty state for the misuse section', () => {
    expect(RENTAL_COPY.misuseEmptyTitle).toBe('Unauffällige Fahrt');
    expect(RENTAL_COPY.misuseEmptySubline).toBe(
      'Keine Hinweise auf Missbrauch oder Schaden für diese Fahrt.',
    );
  });

  it('no longer exposes the "Chronologische Ansicht" eyebrow', () => {
    const values = Object.values(TIMELINE_COPY).filter((v) => typeof v === 'string') as string[];
    expect(values).not.toContain('Chronologische Ansicht');
    expect('listEyebrow' in TIMELINE_COPY).toBe(false);
  });

  it('includes Start and Ziel in the evidence overview', () => {
    expect(RENTAL_COPY.evidenceStart).toBe('Start');
    expect(RENTAL_COPY.evidenceDestination).toBe('Ziel');
  });

  it('drops the separate route-quality and technical sections from the copy', () => {
    expect('sectionRouteQuality' in TIMELINE_COPY).toBe(false);
    expect('sectionTechnical' in TIMELINE_COPY).toBe(false);
    expect('sectionRental' in TIMELINE_COPY).toBe(false);
    expect('sectionOverview' in TIMELINE_COPY).toBe(false);
  });

  it('does not surface an (implausible) aggregate max speed in the card line', () => {
    const line = buildInstantLine(makeTrip({ maxSpeedKmh: 3, avgSpeedKmh: 2 }));
    expect(line).not.toContain('km/h');
    expect(line).not.toContain('Max');
    // distance + duration only
    expect(line).toContain('·');
  });
});
