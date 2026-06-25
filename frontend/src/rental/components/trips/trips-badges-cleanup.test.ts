import { describe, expect, it } from 'vitest';
import { deriveOperationalChips } from './timeline.utils';
import { eventTypeLabel, eventExplanation, formatEventEvidence } from './behavior-ui.utils';
import { needsAssignmentReview } from './utils/tripRentalContext';
import type { TripTimelineTrip, TripBehaviorEvent } from './timeline.types';

function makeTrip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 'trip-1',
    vehicleId: 'veh-1',
    tripStatus: 'COMPLETED',
    startTime: '2026-02-27T08:00:00.000Z',
    endTime: '2026-02-27T08:30:00.000Z',
    distanceKm: 12.4,
    durationMinutes: 30,
    stressLevel: 'low',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TripBehaviorEvent> = {}): TripBehaviorEvent {
  return {
    id: 'ev-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    eventCategory: 'ABUSE',
    eventType: 'COLD_ENGINE_HIGH_RPM',
    classification: 'SEVERE',
    startedAt: '2026-02-27T08:05:00.000Z',
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
    ...overrides,
  };
}

describe('collapsed trip card chips', () => {
  it('shows "Privat" but never "Nicht zugewiesen"/"Zuordnung prüfen" for a private trip', () => {
    const chips = deriveOperationalChips(
      makeTrip({ isPrivateTrip: true, assignmentStatus: 'PRIVATE_UNASSIGNED' }),
    );
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Privat');
    expect(labels).not.toContain('Nicht zugewiesen');
    expect(labels).not.toContain('Zuordnung prüfen');
    expect(labels).toContain('Unauffällig');
    expect(needsAssignmentReview(makeTrip({ isPrivateTrip: true, assignmentStatus: 'PRIVATE_UNASSIGNED' }), null).needsReview).toBe(false);
  });

  it('shows rating + suspicion + Privat (max 3) for a private misuse trip, no HF/route/debug chips', () => {
    const chips = deriveOperationalChips(
      makeTrip({ isPrivateTrip: true, abuseEventCount: 2, behaviorReady: true }),
    );
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Auffällige Fahrt');
    expect(labels).toContain('Missbrauchsverdacht');
    expect(labels).toContain('Privat');
    expect(labels).not.toContain('HF verfügbar');
    expect(labels.some((l) => l.startsWith('Route'))).toBe(false);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it('marks an unremarkable trip as "Unauffällig" with at most one assignment chip', () => {
    const chips = deriveOperationalChips(
      makeTrip({ assignmentStatus: 'ASSIGNED_BOOKING_CUSTOMER', assignedBookingId: 'bk-1' }),
    );
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Unauffällig');
    expect(labels).toContain('Buchung verknüpft');
    expect(chips.length).toBeLessThanOrEqual(3);
  });
});

describe('behavior event labels & evidence', () => {
  it('labels cold-engine abuse concretely', () => {
    expect(eventTypeLabel(makeEvent({ eventType: 'COLD_ENGINE_HIGH_RPM' }))).toBe(
      'Kaltmotor-Missbrauch',
    );
    expect(eventExplanation(makeEvent({ eventType: 'COLD_ENGINE_HIGH_RPM' }))).toBe(
      'Hohe Drehzahl bei kaltem Motor erkannt.',
    );
  });

  it('renders only present evidence metrics, never fabricated values', () => {
    const evidence = formatEventEvidence(
      makeEvent({ maxEngineRpm: 4200, maxThrottlePos: 95, maxCoolantTemp: 40 }),
    );
    const map = Object.fromEntries(evidence.map((e) => [e.label, e.value]));
    expect(map['Drehzahl']).toBe('4200 rpm');
    expect(map['Gaspedal']).toBe('95 %');
    expect(map['Kühlmittel']).toBe('40 °C');
    expect('Dauer' in map).toBe(false);
  });

  it('returns no evidence items when no metrics are present', () => {
    expect(formatEventEvidence(makeEvent())).toEqual([]);
  });
});
