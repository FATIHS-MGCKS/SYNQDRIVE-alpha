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
  it('uses neutral Prüfhinweise section title', () => {
    expect(RENTAL_COPY.misuseSectionTitle).toBe('Prüfhinweise');
  });

  it('provides a calm empty state for the review hints section', () => {
    expect(RENTAL_COPY.misuseEmptyTitle).toBe('Keine Prüfhinweise');
    expect(RENTAL_COPY.misuseEmptySubline).toBe(
      'Für diese Fahrt liegen keine Prüfhinweise vor.',
    );
  });

  it('uses Gesamtbewertung and Fahrverhalten labels in Trip Analyse', () => {
    expect(RENTAL_COPY.evidenceOverallRating).toBe('Gesamtbewertung');
    expect(RENTAL_COPY.evidenceDrivingStyle).toBe('Fahrverhalten');
  });

  it('no longer exposes the "Chronologische Ansicht" eyebrow', () => {
    const values = Object.values(TIMELINE_COPY).filter((v) => typeof v === 'string') as string[];
    expect(values).not.toContain('Chronologische Ansicht');
    expect('listEyebrow' in TIMELINE_COPY).toBe(false);
  });

  it('renames the evidence overview to Trip Analyse', () => {
    expect(RENTAL_COPY.tripAnalysisTitle).toBe('Trip Analyse');
    expect(RENTAL_COPY.evidenceSummaryTitle).toBe('Trip Analyse');
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
