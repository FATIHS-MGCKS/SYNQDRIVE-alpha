import type { ReferenceCaptureConfig } from '../reference-capture.config';
import type {
  Exp021CanaryCohortAuthority,
  Exp021CanaryCohortMember,
} from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { resolveExp021MaturationCanaryCohortFromEnv } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { waitForNextCanaryWindowWithRefreshingDb } from './reference-capture-exp021-maturation-shadow-canary-cli-wiring.lib';
import type { Exp021CanarySpeedObservation } from './reference-capture-exp021-maturation-shadow-canary-activity.lib';
import {
  executeCanaryEnrollment,
  resolveActivityAuthorityForCanonicalWindow,
  type Exp021CanaryEnrollCliArgs,
  type Exp021CanaryEnrollSuccess,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { EXP021_CANARY_WINDOW_CLOSE_AUTHORITY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import type { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import type { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import type { Exp021CohortMaturationMemberDeps } from './reference-capture-exp021-maturation-shadow-canary-cohort-operator.lib';
import { resolveExp021MaturationShadowRuntimeBuildSha } from './reference-capture-exp021-maturation-shadow-runtime-sha.lib';
import {
  shouldEmitPdiDiscoveryDiagnostic,
  updatePdiWatchState,
  type Exp021CohortMemberPdiWatchState,
} from './reference-capture-exp021-maturation-shadow-canary-cohort-watch-observability.lib';

export const EXP021_COHORT_WATCH_MEMBER_ERROR_BACKOFF_MS_DEFAULT = 5_000;
export const EXP021_COHORT_WATCH_MEMBER_SUCCESS_COOLDOWN_MS_DEFAULT = 250;
export const EXP021_COHORT_WATCH_DIAGNOSTICS_INTERVAL_MS_DEFAULT = 60_000;

export type Exp021CohortWatchStartupReport = {
  MODE: 'COHORT_WATCH' | 'TOKEN_SCOPED';
  COHORT_SIZE: number;
  COHORT_MEMBERS: Array<{
    label?: string;
    vehicleId: string;
    tokenId: number;
    organizationId: string;
  }>;
  EXECUTE: boolean;
  RUNTIME_SHA: string;
};

export type Exp021CohortWatchDiagnostics = {
  ACTIVE_MEMBER_WATCHERS: number;
  MEMBER_FAILURE_COUNT: Record<string, number>;
  FAMILIES_ENROLLED_THIS_RUN: Record<string, number>;
  LAST_ENROLLMENT_BY_MEMBER: Record<string, string | null>;
};

export type Exp021CohortMemberCycleResult =
  | { outcome: 'enrolled'; familyId: string; canonicalWindowTo: string }
  | { outcome: 'dry_run'; canonicalWindowTo: string }
  | { outcome: 'skipped'; reason: string };

export type Exp021CohortMemberCycleInput = {
  member: Exp021CanaryCohortMember;
  cohort: Exp021CanaryCohortAuthority;
  execute: boolean;
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  deps: Exp021CohortMaturationMemberDeps;
  loadSpeedObservationsForWindow: (
    member: Exp021CanaryCohortMember,
    canonicalWindowTo: Date,
  ) => Promise<Exp021CanarySpeedObservation[]>;
};

export async function runDefaultCohortMemberCycle(
  input: Exp021CohortMemberCycleInput,
  pdiWatchState?: Exp021CohortMemberPdiWatchState,
): Promise<Exp021CohortMemberCycleResult> {
  const baseline = await input.deps.loadSettlementShadowExperiments();
  const enrollmentCursorPhysicalEndMs =
    await input.deps.resolveEnrollmentCursorPhysicalEndMs();
  const waited = await waitForNextCanaryWindowWithRefreshingDb(
    {
      startupBaselineExperiments: baseline,
      loadSettlementShadowExperiments: input.deps.loadSettlementShadowExperiments,
      sleep: input.deps.sleep,
      now: input.deps.now,
      config: input.config,
      tokenId: input.member.tokenId,
      onProspectivePdiCandidate: (event) => {
        if (
          pdiWatchState &&
          shouldEmitPdiDiscoveryDiagnostic(
            pdiWatchState,
            Date.parse(event.physicalEndAt),
            event.rejectionReason,
            event.freshnessDecision,
          )
        ) {
          updatePdiWatchState(
            pdiWatchState,
            Date.parse(event.physicalEndAt),
            event.rejectionReason,
            event.freshnessDecision,
          );
          input.deps.onPdiDiscoveryDiagnostic?.({
            COHORT_PDI_DISCOVERY: {
              vehicleId: input.member.vehicleId,
              tokenId: input.member.tokenId,
              PDI_DISCOVERED: 'YES',
              PDI_PHYSICAL_END_AT: event.physicalEndAt,
              PDI_DISCOVERED_AT: event.pdiDiscoveredAt.toISOString(),
              PDI_AGE_MS: event.pdiAgeMs,
              FRESHNESS_DECISION: event.freshnessDecision,
              REJECTION_REASON: event.rejectionReason,
              BASELINE_AFTER_PHYSICAL_END_MS: event.enrollmentCursorPhysicalEndMs,
              ENROLLMENT_ATTEMPTED: 'NO',
            },
          });
        }
      },
    },
    {
      cohortProspectiveDiscovery: {
        activationNotBeforeMs: input.deps.activationNotBeforeMs,
        enrollmentCursorPhysicalEndMs,
      },
    },
  );

  const canonicalWindowTo = waited.canonicalWindowTo;
  const speedObservations = await input.loadSpeedObservationsForWindow(
    input.member,
    canonicalWindowTo,
  );
  const activityAuthorityByGeometry = resolveActivityAuthorityForCanonicalWindow(
    speedObservations,
    canonicalWindowTo,
  );

  const result = await executeCanaryEnrollment({
    args: {
      tokenId: input.member.tokenId,
      execute: input.execute,
      waitNextWindow: true,
    },
    config: input.config,
    cohort: input.cohort,
    repository: input.repository,
    enrollment: input.enrollment,
    activityAuthorityByGeometry,
    canonicalWindowTo,
    windowCloseAuthority: `${EXP021_CANARY_WINDOW_CLOSE_AUTHORITY}@${waited.physicalEndSource}`,
    authoritativeWindowMatch: true,
    windowFreshnessDiagnostic: {
      physicalEndAt: waited.physicalEndAt,
      detectedAt: waited.detectedAt.toISOString(),
      windowDetectionLagMs: waited.windowDetectionLagMs,
      freshnessGuardMs: waited.freshnessGuardMs,
      remainingEnrollmentBudgetMs: waited.remainingEnrollmentBudgetMs,
      stale: false,
    },
    staleWindowsSkipped: waited.staleWindowsSkipped,
    settlementShadowExperiments: baseline,
    now: input.deps.now(),
    enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
  });

  const windowIso = canonicalWindowTo.toISOString();
  if ('familyId' in result) {
    const success = result as Exp021CanaryEnrollSuccess;
    input.deps.onPdiDiscoveryDiagnostic?.({
      COHORT_PDI_DISCOVERY: {
        vehicleId: input.member.vehicleId,
        tokenId: input.member.tokenId,
        PDI_DISCOVERED: 'YES',
        PDI_PHYSICAL_END_AT: waited.physicalEndAt,
        PDI_DISCOVERED_AT: waited.detectedAt.toISOString(),
        PDI_AGE_MS: waited.windowDetectionLagMs,
        FRESHNESS_DECISION: 'PROSPECTIVE_ENROLLED',
        REJECTION_REASON: null,
        BASELINE_AFTER_PHYSICAL_END_MS: enrollmentCursorPhysicalEndMs,
        ENROLLMENT_ATTEMPTED: 'YES',
        FAMILY_ID: success.familyId,
      },
    });
    return { outcome: 'enrolled', familyId: success.familyId, canonicalWindowTo: windowIso };
  }
  return { outcome: 'dry_run', canonicalWindowTo: windowIso };
}

function memberKey(member: Exp021CanaryCohortMember): string {
  return member.vehicleId;
}

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
  });
}

export function buildCohortWatchStartupReport(input: {
  cohort: Exp021CanaryCohortAuthority;
  execute: boolean;
}): Exp021CohortWatchStartupReport {
  return {
    MODE: 'COHORT_WATCH',
    COHORT_SIZE: input.cohort.members.length,
    COHORT_MEMBERS: input.cohort.members.map((m) => ({
      label: m.label,
      vehicleId: m.vehicleId,
      tokenId: m.tokenId,
      organizationId: m.organizationId,
    })),
    EXECUTE: input.execute,
    RUNTIME_SHA: resolveExp021MaturationShadowRuntimeBuildSha({ required: true }),
  };
}

export function resolveCohortForWatchFromEnv(): Exp021CanaryCohortAuthority {
  const cohort = resolveExp021MaturationCanaryCohortFromEnv();
  if (!cohort) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Cohort watch requires valid EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON or EXP021_CANARY_LIVE_WINDOW_COHORT_JSON',
    );
  }
  return cohort;
}

export async function runCohortMemberWatchLoop(input: {
  member: Exp021CanaryCohortMember;
  cohort: Exp021CanaryCohortAuthority;
  execute: boolean;
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  deps: Exp021CohortMaturationMemberDeps;
  loadSpeedObservationsForWindow: Exp021CohortMemberCycleInput['loadSpeedObservationsForWindow'];
  runMemberCycle?: (cycle: Exp021CohortMemberCycleInput) => Promise<Exp021CohortMemberCycleResult>;
  signal: AbortSignal;
  diagnostics: Exp021CohortWatchDiagnostics;
  memberErrorBackoffMs?: number;
  memberSuccessCooldownMs?: number;
}): Promise<void> {
  const runCycle = input.runMemberCycle ?? runDefaultCohortMemberCycle;
  const errorBackoffMs =
    input.memberErrorBackoffMs ?? EXP021_COHORT_WATCH_MEMBER_ERROR_BACKOFF_MS_DEFAULT;
  const successCooldownMs =
    input.memberSuccessCooldownMs ?? EXP021_COHORT_WATCH_MEMBER_SUCCESS_COOLDOWN_MS_DEFAULT;
  const key = memberKey(input.member);
  const pdiWatchState: Exp021CohortMemberPdiWatchState = {
    lastPhysicalEndMs: null,
    lastRejectionReason: null,
    lastFreshnessDecision: null,
  };

  while (!input.signal.aborted) {
    try {
      const cycleResult = await runCycle(
        {
          member: input.member,
          cohort: input.cohort,
          execute: input.execute,
          config: input.config,
          repository: input.repository,
          enrollment: input.enrollment,
          deps: input.deps,
          loadSpeedObservationsForWindow: input.loadSpeedObservationsForWindow,
        },
        pdiWatchState,
      );

      if (cycleResult.outcome === 'enrolled') {
        input.diagnostics.FAMILIES_ENROLLED_THIS_RUN[key] =
          (input.diagnostics.FAMILIES_ENROLLED_THIS_RUN[key] ?? 0) + 1;
        input.diagnostics.LAST_ENROLLMENT_BY_MEMBER[key] = cycleResult.familyId;
      } else if (cycleResult.outcome === 'dry_run') {
        input.diagnostics.LAST_ENROLLMENT_BY_MEMBER[key] = cycleResult.canonicalWindowTo;
      }

      const pauseMs =
        cycleResult.outcome === 'skipped'
          ? Math.max(errorBackoffMs, 10)
          : successCooldownMs;
      if (!input.signal.aborted && pauseMs > 0) {
        await sleepAbortable(pauseMs, input.signal);
      }
    } catch (error) {
      if (input.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }
      input.diagnostics.MEMBER_FAILURE_COUNT[key] =
        (input.diagnostics.MEMBER_FAILURE_COUNT[key] ?? 0) + 1;
      try {
        await sleepAbortable(errorBackoffMs, input.signal);
      } catch {
        return;
      }
    }
  }
}

export async function runCohortMaturationWatchLoop(input: {
  cohort: Exp021CanaryCohortAuthority;
  execute: boolean;
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  memberDeps: (member: Exp021CanaryCohortMember) => Exp021CohortMaturationMemberDeps;
  loadSpeedObservationsForWindow: Exp021CohortMemberCycleInput['loadSpeedObservationsForWindow'];
  runMemberCycle?: (cycle: Exp021CohortMemberCycleInput) => Promise<Exp021CohortMemberCycleResult>;
  signal: AbortSignal;
  onDiagnostics?: (diagnostics: Exp021CohortWatchDiagnostics) => void;
  diagnosticsIntervalMs?: number;
  memberErrorBackoffMs?: number;
  memberSuccessCooldownMs?: number;
}): Promise<void> {
  const diagnostics: Exp021CohortWatchDiagnostics = {
    ACTIVE_MEMBER_WATCHERS: input.cohort.members.length,
    MEMBER_FAILURE_COUNT: {},
    FAMILIES_ENROLLED_THIS_RUN: {},
    LAST_ENROLLMENT_BY_MEMBER: {},
  };

  const diagnosticsIntervalMs =
    input.diagnosticsIntervalMs ?? EXP021_COHORT_WATCH_DIAGNOSTICS_INTERVAL_MS_DEFAULT;
  let diagnosticsTimer: ReturnType<typeof setInterval> | null = null;
  if (input.onDiagnostics) {
    diagnosticsTimer = setInterval(() => {
      input.onDiagnostics?.({ ...diagnostics });
    }, diagnosticsIntervalMs);
  }

  try {
    await Promise.all(
      input.cohort.members.map((member) =>
        runCohortMemberWatchLoop({
          member,
          cohort: input.cohort,
          execute: input.execute,
          config: input.config,
          repository: input.repository,
          enrollment: input.enrollment,
          deps: input.memberDeps(member),
          loadSpeedObservationsForWindow: input.loadSpeedObservationsForWindow,
          runMemberCycle: input.runMemberCycle,
          signal: input.signal,
          diagnostics,
          memberErrorBackoffMs: input.memberErrorBackoffMs,
          memberSuccessCooldownMs: input.memberSuccessCooldownMs,
        }),
      ),
    );
  } finally {
    if (diagnosticsTimer) {
      clearInterval(diagnosticsTimer);
    }
    input.onDiagnostics?.({ ...diagnostics });
  }
}
