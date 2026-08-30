import type {
  DimoProviderLimiterConfigShape,
  DimoProviderLimiterMode,
} from '@config/dimo-provider-limiter.config';

/**
 * P1.3-S4 rollout states (conceptual — derived from config, not a separate env enum).
 */
export type DimoProviderRolloutState =
  | 'off'
  | 'shadow'
  | 'canary_enforce'
  | 'global_enforce';

export function resolveRolloutState(
  config: DimoProviderLimiterConfigShape,
): DimoProviderRolloutState {
  if (!config.enabled || config.mode === 'off') return 'off';
  if (config.mode === 'enforce') return 'global_enforce';
  if (config.canaryEnforceOrgIds.size > 0) return 'canary_enforce';
  return 'shadow';
}

/**
 * Per-request effective limiter mode.
 * Canary orgs receive enforce semantics while global mode remains shadow.
 */
export function resolveEffectiveLimiterMode(
  config: DimoProviderLimiterConfigShape,
  organizationId?: string,
): DimoProviderLimiterMode {
  if (!config.enabled || config.mode === 'off') return 'off';
  if (config.mode === 'enforce') return 'enforce';
  if (
    organizationId &&
    config.canaryEnforceOrgIds.has(organizationId.trim())
  ) {
    return 'enforce';
  }
  return 'shadow';
}

export function isCanaryEnforcedRequest(
  config: DimoProviderLimiterConfigShape,
  organizationId?: string,
): boolean {
  return (
    resolveRolloutState(config) === 'canary_enforce' &&
    resolveEffectiveLimiterMode(config, organizationId) === 'enforce'
  );
}
