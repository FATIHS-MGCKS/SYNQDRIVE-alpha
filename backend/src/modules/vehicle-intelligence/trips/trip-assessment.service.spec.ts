import { assessTrip, deriveTripAssessmentHasEnoughData } from './trip-assessment.service';
import type { TripAssessmentEventInput, TripAssessmentInput } from './trip-assessment.types';

function baseInput(overrides: Partial<TripAssessmentInput> = {}): TripAssessmentInput {
  return {
    unifiedEvents: [],
    drivingStressScore: null,
    drivingStressLevel: null,
    misuseCaseCount: 0,
    hasEnoughData: true,
    distanceKm: 12,
    durationMinutes: 18,
    nativeEventCount: 0,
    reconstructedEventCount: 0,
    ...overrides,
  };
}

function event(
  partial: Partial<TripAssessmentEventInput> & Pick<TripAssessmentEventInput, 'eventCategory' | 'classification'>,
): TripAssessmentEventInput {
  return {
    eventType: partial.eventType ?? 'HARSH_ACCELERATION',
    provenance: partial.provenance ?? 'NATIVE',
    abuseRelevant: partial.abuseRelevant ?? false,
    ...partial,
  };
}

describe('assessTrip', () => {
  it('returns UNAUFFAELLIG for clean trip with enough data and low stress', () => {
    const result = assessTrip(
      baseInput({
        drivingStressScore: 18,
        drivingStressLevel: 'low',
        hasEnoughData: true,
      }),
    );

    expect(result.status).toBe('UNAUFFAELLIG');
    expect(result.label).toBe('Unauffällig');
    expect(result.signals.hasEnoughData).toBe(true);
  });

  it('returns BEOBACHTEN for moderate stress without events', () => {
    const result = assessTrip(
      baseInput({
        drivingStressScore: 42,
        drivingStressLevel: 'moderate',
      }),
    );

    expect(result.status).toBe('BEOBACHTEN');
    expect(result.status).not.toBe('PRUEFHINWEIS');
  });

  it('returns AUFFAELLIG for two hard accelerations without abuse relevance', () => {
    const result = assessTrip(
      baseInput({
        unifiedEvents: [
          event({ eventCategory: 'ACCELERATION', classification: 'HARD', eventType: 'HARSH_ACCELERATION' }),
          event({ eventCategory: 'ACCELERATION', classification: 'HARD', eventType: 'HARSH_ACCELERATION' }),
        ],
        nativeEventCount: 2,
      }),
    );

    expect(result.status).toBe('AUFFAELLIG');
    expect(result.status).not.toBe('PRUEFHINWEIS');
    expect(result.primaryReason).toContain('Beschleunigung');
  });

  it('returns PRUEFHINWEIS for native extreme braking with abuse relevance', () => {
    const result = assessTrip(
      baseInput({
        unifiedEvents: [
          event({
            eventCategory: 'BRAKING',
            classification: 'EXTREME',
            eventType: 'EXTREME_BRAKING',
            abuseRelevant: true,
          }),
        ],
        nativeEventCount: 1,
      }),
    );

    expect(['PRUEFHINWEIS', 'KRITISCH']).toContain(result.status);
    expect(result.primaryReason.toLowerCase()).toMatch(/extrem|prüfung|vorwurf/i);
  });

  it('returns PRUEFHINWEIS for HF abuse kickdown without proven damage claim', () => {
    const result = assessTrip(
      baseInput({
        unifiedEvents: [
          event({
            eventCategory: 'ABUSE',
            classification: 'SEVERE',
            eventType: 'KICKDOWN',
            provenance: 'RECONSTRUCTED',
            abuseRelevant: true,
          }),
        ],
        reconstructedEventCount: 1,
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.label).toBe('Prüfhinweis');
    expect(result.primaryReason).toContain('kein automatisierter Vorwurf');
  });

  it('returns PRUEFHINWEIS for HF high-rpm constant abuse event', () => {
    const result = assessTrip(
      baseInput({
        unifiedEvents: [
          event({
            eventCategory: 'ABUSE',
            classification: 'WARNING',
            eventType: 'HIGH_RPM_CONSTANT',
            provenance: 'RECONSTRUCTED',
            abuseRelevant: true,
          }),
        ],
        reconstructedEventCount: 1,
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
  });

  it('returns KRITISCH for critical driving stress without stronger evidence tier', () => {
    const result = assessTrip(
      baseInput({
        drivingStressScore: 88,
        drivingStressLevel: 'critical',
      }),
    );

    expect(result.status).toBe('KRITISCH');
    expect(result.label).toBe('Kritisch');
    expect(result.source).toBe('STRESS_ONLY');
  });

  it('returns NICHT_BEWERTBAR when no sufficient data is available', () => {
    const result = assessTrip(
      baseInput({
        hasEnoughData: false,
        distanceKm: 0.1,
        durationMinutes: 0.5,
        unifiedEvents: [],
        nativeEventCount: 0,
        reconstructedEventCount: 0,
      }),
    );

    expect(result.status).toBe('NICHT_BEWERTBAR');
    expect(result.label).toBe('Nicht bewertbar');
    expect(result.source).toBe('NO_DATA');
    expect(result.confidence).toBe('LOW');
  });

  it('prefers PRUEFHINWEIS over KRITISCH when misuse cases exist', () => {
    const result = assessTrip(
      baseInput({
        misuseCaseCount: 1,
        maxEvidenceLevel: 'CHECK_RECOMMENDED',
        drivingStressScore: 90,
        drivingStressLevel: 'critical',
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
  });

  it('returns KRITISCH for CRITICAL_DAMAGE_RISK evidence level', () => {
    const result = assessTrip(
      baseInput({
        misuseCaseCount: 1,
        maxEvidenceLevel: 'CRITICAL_DAMAGE_RISK',
      }),
    );

    expect(result.status).toBe('KRITISCH');
    expect(result.signals.maxEvidenceLevel).toBe('CRITICAL_DAMAGE_RISK');
  });

  it('returns PRUEFHINWEIS for DAMAGE_RISK evidence without claiming damage proof', () => {
    const result = assessTrip(
      baseInput({
        misuseCaseCount: 1,
        maxEvidenceLevel: 'DAMAGE_RISK',
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.primaryReason).toMatch(/kein automatisierter Schadensnachweis/i);
  });

  it('is versioned', () => {
    expect(assessTrip(baseInput()).version).toBe('1.1.0');
  });
});

describe('deriveTripAssessmentHasEnoughData', () => {
  it('is false for not assessable trips without signals', () => {
    expect(
      deriveTripAssessmentHasEnoughData({
        distanceKm: 0.2,
        durationMinutes: 1,
        unifiedEventCount: 0,
        nativeEventCount: 0,
        drivingStressScore: null,
        analysisAssessability: 'NOT_ASSESSABLE',
      }),
    ).toBe(false);
  });

  it('is true when native events exist', () => {
    expect(
      deriveTripAssessmentHasEnoughData({
        distanceKm: 0.2,
        durationMinutes: 1,
        unifiedEventCount: 1,
        nativeEventCount: 1,
        drivingStressScore: null,
        analysisAssessability: 'LIMITED',
      }),
    ).toBe(true);
  });
});
