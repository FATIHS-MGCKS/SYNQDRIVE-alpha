import { registerAs } from '@nestjs/config';
import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { parseConnectivityRecoveryBoolean } from './connectivity-recovery.config';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from './connectivity-physical-state.config';
import {
  PhysicalStateCanonicalGate,
  type EffectivePhysicalStateRuntimePolicy,
} from '../modules/dimo/device-connection-physical-state/physical-state-authority.types';
import { resolveCanonicalGate } from '../modules/dimo/device-connection-physical-state/physical-state-authority.state-machine';

export const CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED';

export const CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED';

export const CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED';

export const CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED';

export interface ConnectivityPhysicalStateRuntimeFlagConfig {
  masterEnabled: boolean;
  projectionWriteEnabled: boolean;
  shadowCompareEnabled: boolean;
  authorityCutoverEnabled: boolean;
  sideEffectsEnabled: boolean;
}

export function loadConnectivityPhysicalStateRuntimeFlagConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConnectivityPhysicalStateRuntimeFlagConfig {
  const masterEnabled = parseConnectivityRecoveryBoolean(
    env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV],
    false,
  );

  const readSubFlag = (key: string): boolean =>
    masterEnabled && parseConnectivityRecoveryBoolean(env[key], false);

  return {
    masterEnabled,
    projectionWriteEnabled: readSubFlag(CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV),
    shadowCompareEnabled: readSubFlag(CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV),
    authorityCutoverEnabled: readSubFlag(
      CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV,
    ),
    sideEffectsEnabled: readSubFlag(CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV),
  };
}

/**
 * Deterministic effective runtime policy for physical-state reconciliation.
 *
 * Feature flags control capabilities around the latched authority mode — they
 * do NOT define authority mode themselves.
 */
export function resolveEffectivePhysicalStateRuntimePolicy(input: {
  authorityMode: DeviceConnectionPhysicalAuthorityMode;
  flags: ConnectivityPhysicalStateRuntimeFlagConfig;
  pilotScopeAllowed?: boolean;
  pilotGateReason?: EffectivePhysicalStateRuntimePolicy['pilotGateReason'];
}): EffectivePhysicalStateRuntimePolicy {
  const canonicalGate = resolveCanonicalGate(input.authorityMode);
  const {
    masterEnabled,
    projectionWriteEnabled,
    shadowCompareEnabled,
    authorityCutoverEnabled,
    sideEffectsEnabled,
  } = input.flags;

  const pilotScopeAllowed = input.pilotScopeAllowed ?? true;
  const pilotGateReason = input.pilotGateReason ?? 'ALLOWED';

  const statefulShadow =
    input.authorityMode === DeviceConnectionPhysicalAuthorityMode.LEGACY &&
    pilotScopeAllowed &&
    projectionWriteEnabled &&
    shadowCompareEnabled &&
    !sideEffectsEnabled;

  return {
    authorityMode: input.authorityMode,
    canonicalGate,
    masterEnabled,
    projectionWriteEnabled,
    shadowCompareEnabled,
    authorityCutoverEnabled,
    sideEffectsEnabled,
    statefulShadow,
    legacyGateAuthoritative: canonicalGate === PhysicalStateCanonicalGate.LEGACY,
    physicalGateAuthoritative: canonicalGate === PhysicalStateCanonicalGate.PHYSICAL,
    pilotScopeAllowed,
    pilotGateReason,
  };
}

export function resolveEffectivePhysicalStateRuntimePolicyFromEnv(
  authorityMode: DeviceConnectionPhysicalAuthorityMode,
  env: NodeJS.ProcessEnv = process.env,
): EffectivePhysicalStateRuntimePolicy {
  return resolveEffectivePhysicalStateRuntimePolicy({
    authorityMode,
    flags: loadConnectivityPhysicalStateRuntimeFlagConfig(env),
  });
}

export default registerAs('connectivityPhysicalStateRuntime', () =>
  loadConnectivityPhysicalStateRuntimeFlagConfig(),
);
