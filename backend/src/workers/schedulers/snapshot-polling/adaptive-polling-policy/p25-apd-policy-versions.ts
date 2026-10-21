/** Frozen offline-replay policy contract IDs (APD-PS1/PS2/PS3). */
export const P25_APD_B2_V1 = 'P25_APD_B2_V1' as const;
export const P25_APD_B4_V1 = 'P25_APD_B4_V1' as const;
export const P25_APD_PROFILE_CLASSIFIER_V1 = 'P25_APD_PROFILE_CLASSIFIER_V1' as const;

export type P25ApdPolicyVersion =
  | typeof P25_APD_B2_V1
  | typeof P25_APD_B4_V1;
