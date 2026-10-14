/**
 * PROVISIONAL kinematic thresholds for DI_V0_SPEED_QC_POLICY_V1.
 * Not empirically fleet-calibrated — used only for fail-closed QC gating.
 */
export const DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1 = {
  calibrationKind: 'PROVISIONAL' as const,
  /** Seconds before center label scanned for ROW_ABSENT (post-gap recovery). */
  postGapLookbackSeconds: 3,
  /** Max |longitudinal acceleration| between consecutive 1s leg speeds (m/s²). */
  maxLongitudinalAccelMps2: 12,
  /** Max 1s leg implied speed without independent R1 corroboration (m/s). ~180 km/h. */
  maxLegSpeedMpsUncorroborated: 50,
  /** Max 1s leg implied speed when R1 speed agrees with L3 shadow at label (m/s). */
  maxLegSpeedMpsCorroborated: 75,
  /** R1 agrees with shadow L3 when |delta| <= max(5 km/h, 10% of L3). */
  r1CorroborationAbsKmh: 5,
  r1CorroborationRelPct: 0.1,
  r1DisagreementAbsKmh: 10,
  r1DisagreementRelPct: 0.25,
};
