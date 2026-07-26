import { MembershipRole, NotificationDomain } from '@prisma/client';

const BILLING_PARAM_KEYS = new Set([
  'invoiceId',
  'amount',
  'amountCents',
  'depositAmount',
  'balanceDue',
  'customerName',
  'customerEmail',
]);

const INTERNAL_ORG_PARAM_KEYS = new Set([
  'integrationName',
  'webhookName',
  'apiKeyHint',
  'orgSetting',
]);

const DRIVER_ALLOWED_DOMAINS = new Set<NotificationDomain>([
  NotificationDomain.BOOKINGS,
  NotificationDomain.HANDOVERS,
  NotificationDomain.DRIVING_ANALYSIS,
]);

/**
 * Redact template params before API response based on role and domain.
 * Prevents cross-role data leakage without changing stored notification data.
 */
export function redactTemplateParamsForRole(
  params: Record<string, string | number | boolean | null>,
  role: MembershipRole,
  domain: NotificationDomain,
): Record<string, string | number | boolean | null> {
  if (role === MembershipRole.ORG_ADMIN || role === MembershipRole.SUB_ADMIN) {
    return params;
  }

  const redacted = { ...params };

  if (role === MembershipRole.DRIVER) {
    if (!DRIVER_ALLOWED_DOMAINS.has(domain)) {
      return { label: redacted.label ?? redacted.plate ?? null };
    }
    for (const key of BILLING_PARAM_KEYS) {
      if (key in redacted) redacted[key] = null;
    }
  }

  if (role === MembershipRole.WORKER) {
    for (const key of INTERNAL_ORG_PARAM_KEYS) {
      if (key in redacted) redacted[key] = null;
    }
    if (domain === NotificationDomain.BILLING) {
      for (const key of BILLING_PARAM_KEYS) {
        if (key in redacted) redacted[key] = null;
      }
    }
  }

  return redacted;
}

export function redactActionTargetForRole(
  target: Record<string, unknown>,
  role: MembershipRole,
  domain: NotificationDomain,
): Record<string, unknown> {
  if (role === MembershipRole.ORG_ADMIN || role === MembershipRole.SUB_ADMIN) {
    return target;
  }

  const copy = { ...target };

  if (role === MembershipRole.DRIVER && domain === NotificationDomain.BILLING) {
    delete copy.invoiceId;
  }

  if (role === MembershipRole.WORKER && domain === NotificationDomain.SECURITY) {
    delete copy.module;
  }

  return copy;
}

const EXTERNAL_CHANNEL_BLOCKED_PARAM_KEYS = new Set([
  ...BILLING_PARAM_KEYS,
  ...INTERNAL_ORG_PARAM_KEYS,
  'customerName',
  'customerEmail',
  'customerPhone',
  'vin',
  'licensePlate',
  'apiKeyHint',
  'webhookSecret',
]);

/**
 * Redact template params for external (email/push/sms) delivery.
 * External channels never receive full billing/org secrets regardless of role.
 */
export function redactTemplateParamsForExternalChannel(
  params: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const redacted: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(params)) {
    if (EXTERNAL_CHANNEL_BLOCKED_PARAM_KEYS.has(key)) {
      redacted[key] = null;
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}
