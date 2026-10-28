import type { Ds4SpeedAuthorityPartitionV1 } from './ds4-trip-assessment-v1.contract';

export const DS4_REFERENCE_DISTRIBUTION_VERSION_V1 = 'ds4_reference_distribution_v1' as const;

export type Ds4ReferenceDistributionLookupV1 = {
  version: typeof DS4_REFERENCE_DISTRIBUTION_VERSION_V1;
  calibrated: boolean;
  resolveOperationalLoadIndexPercentile(input: {
    speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
    accelerationOrdinalValues: readonly number[];
    decelerationOrdinalValues: readonly number[];
  }): number | null;
};

/** Default boundary: no approved reference distribution — never emits a numeric score. */
export const DS4_REFERENCE_DISTRIBUTION_V1_UNCALIBRATED: Ds4ReferenceDistributionLookupV1 = {
  version: DS4_REFERENCE_DISTRIBUTION_VERSION_V1,
  calibrated: false,
  resolveOperationalLoadIndexPercentile(): number | null {
    return null;
  },
};
