/** Post-S4 EXP021 motion-core shadow bundle (Fable review recommended candidate). */
export const DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 =
  'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4';

/** C5.1 preferred speed layer on C4 (post-trip); separate intent key from V1 bundle. */
export const DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1 =
  'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V2_C5_1_PREFERRED_SPEED_V1';

export function resolveMotionCoreShadowBundleVersion(c5_1PreferredSpeedEnabled: boolean): string {
  return c5_1PreferredSpeedEnabled
    ? DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1
    : DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1;
}
