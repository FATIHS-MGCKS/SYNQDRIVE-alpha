import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import {
  AuthorityTransitionResult,
  PhysicalStateCanonicalGate,
} from './physical-state-authority.types';

export function resolveCanonicalGate(
  authorityMode: DeviceConnectionPhysicalAuthorityMode,
): PhysicalStateCanonicalGate {
  if (authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
    return PhysicalStateCanonicalGate.PHYSICAL;
  }
  return PhysicalStateCanonicalGate.LEGACY;
}

export function isPhysicalAuthorityMode(
  authorityMode: DeviceConnectionPhysicalAuthorityMode,
): boolean {
  return authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL;
}

export function isLegacyAuthorityMode(
  authorityMode: DeviceConnectionPhysicalAuthorityMode,
): boolean {
  return authorityMode === DeviceConnectionPhysicalAuthorityMode.LEGACY;
}

/**
 * Forward-only authority transition validator.
 * P2.2 validates transitions only — P2.5 executes latch cutover.
 */
export function validateAuthorityTransition(
  from: DeviceConnectionPhysicalAuthorityMode,
  to: DeviceConnectionPhysicalAuthorityMode,
): AuthorityTransitionResult {
  if (from === to) {
    return { allowed: false, from, to, reason: 'NO_OP_TRANSITION' };
  }

  if (
    from === DeviceConnectionPhysicalAuthorityMode.PHYSICAL &&
    to === DeviceConnectionPhysicalAuthorityMode.LEGACY
  ) {
    return { allowed: false, from, to, reason: 'PHYSICAL_TO_LEGACY_FORBIDDEN' };
  }

  if (
    from === DeviceConnectionPhysicalAuthorityMode.LEGACY &&
    to === DeviceConnectionPhysicalAuthorityMode.PHYSICAL
  ) {
    return { allowed: true, from, to };
  }

  return { allowed: false, from, to, reason: 'UNSUPPORTED_TRANSITION' };
}

/**
 * Default authority mode for new authority-scope rows.
 */
export function defaultAuthorityMode(): DeviceConnectionPhysicalAuthorityMode {
  return DeviceConnectionPhysicalAuthorityMode.LEGACY;
}

/**
 * Device/binding replacement must inherit vehicle/provider authority — never reset.
 */
export function authorityModeSurvivesBindingReplacement(
  currentMode: DeviceConnectionPhysicalAuthorityMode,
): DeviceConnectionPhysicalAuthorityMode {
  return currentMode;
}
