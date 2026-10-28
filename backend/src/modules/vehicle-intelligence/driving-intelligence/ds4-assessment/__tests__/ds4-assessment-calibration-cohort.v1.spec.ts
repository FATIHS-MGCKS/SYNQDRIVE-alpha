import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';

describe('ds4-assessment-calibration-cohort.v1', () => {
  it('defines four canonical calibration vehicles only', () => {
    expect(DS4_ASSESSMENT_CALIBRATION_COHORT_V1).toHaveLength(4);
    const orgIds = new Set(DS4_ASSESSMENT_CALIBRATION_COHORT_V1.map((v) => v.organizationId));
    expect(orgIds.size).toBe(1);
  });
});
