import { ForbiddenException } from '@nestjs/common';
import type { VoiceEntitlementCapability, VoiceEntitlementStatus } from './voice-entitlement.types';

/** Stable machine-readable codes for voice entitlement denials. */
export const VOICE_ENTITLEMENT_REASON_CODES = {
  NO_SUBSCRIPTION: 'voice_entitlement_no_subscription',
  SUBSCRIPTION_SUSPENDED: 'voice_entitlement_subscription_suspended',
  SUBSCRIPTION_CANCELLED: 'voice_entitlement_subscription_cancelled',
  SUBSCRIPTION_PAST_DUE: 'voice_entitlement_subscription_past_due',
  SUBSCRIPTION_PENDING: 'voice_entitlement_subscription_pending',
  CAPABILITY_DENIED: 'voice_entitlement_capability_denied',
  UNKNOWN_SUBSCRIPTION_STATUS: 'voice_entitlement_unknown_status',
  RETENTION_EXPIRED: 'voice_entitlement_retention_expired',
} as const;

export type VoiceEntitlementReasonCode =
  (typeof VOICE_ENTITLEMENT_REASON_CODES)[keyof typeof VOICE_ENTITLEMENT_REASON_CODES];

export class VoiceEntitlementDeniedError extends Error {
  readonly reasonCode: VoiceEntitlementReasonCode;
  readonly httpStatus: number;
  readonly entitlementStatus: VoiceEntitlementStatus;
  readonly capability: VoiceEntitlementCapability;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    reasonCode: VoiceEntitlementReasonCode;
    message: string;
    entitlementStatus: VoiceEntitlementStatus;
    capability: VoiceEntitlementCapability;
    httpStatus?: number;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'VoiceEntitlementDeniedError';
    this.reasonCode = params.reasonCode;
    this.httpStatus = params.httpStatus ?? 403;
    this.entitlementStatus = params.entitlementStatus;
    this.capability = params.capability;
    this.details = params.details;
  }
}

export function toEntitlementHttpException(error: VoiceEntitlementDeniedError) {
  return new ForbiddenException({
    message: error.message,
    reasonCode: error.reasonCode,
    entitlementStatus: error.entitlementStatus,
    capability: error.capability,
    details: error.details ?? null,
  });
}
