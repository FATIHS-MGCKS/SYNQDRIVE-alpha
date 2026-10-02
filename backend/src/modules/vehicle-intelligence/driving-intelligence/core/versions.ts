/** Frozen structural contract (C1D.3). */
export const DI_SOURCE_QUALITY_CONTRACT_V0_1 = 'DI_SOURCE_QUALITY_CONTRACT_V0_1';

/** Frozen L3 centred-path estimator binding (C1D.3). */
export const DI_KINEMATIC_ESTIMATE_V0_1 = 'DI_KINEMATIC_ESTIMATE_V0_1';

export const SOURCE_FAMILY_POLICY_V0_1 = 'SOURCE_FAMILY_POLICY_V0_1';

export const DI_SHADOW_RECORD_V0_1 = 'DI_SHADOW_RECORD_V0_1';

/** No fleet calibration applied (C1D.3). */
export const CALIBRATION_UNSET_V0 = 'CALIBRATION_UNSET_V0';

export interface DiV0VersionTuple {
  structuralVersion: typeof DI_SOURCE_QUALITY_CONTRACT_V0_1;
  estimatorVersion: typeof DI_KINEMATIC_ESTIMATE_V0_1;
  calibrationVersion: string;
  sourceFamilyPolicyVersion: typeof SOURCE_FAMILY_POLICY_V0_1;
}

export const DEFAULT_DI_V0_VERSION_TUPLE: DiV0VersionTuple = {
  structuralVersion: DI_SOURCE_QUALITY_CONTRACT_V0_1,
  estimatorVersion: DI_KINEMATIC_ESTIMATE_V0_1,
  calibrationVersion: CALIBRATION_UNSET_V0,
  sourceFamilyPolicyVersion: SOURCE_FAMILY_POLICY_V0_1,
};
