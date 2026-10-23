import type { DiV0MotionCoreShadowControlPlaneConfig } from './di-v0-motion-core-shadow-control-plane';

export const DI_V0_MOTION_CORE_C5_1_ENV = {
  activationSince: 'DI_V0_MOTION_CORE_C5_1_ACTIVATION_SINCE',
} as const;

export type C5_1VehicleAdmission = 'C5_1_ELIGIBLE' | 'C4_SHADOW_ONLY';

/**
 * Explicit make/model admission for C5.1 preferred speed (no silent TESLA fallback for other OEMs).
 */
export function resolveC5_1VehicleAdmissionFromLabels(
  make: string | null | undefined,
  model: string | null | undefined,
): C5_1VehicleAdmission {
  const hay = `${make ?? ''} ${model ?? ''}`.toLowerCase();
  if (hay.includes('tiguan')) return 'C5_1_ELIGIBLE';
  if (hay.includes('tesla')) return 'C5_1_ELIGIBLE';
  return 'C4_SHADOW_ONLY';
}

export function parseC5_1ActivationSince(
  env: Readonly<Record<string, string | undefined>>,
): Date | null {
  const raw = env[DI_V0_MOTION_CORE_C5_1_ENV.activationSince]?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${DI_V0_MOTION_CORE_C5_1_ENV.activationSince} must be a valid ISO-8601 timestamp`);
  }
  return parsed;
}

/**
 * Whether this trip should run the V2 C5.1 bundle (global flag + vehicle admission + activation cutoff).
 */
export function isC5_1PreferredSpeedEffective(
  controlPlane: DiV0MotionCoreShadowControlPlaneConfig,
  scope: {
    vehicleAdmission: C5_1VehicleAdmission;
    workItemCompletedAt: Date | null;
  },
): boolean {
  if (!controlPlane.c5_1PreferredSpeedEnabled) return false;
  if (scope.vehicleAdmission !== 'C5_1_ELIGIBLE') return false;
  if (!controlPlane.c5_1ActivationSince || !scope.workItemCompletedAt) return false;
  return scope.workItemCompletedAt.getTime() >= controlPlane.c5_1ActivationSince.getTime();
}

export function resolveC5_1PlausibilityClassForEligibleVehicle(
  make: string | null | undefined,
  model: string | null | undefined,
): 'TESLA' | 'TIGUAN' {
  const hay = `${make ?? ''} ${model ?? ''}`.toLowerCase();
  if (hay.includes('tiguan')) return 'TIGUAN';
  return 'TESLA';
}
