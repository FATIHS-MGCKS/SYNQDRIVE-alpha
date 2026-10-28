/**
 * @deprecated Production admission — replaced by `ds4-assessment-eligibility-policy.v1.ts`.
 * Calibration cohort constants remain for tests and evaluation harnesses only.
 */
export {
  DS4_ASSESSMENT_CALIBRATION_COHORT_V1,
  DS4_ASSESSMENT_FLEET_VEHICLES_V1,
  type Ds4AssessmentCalibrationVehicleRoleV1,
  type Ds4AssessmentCalibrationVehicleV1,
} from './ds4-assessment-calibration-cohort.v1';

export {
  evaluateDs4AssessmentScopeEligibilityV1,
  isCanonicalDs4AssessmentUuidV1,
  type Ds4AssessmentScopeEligibilityContextV1,
  type Ds4AssessmentScopeEligibilityReasonV1,
  type Ds4AssessmentScopeEligibilityResultV1,
  type Ds4AssessmentScopeV1,
} from './ds4-assessment-eligibility-policy.v1';
