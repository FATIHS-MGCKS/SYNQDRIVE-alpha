/** Post-S4 EXP021 motion-core shadow bundle (Fable review recommended candidate). */
export const DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 =
  'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4';

/** C5.1 preferred speed layer on C4 (post-trip); separate intent key from V1 bundle. */
export const DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1 =
  'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V2_C5_1_PREFERRED_SPEED_V1';

/** Retrospective FSM gap-bridge V1.3.1 (C4 speed path unchanged). */
export const DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V3_FSM_GAP_BRIDGE =
  'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V3_FSM_GAP_BRIDGE_V1_3_1';

/** C5.1 preferred speed + FSM gap-bridge V1.3.1. */
export const DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE =
  'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V4_C5_1_AND_FSM_GAP_BRIDGE_V1_3_1';

export type MotionCoreShadowBundleResolveInput = {
  c5_1PreferredSpeedEnabled: boolean;
  fsmGapBridgeV1Enabled: boolean;
};

export function resolveMotionCoreShadowBundleVersion(input: MotionCoreShadowBundleResolveInput): string {
  if (input.c5_1PreferredSpeedEnabled && input.fsmGapBridgeV1Enabled) {
    return DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE;
  }
  if (input.fsmGapBridgeV1Enabled) {
    return DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V3_FSM_GAP_BRIDGE;
  }
  if (input.c5_1PreferredSpeedEnabled) {
    return DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1;
  }
  return DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1;
}
