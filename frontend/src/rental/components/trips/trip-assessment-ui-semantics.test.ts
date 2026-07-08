import { describe, expect, it } from 'vitest';
import {
  deriveDrivingBehaviorLabel,
  deriveReviewHintSummary,
  EVIDENCE_LEVEL_LABEL,
  GESAMTBEWERTUNG_FALLBACK_LABEL,
  resolveGesamtbewertungDisplay,
  TRIP_ASSESSMENT_STATUS_LABEL,
} from './behavior-ui.utils';
import type { TripBehaviorEvent, TripTimelineTrip } from './trips.types';

function trip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 't1',
    vehicleId: 'v1',
    tripStatus: 'COMPLETED',
    startTime: '2026-07-07T10:00:00Z',
    ...overrides,
  };
}

function event(partial: Partial<TripBehaviorEvent> & Pick<TripBehaviorEvent, 'eventCategory' | 'classification'>): TripBehaviorEvent {
  return {
    id: 'e1',
    vehicleId: 'v1',
    tripId: 't1',
    eventType: 'HARSH_ACCELERATION',
    startedAt: '2026-07-07T10:05:00Z',
    provenance: 'NATIVE',
    abuseRelevant: false,
    ...partial,
  } as TripBehaviorEvent;
}

describe('trip assessment UI semantics (Phase 2)', () => {
  it('maps backend assessment statuses to Gesamtbewertung labels', () => {
    expect(TRIP_ASSESSMENT_STATUS_LABEL.AUFFAELLIG).toBe('Auffällig');
    expect(TRIP_ASSESSMENT_STATUS_LABEL.PRUEFHINWEIS).toBe('Prüfhinweis');
  });

  it('prefers backend tripAssessment for Gesamtbewertung', () => {
    const display = resolveGesamtbewertungDisplay(
      trip({
        tripAssessment: {
          status: 'AUFFAELLIG',
          label: 'Auffällig',
          primaryReason: '2 starke Beschleunigungsereignisse erkannt.',
          confidence: 'HIGH',
          source: 'NATIVE_EVENTS',
          version: '1.0.0',
          signals: {
            behaviorEvents: 2,
            abuseRelevantEvents: 0,
            misuseCases: 0,
            maxEvidenceLevel: null,
            drivingStressScore: 30,
            drivingStressLevel: 'moderate',
            hasEnoughData: true,
          },
        },
      }),
      [],
    );

    expect(display.fromBackend).toBe(true);
    expect(display.label).toBe('Auffällig');
    expect(display.primaryReason).toContain('Beschleunigung');
  });

  it('falls back to legacy Gesamtbewertung labels when tripAssessment is missing', () => {
    const display = resolveGesamtbewertungDisplay(trip(), [], { assessable: true });
    expect(display.fromBackend).toBe(false);
    expect(display.label).toBe(GESAMTBEWERTUNG_FALLBACK_LABEL.unremarkable);
  });

  it('separates Fahrverhalten from Gesamtbewertung for hard acceleration', () => {
    const events = [
      event({ eventCategory: 'ACCELERATION', classification: 'HARD' }),
      event({ id: 'e2', eventCategory: 'ACCELERATION', classification: 'HARD' }),
    ];
    expect(deriveDrivingBehaviorLabel(events)).toBe('Auffälliges Fahrverhalten');
    expect(deriveReviewHintSummary(trip(), events)).toBeNull();
  });

  it('surfaces Prüfhinweise without claiming misuse for abuse-relevant events', () => {
    const events = [event({ eventCategory: 'ABUSE', classification: 'SEVERE', abuseRelevant: true })];
    expect(deriveReviewHintSummary(trip(), events)).toBe('Prüfung empfohlen');
  });

  it('maps evidence levels to operator-facing badges (Phase 3)', () => {
    expect(EVIDENCE_LEVEL_LABEL.CHECK_RECOMMENDED).toBe('Prüfung empfohlen');
    expect(EVIDENCE_LEVEL_LABEL.MISUSE_SUSPECTED).toBe('Verdacht');
    expect(EVIDENCE_LEVEL_LABEL.DAMAGE_RISK).toBe('Technisches Risiko');
    expect(EVIDENCE_LEVEL_LABEL.CRITICAL_DAMAGE_RISK).toBe('Kritisch');
  });
});
