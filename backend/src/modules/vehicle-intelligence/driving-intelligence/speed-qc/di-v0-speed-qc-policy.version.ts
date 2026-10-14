export const DI_V0_SPEED_QC_POLICY_V1 = 'DI_V0_SPEED_QC_POLICY_V1';
export const DI_V0_SPEED_QC_POLICY_V2 = 'DI_V0_SPEED_QC_POLICY_V2';

export const DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION = DI_V0_SPEED_QC_POLICY_V1;

const KNOWN = new Set([DI_V0_SPEED_QC_POLICY_V1, DI_V0_SPEED_QC_POLICY_V2]);

export class DiV0SpeedQcPolicyVersionError extends Error {
  readonly unknownVersion: string;

  constructor(unknownVersion: string) {
    super(`Unknown DI speed QC policy version: ${unknownVersion}`);
    this.name = 'DiV0SpeedQcPolicyVersionError';
    this.unknownVersion = unknownVersion;
  }
}

export function resolveDiV0SpeedQcPolicyVersion(
  version?: string | null,
): typeof DI_V0_SPEED_QC_POLICY_V1 | typeof DI_V0_SPEED_QC_POLICY_V2 {
  const resolved = version ?? DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION;
  if (!KNOWN.has(resolved)) {
    throw new DiV0SpeedQcPolicyVersionError(resolved);
  }
  return resolved as typeof DI_V0_SPEED_QC_POLICY_V1 | typeof DI_V0_SPEED_QC_POLICY_V2;
}
