import type { DiV0MotionCoreShadowControlPlaneConfig } from './di-v0-motion-core-shadow-control-plane';

export const DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENV = {
  enabled: 'DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED',
  activationSince: 'DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ACTIVATION_SINCE',
} as const;

export function parseFsmGapBridgeV1ActivationSince(
  env: Readonly<Record<string, string | undefined>>,
): Date | null {
  const raw = env[DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENV.activationSince]?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `${DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENV.activationSince} must be a valid ISO-8601 timestamp`,
    );
  }
  return parsed;
}

/**
 * Post-trip FSM gap-bridge V1.3.1 (global flag + activation cutoff; no per-OEM admission).
 */
export function isFsmGapBridgeV1Effective(
  controlPlane: DiV0MotionCoreShadowControlPlaneConfig,
  scope: { workItemCompletedAt: Date | null },
): boolean {
  if (!controlPlane.fsmGapBridgeV1Enabled) return false;
  if (!controlPlane.fsmGapBridgeV1ActivationSince || !scope.workItemCompletedAt) return false;
  return scope.workItemCompletedAt.getTime() >= controlPlane.fsmGapBridgeV1ActivationSince.getTime();
}
