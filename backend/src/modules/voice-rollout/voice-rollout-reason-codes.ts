import { ForbiddenException } from '@nestjs/common';
import type { VoiceRolloutStatus } from '@prisma/client';
import type { VoiceRolloutPrerequisiteBlocker, VoiceRolloutSurface } from './voice-rollout.types';

export const VOICE_ROLLOUT_REASON_CODES = {
  GLOBAL_KILL_SWITCH: 'voice_rollout_global_kill_switch',
  TENANT_DISABLED: 'voice_rollout_tenant_disabled',
  TENANT_SUSPENDED: 'voice_rollout_tenant_suspended',
  TIER_INSUFFICIENT: 'voice_rollout_tier_insufficient',
  UNKNOWN_STATUS: 'voice_rollout_unknown_status',
  PREREQUISITE_FAILED: 'voice_rollout_prerequisite_failed',
  LEGACY_NOT_IN_PRODUCTION: 'voice_rollout_legacy_not_in_production',
  CONFIRMATION_REQUIRED: 'voice_rollout_confirmation_required',
  REASON_REQUIRED: 'voice_rollout_reason_required',
} as const;

export type VoiceRolloutReasonCode =
  (typeof VOICE_ROLLOUT_REASON_CODES)[keyof typeof VOICE_ROLLOUT_REASON_CODES];

export class VoiceRolloutDeniedError extends Error {
  readonly reasonCode: VoiceRolloutReasonCode;
  readonly httpStatus: number;
  readonly rolloutStatus: VoiceRolloutStatus;
  readonly surface: VoiceRolloutSurface;
  readonly blockers: VoiceRolloutPrerequisiteBlocker[];
  readonly details?: Record<string, unknown>;

  constructor(params: {
    reasonCode: VoiceRolloutReasonCode;
    message: string;
    rolloutStatus: VoiceRolloutStatus;
    surface: VoiceRolloutSurface;
    blockers?: VoiceRolloutPrerequisiteBlocker[];
    httpStatus?: number;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'VoiceRolloutDeniedError';
    this.reasonCode = params.reasonCode;
    this.httpStatus = params.httpStatus ?? 403;
    this.rolloutStatus = params.rolloutStatus;
    this.surface = params.surface;
    this.blockers = params.blockers ?? [];
    this.details = params.details;
  }
}

export function toRolloutHttpException(error: VoiceRolloutDeniedError) {
  return new ForbiddenException({
    message: error.message,
    reasonCode: error.reasonCode,
    rolloutStatus: error.rolloutStatus,
    surface: error.surface,
    blockers: error.blockers,
    details: error.details ?? null,
  });
}
