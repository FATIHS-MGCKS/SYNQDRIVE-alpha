import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { normalizeConnectivityProvider } from './device-connection-physical-state.binding';
import type {
  PhysicalAuthorityScopeIdentity,
  ShadowPilotScopeConfigParseResult,
  ShadowPilotScopeGateDecision,
  ShadowPilotScopeGateReason,
} from './physical-state-shadow-pilot-scope.types';

function scopeIdentityKey(scope: PhysicalAuthorityScopeIdentity): string {
  return `${scope.organizationId}\u0000${scope.vehicleId}\u0000${normalizeConnectivityProvider(scope.provider)}`;
}

export function normalizePhysicalAuthorityScope(
  scope: PhysicalAuthorityScopeIdentity,
): PhysicalAuthorityScopeIdentity {
  return {
    organizationId: scope.organizationId.trim(),
    vehicleId: scope.vehicleId.trim(),
    provider: normalizeConnectivityProvider(scope.provider),
  };
}

export function evaluateShadowPilotScopeGate(input: {
  scope: PhysicalAuthorityScopeIdentity;
  authorityMode: DeviceConnectionPhysicalAuthorityMode;
  pilotConfig: ShadowPilotScopeConfigParseResult;
}): ShadowPilotScopeGateDecision {
  if (input.authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
    return { allowed: true, reason: 'BYPASSED_PHYSICAL_AUTHORITY' };
  }

  if (!input.pilotConfig.ok || input.pilotConfig.configInvalid) {
    return { allowed: false, reason: 'DENIED_INVALID_CONFIG' };
  }

  if (input.pilotConfig.scopes.length === 0) {
    return { allowed: false, reason: 'DENIED_NOT_CONFIGURED' };
  }

  const normalized = normalizePhysicalAuthorityScope(input.scope);
  const allowed = input.pilotConfig.scopes.some(
    (entry) => scopeIdentityKey(entry) === scopeIdentityKey(normalized),
  );

  if (!allowed) {
    return { allowed: false, reason: 'DENIED_SCOPE_NOT_ALLOWLISTED' };
  }

  return { allowed: true, reason: 'ALLOWED' };
}

export function isUnsafePilotShadowFlagConfiguration(input: {
  sideEffectsEnabled: boolean;
  authorityCutoverEnabled: boolean;
}): ShadowPilotScopeGateReason | null {
  if (input.sideEffectsEnabled) {
    return 'DENIED_UNSAFE_SIDE_EFFECTS_FLAG';
  }
  if (input.authorityCutoverEnabled) {
    return 'DENIED_UNSAFE_AUTHORITY_CUTOVER_FLAG';
  }
  return null;
}

export function applyPilotGateToRuntimeFlags<T extends {
  projectionWriteEnabled: boolean;
  shadowCompareEnabled: boolean;
  sideEffectsEnabled: boolean;
  authorityCutoverEnabled: boolean;
}>(
  flags: T,
  gate: ShadowPilotScopeGateDecision,
): T {
  if (gate.allowed && gate.reason === 'ALLOWED') {
    return flags;
  }

  return {
    ...flags,
    projectionWriteEnabled: false,
    shadowCompareEnabled: false,
    sideEffectsEnabled: false,
    authorityCutoverEnabled: false,
  };
}
