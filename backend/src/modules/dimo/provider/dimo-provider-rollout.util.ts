import type {
  DimoProviderLimiterConfigShape,
  DimoProviderLimiterMode,
} from '@config/dimo-provider-limiter.config';
import { isInCanaryPercentBucket, stableCanaryHashPercent } from './dimo-provider-canary-hash.util';

/**
 * P1.3-S4 rollout states (conceptual — derived from config, not a separate env enum).
 */
export type DimoProviderRolloutState =
  | 'off'
  | 'shadow'
  | 'canary_enforce'
  | 'global_enforce';

export type DimoProviderCanaryReason =
  | 'none'
  | 'global_enforce'
  | 'org_allowlist'
  | 'vehicle_allowlist'
  | 'percent_hash'
  | 'legacy_org_allowlist';

export interface DimoProviderCanaryContext {
  organizationId?: string;
  vehicleId?: string;
}

export interface DimoProviderCanaryResolution {
  rolloutState: DimoProviderRolloutState;
  effectiveMode: DimoProviderLimiterMode;
  canaryMatch: boolean;
  canaryReason: DimoProviderCanaryReason;
  canaryHashBucket?: number;
  canaryPercent?: number;
}

export function isCanaryRolloutConfigured(
  config: DimoProviderLimiterConfigShape,
): boolean {
  if (!config.enabled || config.mode === 'off' || config.mode === 'enforce') {
    return false;
  }
  if (config.canaryEnforceOrgIds.size > 0) {
    return true;
  }
  if (!config.enforceCanaryEnabled) {
    return false;
  }
  return (
    config.enforceCanaryPercent > 0 ||
    config.enforceCanaryVehicleIds.size > 0
  );
}

export function resolveRolloutState(
  config: DimoProviderLimiterConfigShape,
): DimoProviderRolloutState {
  if (!config.enabled || config.mode === 'off') return 'off';
  if (config.mode === 'enforce') return 'global_enforce';
  if (isCanaryRolloutConfigured(config)) return 'canary_enforce';
  return 'shadow';
}

function normalizeId(id?: string): string | undefined {
  const trimmed = id?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function resolvePercentCanary(
  config: DimoProviderLimiterConfigShape,
  context: DimoProviderCanaryContext,
): { match: boolean; bucket?: number } {
  if (!config.enforceCanaryEnabled || config.enforceCanaryPercent <= 0) {
    return { match: false };
  }
  const stableKey = normalizeId(context.vehicleId) ?? normalizeId(context.organizationId);
  if (!stableKey) {
    return { match: false };
  }
  const bucket = stableCanaryHashPercent(stableKey);
  return {
    match: isInCanaryPercentBucket(stableKey, config.enforceCanaryPercent),
    bucket,
  };
}

/**
 * Per-request effective limiter mode + canary metadata.
 * Canary orgs / vehicles / percent bucket receive enforce while global mode remains shadow.
 */
export function resolveCanaryEnforcement(
  config: DimoProviderLimiterConfigShape,
  context: DimoProviderCanaryContext = {},
): DimoProviderCanaryResolution {
  const organizationId = normalizeId(context.organizationId);
  const vehicleId = normalizeId(context.vehicleId);
  const rolloutState = resolveRolloutState(config);

  if (!config.enabled || config.mode === 'off') {
    return {
      rolloutState: 'off',
      effectiveMode: 'off',
      canaryMatch: false,
      canaryReason: 'none',
    };
  }

  if (config.mode === 'enforce') {
    return {
      rolloutState: 'global_enforce',
      effectiveMode: 'enforce',
      canaryMatch: false,
      canaryReason: 'global_enforce',
    };
  }

  if (organizationId && config.canaryEnforceOrgIds.has(organizationId)) {
    return {
      rolloutState,
      effectiveMode: 'enforce',
      canaryMatch: true,
      canaryReason: 'org_allowlist',
    };
  }

  if (
    config.enforceCanaryEnabled &&
    vehicleId &&
    config.enforceCanaryVehicleIds.has(vehicleId)
  ) {
    return {
      rolloutState,
      effectiveMode: 'enforce',
      canaryMatch: true,
      canaryReason: 'vehicle_allowlist',
    };
  }

  const percent = resolvePercentCanary(config, { organizationId, vehicleId });
  if (percent.match) {
    return {
      rolloutState,
      effectiveMode: 'enforce',
      canaryMatch: true,
      canaryReason: 'percent_hash',
      canaryHashBucket: percent.bucket,
      canaryPercent: config.enforceCanaryPercent,
    };
  }

  return {
    rolloutState,
    effectiveMode: 'shadow',
    canaryMatch: false,
    canaryReason: 'none',
    canaryHashBucket: percent.bucket,
    canaryPercent: config.enforceCanaryPercent > 0 ? config.enforceCanaryPercent : undefined,
  };
}

/** @deprecated Use resolveCanaryEnforcement — kept for call-site compatibility. */
export function resolveEffectiveLimiterMode(
  config: DimoProviderLimiterConfigShape,
  organizationId?: string,
  vehicleId?: string,
): DimoProviderLimiterMode {
  return resolveCanaryEnforcement(config, { organizationId, vehicleId }).effectiveMode;
}

export function isCanaryEnforcedRequest(
  config: DimoProviderLimiterConfigShape,
  context: DimoProviderCanaryContext = {},
): boolean {
  const resolution = resolveCanaryEnforcement(config, context);
  return (
    resolution.rolloutState === 'canary_enforce' &&
    resolution.effectiveMode === 'enforce'
  );
}
