import type { VoiceRolloutStatus } from '@prisma/client';
import type { VoiceEntitlementCapability } from '@modules/voice-entitlement/voice-entitlement.types';

/** Runtime surfaces gated by rollout policy. */
export type VoiceRolloutSurface =
  | 'inbound'
  | 'outbound'
  | 'automation'
  | 'provisioning'
  | 'agent_deployment'
  | 'mcp'
  | 'webhooks'
  | 'legacy_diagnostic';

export type VoiceRolloutPrerequisiteCode =
  | 'global_kill_switch_native'
  | 'global_kill_switch_mcp'
  | 'global_kill_switch_webhooks'
  | 'global_kill_switch_automations'
  | 'global_kill_switch_legacy'
  | 'tenant_rollout_disabled'
  | 'tenant_rollout_suspended'
  | 'tenant_rollout_tier_insufficient'
  | 'tenant_rollout_unknown'
  | 'entitlement_denied'
  | 'provider_unhealthy'
  | 'deployment_missing'
  | 'phone_missing'
  | 'phone_not_imported'
  | 'mcp_url_missing'
  | 'budget_degraded'
  | 'legacy_not_in_production';

export type VoiceRolloutPrerequisiteBlocker = {
  code: VoiceRolloutPrerequisiteCode;
  message: string;
};

export type VoiceRolloutContext = {
  organizationId: string;
  status: VoiceRolloutStatus;
  lastReason: string | null;
  updatedAt: Date | null;
};

export type VoiceRolloutEvaluation = {
  organizationId: string;
  surface: VoiceRolloutSurface;
  rolloutStatus: VoiceRolloutStatus;
  allowed: boolean;
  blockers: VoiceRolloutPrerequisiteBlocker[];
};

export type VoiceRolloutStatusView = {
  organizationId: string;
  status: VoiceRolloutStatus;
  lastReason: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export const VOICE_ROLLOUT_SURFACE_ENTITLEMENT: Record<VoiceRolloutSurface, VoiceEntitlementCapability | null> = {
  inbound: 'calls.inbound',
  outbound: 'calls.outbound',
  automation: 'calls.outbound',
  provisioning: 'provisioning.execute',
  agent_deployment: 'agent.deployment.deploy',
  mcp: 'mcp.tools',
  webhooks: 'calls.inbound',
  legacy_diagnostic: 'diagnostics.read',
};
