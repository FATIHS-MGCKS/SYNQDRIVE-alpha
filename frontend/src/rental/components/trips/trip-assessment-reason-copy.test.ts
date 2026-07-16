import { describe, expect, it } from 'vitest';
import type { TripAssessmentReasonCategory } from '../../../lib/api';
import {
  formatTripAssessmentReviewHint,
  TRIP_ASSESSMENT_REASON_CATEGORY_LABEL,
} from './trip-assessment-reason-copy';

const ALL_CATEGORIES: TripAssessmentReasonCategory[] = [
  'DATA_QUALITY_REVIEW',
  'DRIVER_CONDUCT_REVIEW',
  'VEHICLE_LOAD_REVIEW',
  'MISUSE_REVIEW',
  'DAMAGE_INSPECTION',
  'ATTRIBUTION_REVIEW',
];

describe('trip-assessment-reason-copy', () => {
  it('defines a label for every reason category', () => {
    for (const category of ALL_CATEGORIES) {
      expect(TRIP_ASSESSMENT_REASON_CATEGORY_LABEL[category].length).toBeGreaterThan(5);
    }
  });

  it('prefixes review hints with the category label', () => {
    const hint = formatTripAssessmentReviewHint(
      'DATA_QUALITY_REVIEW',
      'Telematik unzuverlässig.',
    );
    expect(hint).toBe('Datenqualität prüfen: Telematik unzuverlässig.');
  });

  it('keeps data-quality copy separate from driver conduct wording', () => {
    expect(TRIP_ASSESSMENT_REASON_CATEGORY_LABEL.DATA_QUALITY_REVIEW).not.toMatch(/Fahrverhalten/i);
    expect(TRIP_ASSESSMENT_REASON_CATEGORY_LABEL.DRIVER_CONDUCT_REVIEW).toMatch(/Fahrverhalten/i);
    expect(TRIP_ASSESSMENT_REASON_CATEGORY_LABEL.VEHICLE_LOAD_REVIEW).toMatch(/Fahrzeugbelastung/i);
  });
});
