import type { VoiceEntitlementCapability, VoiceEntitlementStatus } from './voice-entitlement.types';

const C = (values: VoiceEntitlementCapability[]) => new Set(values);

const BILLING_ONBOARDING: VoiceEntitlementCapability[] = [
  'billing.plans.read',
  'billing.subscription.read',
  'billing.subscription.onboard',
];

const CONFIG_READ: VoiceEntitlementCapability[] = ['assistant.config.read', 'agent.deployment.read'];

const CONFIG_WRITE: VoiceEntitlementCapability[] = [
  'assistant.config.write',
  'agent.deployment.write',
  'telephony.settings.write',
];

const USAGE_READ: VoiceEntitlementCapability[] = [
  'billing.usage.read',
  'history.read',
  'protection.read',
];

const RUNTIME: VoiceEntitlementCapability[] = [
  'assistant.activate',
  'provisioning.execute',
  'agent.deployment.deploy',
  'telephony.number.manage',
  'calls.inbound',
  'calls.outbound',
  'mcp.tools',
  'test.center',
];

const DIAGNOSTICS: VoiceEntitlementCapability[] = ['diagnostics.read', 'protection.read'];

/**
 * Declarative route capability matrix per derived entitlement status.
 * Plan prices and entitlements remain in voice-plan-catalog — not duplicated here.
 */
export const VOICE_ENTITLEMENT_POLICY: Record<
  VoiceEntitlementStatus,
  ReadonlySet<VoiceEntitlementCapability>
> = {
  NO_SUBSCRIPTION: C([
    ...BILLING_ONBOARDING,
    'assistant.config.read',
  ]),

  TRIAL: C([
    ...BILLING_ONBOARDING,
    ...CONFIG_READ,
    ...CONFIG_WRITE,
    ...USAGE_READ,
    ...RUNTIME,
    'protection.write',
  ]),

  ACTIVE: C([
    ...BILLING_ONBOARDING,
    ...CONFIG_READ,
    ...CONFIG_WRITE,
    ...USAGE_READ,
    ...RUNTIME,
    'protection.write',
  ]),

  PAST_DUE: C([
    ...BILLING_ONBOARDING,
    ...CONFIG_READ,
    ...CONFIG_WRITE,
    ...USAGE_READ,
    'calls.inbound',
    'diagnostics.read',
    'protection.read',
  ]),

  SUSPENDED: C([
    'billing.subscription.read',
    'billing.usage.read',
    'history.read',
    ...DIAGNOSTICS,
  ]),

  CANCELLED: C(['history.read', 'billing.subscription.read']),
};

export function isCapabilityAllowed(
  status: VoiceEntitlementStatus,
  capability: VoiceEntitlementCapability,
): boolean {
  return VOICE_ENTITLEMENT_POLICY[status].has(capability);
}
