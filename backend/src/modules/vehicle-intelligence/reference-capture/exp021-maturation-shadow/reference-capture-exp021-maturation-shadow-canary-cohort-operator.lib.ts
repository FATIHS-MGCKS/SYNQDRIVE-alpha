import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { ReferenceCaptureConfig } from '../reference-capture.config';
import type {
  Exp021CanaryCohortAuthority,
  Exp021CanaryCohortMember,
} from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { resolveExp021MaturationCanaryCohortFromEnv } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { waitForNextCanaryWindowWithRefreshingDb } from './reference-capture-exp021-maturation-shadow-canary-cli-wiring.lib';
import {
  executeCanaryEnrollment,
  type Exp021CanaryEnrollCliArgs,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import type { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import type { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';

export type Exp021CohortMaturationMemberDeps = {
  member: Exp021CanaryCohortMember;
  loadSettlementShadowExperiments: () => Promise<
    Array<{ id: string; metadataJson: Prisma.JsonValue; updatedAt: Date }>
  >;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  activationNotBeforeMs: number;
  resolveEnrollmentCursorPhysicalEndMs: () => Promise<number>;
  onPdiDiscoveryDiagnostic?: (diagnostic: Record<string, unknown>) => void;
};

export function resolveCohortForMaturationOperator(
  cohortOverride?: Exp021CanaryCohortAuthority | null,
): Exp021CanaryCohortAuthority {
  const cohort = cohortOverride ?? resolveExp021MaturationCanaryCohortFromEnv();
  if (!cohort || cohort.members.length === 0) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'EXP-021 cohort operator requires EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON or EXP021_CANARY_LIVE_WINDOW_COHORT_JSON',
    );
  }
  return cohort;
}

/**
 * One logical watch iteration for a single cohort vehicle (wait-next-window + optional execute).
 * Failures are isolated per member when used inside runCohortMaturationWatchLoop.
 */
export async function runCohortMaturationMemberWaitIteration(input: {
  member: Exp021CanaryCohortMember;
  args: Pick<Exp021CanaryEnrollCliArgs, 'execute' | 'waitNextWindow'>;
  config: ReferenceCaptureConfig;
  cohort: Exp021CanaryCohortAuthority;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  deps: Exp021CohortMaturationMemberDeps;
}): Promise<unknown> {
  if (!input.args.waitNextWindow) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Cohort operator watch mode requires waitNextWindow',
    );
  }

  const baseline = await input.deps.loadSettlementShadowExperiments();
  const enrollmentCursorPhysicalEndMs =
    await input.deps.resolveEnrollmentCursorPhysicalEndMs();
  const waited = await waitForNextCanaryWindowWithRefreshingDb({
    startupBaselineExperiments: baseline,
    loadSettlementShadowExperiments: input.deps.loadSettlementShadowExperiments,
    sleep: input.deps.sleep,
    now: input.deps.now,
    config: input.config,
    tokenId: input.member.tokenId,
    onProspectivePdiCandidate: (event) => {
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
    },
  },
    {
      cohortProspectiveDiscovery: {
        activationNotBeforeMs: input.deps.activationNotBeforeMs,
        enrollmentCursorPhysicalEndMs,
      },
    },
  );

  return executeCanaryEnrollment({
    args: {
      tokenId: input.member.tokenId,
      execute: input.args.execute,
      waitNextWindow: true,
    },
    config: input.config,
    cohort: input.cohort,
    repository: input.repository,
    enrollment: input.enrollment,
    canonicalWindowTo: waited.canonicalWindowTo,
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
    enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
  });
}

/**
 * Runs one wait/enroll iteration per cohort member concurrently.
 * One member throwing does not reject the whole batch (isolated per-vehicle outcomes).
 */
export async function runCohortMaturationWatchIteration(input: {
  cohort: Exp021CanaryCohortAuthority;
  args: Pick<Exp021CanaryEnrollCliArgs, 'execute' | 'waitNextWindow'>;
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  memberDeps: (member: Exp021CanaryCohortMember) => Exp021CohortMaturationMemberDeps;
}): Promise<
  Array<{ member: Exp021CanaryCohortMember; ok: true; result: unknown } | { member: Exp021CanaryCohortMember; ok: false; error: string }>
> {
  const outcomes = await Promise.all(
    input.cohort.members.map(async (member) => {
      try {
        const result = await runCohortMaturationMemberWaitIteration({
          member,
          args: input.args,
          config: input.config,
          cohort: input.cohort,
          repository: input.repository,
          enrollment: input.enrollment,
          deps: input.memberDeps(member),
        });
        return { member, ok: true as const, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { member, ok: false as const, error: message };
      }
    }),
  );
  return outcomes;
}

export function buildSettlementShadowLoaderForMember(
  prisma: PrismaService,
  member: Exp021CanaryCohortMember,
) {
  return () =>
    prisma.referenceCaptureSettlementShadowExperiment.findMany({
      where: {
        organizationId: member.organizationId,
        vehicleId: member.vehicleId,
        tokenId: member.tokenId,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, metadataJson: true, updatedAt: true },
    });
}
