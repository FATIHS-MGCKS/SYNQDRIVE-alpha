import { TireSetupStatus } from '@prisma/client';
import {
  validateJobTireSetupBinding,
  type TireSetupIdentitySnapshot,
} from './ai-tire-spec-job-binding.util';

export interface DirectAiTireSpecApplyIdentity {
  tireSize: string;
  loadIndex: string;
  speedIndex: string;
  tireSetupId?: string | null;
}

export type DirectAiTireSpecApplyGuardResult =
  | {
      ok: true;
      setup: TireSetupIdentitySnapshot;
      bindingReason: 'bound_setup' | 'single_active_setup';
    }
  | { ok: false; message: string; code?: string };

/**
 * Shared guard for legacy direct aiTireSpec apply (no job id).
 * Requires complete tire identity and validates setup binding like AiTireSpecJob apply.
 */
export function guardDirectAiTireSpecApply(args: {
  vehicleId: string;
  identity: DirectAiTireSpecApplyIdentity;
  activeSetups: TireSetupIdentitySnapshot[];
  boundSetup: TireSetupIdentitySnapshot | null;
}): DirectAiTireSpecApplyGuardResult {
  const tireSize = args.identity.tireSize?.trim();
  const loadIndex = args.identity.loadIndex?.trim();
  const speedIndex = args.identity.speedIndex?.trim();
  if (!tireSize || !loadIndex || !speedIndex) {
    return {
      ok: false,
      code: 'INCOMPLETE_APPLY_IDENTITY',
      message: 'Direct apply requires tireSize, loadIndex, and speedIndex for setup binding',
    };
  }

  const binding = validateJobTireSetupBinding(
    {
      tireSize,
      loadIndex,
      speedIndex,
      vehicleId: args.vehicleId,
      tireSetupId: args.identity.tireSetupId ?? null,
    },
    args.activeSetups.filter(
      (s) => s.removedAt == null && s.status === TireSetupStatus.ACTIVE,
    ),
    args.boundSetup,
  );

  if (!binding.ok) {
    return { ok: false, code: binding.code, message: binding.message };
  }

  const setup =
    args.identity.tireSetupId && args.boundSetup
      ? args.boundSetup
      : args.activeSetups.length === 1
        ? args.activeSetups[0]!
        : null;

  if (!setup) {
    return { ok: false, code: 'NO_APPLICABLE_SETUP', message: 'No applicable tire setup found' };
  }

  return { ok: true, setup, bindingReason: binding.reason };
}
