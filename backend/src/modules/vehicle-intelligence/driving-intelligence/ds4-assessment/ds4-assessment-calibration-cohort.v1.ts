/**
 * DS4 calibration / validation cohort (four production reference vehicles).
 *
 * Used for Fable replay, postgres fixtures, and offline evaluation — **not** production admission.
 * Fleet-wide DS4 authority uses `ds4-assessment-eligibility-policy.v1.ts` (tenant-safe scope only).
 *
 * Evidence: `architecture/tires/evidence/p3-offline-e2e-2026-10-27/production-vehicles-meta.json`
 */

export type Ds4AssessmentCalibrationVehicleRoleV1 =
  | 'TESLA_MODEL_3_SOFTWARE_INTEGRATION'
  | 'VW_TIGUAN_R1'
  | 'AUDI_A4_R1'
  | 'VW_ARTEON_R1';

export type Ds4AssessmentCalibrationVehicleV1 = {
  vehicleId: string;
  organizationId: string;
  role: Ds4AssessmentCalibrationVehicleRoleV1;
};

export const DS4_ASSESSMENT_CALIBRATION_COHORT_V1: readonly Ds4AssessmentCalibrationVehicleV1[] = [
  {
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'TESLA_MODEL_3_SOFTWARE_INTEGRATION',
  },
  {
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'VW_TIGUAN_R1',
  },
  {
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'AUDI_A4_R1',
  },
  {
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'VW_ARTEON_R1',
  },
] as const;

/** @deprecated Use DS4_ASSESSMENT_CALIBRATION_COHORT_V1 — name retained for test imports. */
export const DS4_ASSESSMENT_FLEET_VEHICLES_V1 = DS4_ASSESSMENT_CALIBRATION_COHORT_V1;
