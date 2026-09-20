import type { Exp021PhysicalDriveIntervalAuthority } from '../reference-capture-exp-021-motion.lib';
import { EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO_ENV } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation.constants';

export type Exp021MaturationEnrollmentFreshnessMode =
  | 'OPERATOR_IMMEDIATE'
  | 'PROSPECTIVE_PDI_DISCOVERY';

/**
 * Wall-clock guard for operator-supplied canonicalWindowTo at execute time:
 * enrollment must begin before the first planned observation age (minus slack).
 */
export function evaluateOperationalEnrollmentFreshness(
  canonicalWindowTo: Date,
  plannedAgesMsExact: number[],
  now: Date,
  executionSlackMs: number,
): {
  windowAgeAtEnrollmentMs: number;
  stale: boolean;
  earliestPlannedAgeMs: number;
  freshnessGuardMs: number;
  remainingEnrollmentBudgetMs: number;
} {
  const windowAgeAtEnrollmentMs = Math.max(0, now.getTime() - canonicalWindowTo.getTime());
  const earliestPlannedAgeMs = Math.min(...plannedAgesMsExact);
  const freshnessGuardMs = earliestPlannedAgeMs - executionSlackMs;
  const stale = windowAgeAtEnrollmentMs >= freshnessGuardMs;
  const remainingEnrollmentBudgetMs = freshnessGuardMs - windowAgeAtEnrollmentMs;
  return {
    windowAgeAtEnrollmentMs,
    stale,
    earliestPlannedAgeMs,
    freshnessGuardMs,
    remainingEnrollmentBudgetMs,
  };
}

export function resolveCanaryMaturationActivationNotBeforeMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO_ENV];
  if (!raw) {
    return 0;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

/**
 * Enrollment cursor for cohort watch: only windows strictly after the last enrolled
 * canonical end (per vehicle). Unenrolled prospective PDIs remain visible across restarts.
 */
export function computeCanaryEnrollmentCursorPhysicalEndMs(input: {
  maxEnrolledCanonicalWindowToMs: number | null;
  activationNotBeforeMs: number;
}): number {
  const enrolledMax = input.maxEnrolledCanonicalWindowToMs ?? Number.NEGATIVE_INFINITY;
  return Math.max(enrolledMax, input.activationNotBeforeMs - 1);
}

export type ProspectiveAuthoritativePdiEligibility = {
  eligible: boolean;
  rejectionReason?:
    | 'physical_start_before_activation_not_before'
    | 'physical_end_not_after_enrollment_cursor'
    | 'invalid_physical_interval';
};

export function evaluateProspectiveAuthoritativePdiEligibility(input: {
  authority: Exp021PhysicalDriveIntervalAuthority;
  physicalEndMs: number;
  activationNotBeforeMs: number;
  enrollmentCursorPhysicalEndMs: number;
}): ProspectiveAuthoritativePdiEligibility {
  const startMs = Date.parse(input.authority.physicalStartAt);
  const endMs = Date.parse(input.authority.physicalEndAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { eligible: false, rejectionReason: 'invalid_physical_interval' };
  }
  if (startMs < input.activationNotBeforeMs) {
    return {
      eligible: false,
      rejectionReason: 'physical_start_before_activation_not_before',
    };
  }
  if (input.physicalEndMs <= input.enrollmentCursorPhysicalEndMs) {
    return {
      eligible: false,
      rejectionReason: 'physical_end_not_after_enrollment_cursor',
    };
  }
  return { eligible: true };
}
