import type { VoiceSubscriptionStatus } from '@prisma/client';

/** Derived tenant entitlement state — not persisted; maps from VoiceSubscription rows. */
export type VoiceEntitlementStatus =
  | 'NO_SUBSCRIPTION'
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED';

export type VoiceEntitlementCapability =
  | 'billing.plans.read'
  | 'billing.subscription.read'
  | 'billing.subscription.onboard'
  | 'billing.usage.read'
  | 'assistant.config.read'
  | 'assistant.config.write'
  | 'assistant.activate'
  | 'provisioning.execute'
  | 'agent.deployment.read'
  | 'agent.deployment.write'
  | 'agent.deployment.deploy'
  | 'telephony.number.manage'
  | 'telephony.settings.write'
  | 'calls.inbound'
  | 'calls.outbound'
  | 'mcp.tools'
  | 'test.center'
  | 'history.read'
  | 'diagnostics.read'
  | 'protection.read'
  | 'protection.write';

export type VoiceEntitlementContext = {
  organizationId: string;
  status: VoiceEntitlementStatus;
  subscriptionId: string | null;
  subscriptionStatus: VoiceSubscriptionStatus | null;
  planCode: string | null;
  cancelledAt: Date | null;
};
