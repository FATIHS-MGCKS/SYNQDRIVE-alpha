import { BadRequestException, ForbiddenException } from '@nestjs/common';

/** Stable API/UI reason codes for voice protection enforcement. */
export const VOICE_PROTECTION_REASON_CODES = {
  NATIVE_INTEGRATION_DISABLED: 'native_integration_disabled',
  ASSISTANT_INACTIVE: 'assistant_inactive',
  OUTBOUND_DISABLED: 'outbound_disabled',
  SUBSCRIPTION_INACTIVE: 'subscription_inactive',
  SUBSCRIPTION_SUSPENDED: 'subscription_suspended',
  MONTHLY_BUDGET_HARD_LIMIT: 'monthly_budget_hard_limit',
  MONTHLY_BUDGET_GRACE: 'monthly_budget_grace',
  DAILY_OUTBOUND_MINUTES: 'daily_outbound_minutes',
  DAILY_SPEND_LIMIT: 'daily_spend_limit',
  CONCURRENT_CALL_LIMIT: 'concurrent_call_limit',
  DESTINATION_NOT_NORMALIZABLE: 'destination_not_normalizable',
  DESTINATION_BLOCKED_SPECIAL: 'destination_blocked_special',
  DESTINATION_COUNTRY_DENIED: 'destination_country_denied',
  DESTINATION_REPEAT_LIMIT: 'destination_repeat_limit',
  DESTINATION_COOLDOWN: 'destination_cooldown',
  CALLER_ID_NOT_ALLOWED: 'caller_id_not_allowed',
  PLAN_CONCURRENT_LIMIT: 'plan_concurrent_limit',
  MAX_DURATION_EXCEEDED: 'max_duration_exceeded',
  ABUSE_SHORT_CALL_BURST: 'abuse_short_call_burst',
  ABUSE_FAILED_TARGET_BURST: 'abuse_failed_target_burst',
  ABUSE_INTERNATIONAL_COST: 'abuse_international_cost',
  ABUSE_PARALLEL_SPIKE: 'abuse_parallel_spike',
  ABUSE_FORWARDING_LOOP: 'abuse_forwarding_loop',
  ABUSE_LONG_CALL: 'abuse_long_call',
  ACTIVATION_BUDGET_BLOCKED: 'activation_budget_blocked',
  INBOUND_BUDGET_DEGRADED: 'inbound_budget_degraded',
} as const;

export type VoiceProtectionReasonCode =
  (typeof VOICE_PROTECTION_REASON_CODES)[keyof typeof VOICE_PROTECTION_REASON_CODES];

export class VoiceProtectionDeniedError extends Error {
  readonly reasonCode: VoiceProtectionReasonCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    reasonCode: VoiceProtectionReasonCode;
    message: string;
    httpStatus?: number;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'VoiceProtectionDeniedError';
    this.reasonCode = params.reasonCode;
    this.httpStatus = params.httpStatus ?? 403;
    this.details = params.details;
  }
}

export function toProtectionHttpException(error: VoiceProtectionDeniedError) {
  const body = {
    message: error.message,
    reasonCode: error.reasonCode,
    details: error.details ?? null,
  };
  if (error.httpStatus === 400) {
    return new BadRequestException(body);
  }
  return new ForbiddenException(body);
}
