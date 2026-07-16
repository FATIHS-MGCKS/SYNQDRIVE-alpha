import { assessTrip } from './trip-assessment.service';
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

describe('TripAssessment reasonCategory (PRUEFHINWEIS disambiguation)', () => {
  it('assigns DATA_QUALITY_REVIEW for degraded device quality cap', () => {
    const result = assessTrip(
      baseInput({
        deviceQualityDegraded: true,
        unifiedEvents: [
          event({ eventCategory: 'ACCELERATION', classification: 'HARD', eventType: 'HARSH_ACCELERATION' }),
          event({ eventCategory: 'ACCELERATION', classification: 'HARD', eventType: 'HARSH_ACCELERATION' }),
        ],
        nativeEventCount: 2,
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.reasonCategory).toBe('DATA_QUALITY_REVIEW');
    expect(result.primaryReason).toMatch(/Datenqualität/i);
    expect(result.primaryReason).not.toMatch(/Fahrverhalten|Fahrmuster/i);
  });

  it('assigns DRIVER_CONDUCT_REVIEW for native extreme braking', () => {
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

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.reasonCategory).toBe('DRIVER_CONDUCT_REVIEW');
    expect(result.primaryReason).toMatch(/Fahrverhalten|Extrembrems/i);
  });

  it('assigns VEHICLE_LOAD_REVIEW when elevated load review is flagged', () => {
    const result = assessTrip(
      baseInput({
        drivingStressScore: 82,
        drivingStressLevel: 'critical',
        vehicleLoadNeedsReview: true,
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.reasonCategory).toBe('VEHICLE_LOAD_REVIEW');
    expect(result.primaryReason).toMatch(/Fahrzeugbelastung/i);
    expect(result.primaryReason).not.toMatch(/Fahrverhalten|Fahrer/i);
  });

  it('assigns MISUSE_REVIEW for misuse cases', () => {
    const result = assessTrip(
      baseInput({
        misuseCaseCount: 1,
        maxEvidenceLevel: 'CHECK_RECOMMENDED',
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.reasonCategory).toBe('MISUSE_REVIEW');
    expect(result.primaryReason).toMatch(/Missbrauch/i);
  });

  it('assigns MISUSE_REVIEW for HF abuse events', () => {
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
    expect(result.reasonCategory).toBe('MISUSE_REVIEW');
  });

  it('assigns DAMAGE_INSPECTION for DAMAGE_RISK evidence', () => {
    const result = assessTrip(
      baseInput({
        misuseCaseCount: 1,
        maxEvidenceLevel: 'DAMAGE_RISK',
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.reasonCategory).toBe('DAMAGE_INSPECTION');
    expect(result.primaryReason).toMatch(/Schaden/i);
  });

  it('assigns ATTRIBUTION_REVIEW when attribution is uncertain', () => {
    const result = assessTrip(
      baseInput({
        attributionNeedsReview: true,
      }),
    );

    expect(result.status).toBe('PRUEFHINWEIS');
    expect(result.reasonCategory).toBe('ATTRIBUTION_REVIEW');
    expect(result.primaryReason).toMatch(/Zuordnung/i);
    expect(result.primaryReason).not.toMatch(/Fahrverhalten/i);
  });

  it('returns null reasonCategory for non-PRUEFHINWEIS statuses', () => {
    const result = assessTrip(
      baseInput({
        unifiedEvents: [
          event({ eventCategory: 'ACCELERATION', classification: 'HARD' }),
          event({ eventCategory: 'ACCELERATION', classification: 'HARD', eventType: 'HARSH_ACCELERATION' }),
        ],
        nativeEventCount: 2,
      }),
    );

    expect(result.status).toBe('AUFFAELLIG');
    expect(result.reasonCategory).toBeNull();
  });

  it('prefers DATA_QUALITY_REVIEW over conduct events when device is degraded', () => {
    const result = assessTrip(
      baseInput({
        deviceQualityDegraded: true,
        misuseCaseCount: 2,
        maxEvidenceLevel: 'MISUSE_SUSPECTED',
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

    expect(result.reasonCategory).toBe('DATA_QUALITY_REVIEW');
  });
});
