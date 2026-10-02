import { Exp021StudyStatus } from '@prisma/client';
import {
  EXP021_COHORT_STUDY_ENROLLMENT_ALLOWED_PLANS,
  EXP021_PRODUCTION_FLEET_STUDY_KEY,
  Exp021CohortStudyEnrollmentBootstrapError,
  resolveExp021FleetStudyKeyFromEnv,
} from './reference-capture-exp021-cohort-study-enrollment-bootstrap.lib';

describe('EXP-021 cohort study enrollment bootstrap', () => {
  it('defaults fleet study key to production cadence study', () => {
    expect(resolveExp021FleetStudyKeyFromEnv({})).toBe(EXP021_PRODUCTION_FLEET_STUDY_KEY);
    expect(
      resolveExp021FleetStudyKeyFromEnv({ EXP021_FLEET_STUDY_KEY: 'custom-study' }),
    ).toBe('custom-study');
  });

  it('exposes both short A/B plan registry keys for cohort enrollments', () => {
    expect(EXP021_COHORT_STUDY_ENROLLMENT_ALLOWED_PLANS).toEqual([
      'CANDIDATE_SHORT_AB_90_60',
      'CANDIDATE_SHORT_AB_60_90',
    ]);
  });

  it('classifies bootstrap errors with stable codes', () => {
    const err = new Exp021CohortStudyEnrollmentBootstrapError('STUDY_NOT_FOUND', 'missing');
    expect(err.code).toBe('STUDY_NOT_FOUND');
    expect(err).toBeInstanceOf(Error);
  });

  it('documents study must be COLLECTING (contract)', () => {
    expect(Exp021StudyStatus.COLLECTING).toBe('COLLECTING');
  });
});
