import type { VoiceRolloutStatus } from '@prisma/client';
import type { VoiceRolloutSurface } from './voice-rollout.types';

/** Ordered rollout tiers — higher index = broader production access. */
export const VOICE_ROLLOUT_TIER_ORDER: readonly VoiceRolloutStatus[] = [
  'DISABLED',
  'SUSPENDED',
  'INTERNAL_TEST',
  'STAGING',
  'CANARY',
  'PRODUCTION',
] as const;

const TIER_RANK = new Map<VoiceRolloutStatus, number>(
  VOICE_ROLLOUT_TIER_ORDER.map((status, index) => [status, index]),
);

const KNOWN_STATUSES = new Set<VoiceRolloutStatus>(VOICE_ROLLOUT_TIER_ORDER);

/** Minimum rollout tier required per surface. Global kill-switches are evaluated separately. */
export const VOICE_ROLLOUT_SURFACE_MIN_TIER: Record<VoiceRolloutSurface, VoiceRolloutStatus> = {
  inbound: 'INTERNAL_TEST',
  outbound: 'INTERNAL_TEST',
  automation: 'CANARY',
  provisioning: 'INTERNAL_TEST',
  agent_deployment: 'INTERNAL_TEST',
  mcp: 'INTERNAL_TEST',
  webhooks: 'INTERNAL_TEST',
  legacy_diagnostic: 'INTERNAL_TEST',
};

/** Global env kill-switch keys per surface (platform-wide only). */
export const VOICE_ROLLOUT_SURFACE_GLOBAL_FLAG: Partial<
  Record<VoiceRolloutSurface, 'native' | 'mcp' | 'webhooks' | 'automations' | 'legacy'>
> = {
  inbound: 'native',
  outbound: 'native',
  automation: 'automations',
  provisioning: 'native',
  mcp: 'mcp',
  webhooks: 'webhooks',
  legacy_diagnostic: 'legacy',
};

export function isKnownRolloutStatus(status: string): status is VoiceRolloutStatus {
  return KNOWN_STATUSES.has(status as VoiceRolloutStatus);
}

export function rolloutTierRank(status: VoiceRolloutStatus): number {
  return TIER_RANK.get(status) ?? -1;
}

export function isRolloutTierAtLeast(
  status: VoiceRolloutStatus,
  minimum: VoiceRolloutStatus,
): boolean {
  if (status === 'DISABLED' || status === 'SUSPENDED') {
    return false;
  }
  return rolloutTierRank(status) >= rolloutTierRank(minimum);
}

export function isTenantRolloutOperational(status: VoiceRolloutStatus): boolean {
  return status !== 'DISABLED' && status !== 'SUSPENDED';
}

/** Legacy diagnostic calls are never allowed on PRODUCTION rollout tier. */
export function isLegacyDiagnosticRolloutAllowed(status: VoiceRolloutStatus): boolean {
  if (status === 'PRODUCTION' || status === 'DISABLED' || status === 'SUSPENDED') {
    return false;
  }
  return isRolloutTierAtLeast(status, 'INTERNAL_TEST');
}

export function isSurfaceRolloutTierAllowed(
  surface: VoiceRolloutSurface,
  status: VoiceRolloutStatus,
): boolean {
  if (!isKnownRolloutStatus(status)) {
    return false;
  }
  if (status === 'DISABLED') {
    return false;
  }
  if (status === 'SUSPENDED') {
    return false;
  }
  if (surface === 'legacy_diagnostic') {
    return isLegacyDiagnosticRolloutAllowed(status);
  }
  return isRolloutTierAtLeast(status, VOICE_ROLLOUT_SURFACE_MIN_TIER[surface]);
}

/** Surfaces that share the same fundamental call prerequisites (inbound + outbound). */
export const VOICE_CALL_SURFACES: ReadonlySet<VoiceRolloutSurface> = new Set([
  'inbound',
  'outbound',
]);

export const VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM: ReadonlySet<VoiceRolloutStatus> = new Set([
  'DISABLED',
  'SUSPENDED',
  'PRODUCTION',
]);
