import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY,
  type Exp021PhysicalDriveIntervalAuthority,
} from '../reference-capture-exp-021-motion.lib';
import {
  classifyActivityForGeometry,
  type Exp021MaturationShadowActivityAuthorityByGeometry,
  type Exp021MaturationShadowActivityClassification,
} from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import {
  resolveGeometryActivityAuthorityByWindow,
  type Exp021CanarySpeedObservation,
} from './reference-capture-exp021-maturation-shadow-canary-activity.lib';
import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import type { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import type { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { resolveExp021MaturationShadowRuntimeBuildSha } from './reference-capture-exp021-maturation-shadow-runtime-sha.lib';
import {
  buildFrozenFamilySchedule,
  resolvePolicyDelayProbeMs,
} from './reference-capture-exp021-maturation-shadow-schedule.lib';
import {
  EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS,
  EXP021_CANARY_WAIT_NEXT_WINDOW_POLL_MS,
  EXP021_CANARY_WAIT_NEXT_WINDOW_TIMEOUT_MS,
  EXP021_KS_MX_2024_CANARY,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1 } from './reference-capture-exp021-maturation-shadow.types';

export type Exp021CanaryEnrollCliArgs = {
  tokenId: number;
  execute: boolean;
  waitNextWindow: boolean;
  canonicalWindowTo?: Date;
};

export type Exp021CanaryGuardSnapshot = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  globalEnabled: boolean;
  hfLaneEnabled: boolean;
  settlementLaneEnabled: boolean;
  allowlistTokenIds: number[];
  maxActiveFamilies: number;
  runtimeSha: string;
  authoritativeTokenId: number;
  activeUnfinishedFamilies: number;
};

export type Exp021CanaryWindowFreshnessDiagnostic = {
  physicalEndAt: string;
  detectedAt: string;
  windowDetectionLagMs: number;
  freshnessGuardMs: number;
  remainingEnrollmentBudgetMs: number;
  stale: boolean;
};

export type Exp021CanaryDryRunPlan = {
  enrollmentEventId: string;
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  canonicalWindowTo: Date;
  windowCloseAuthority: string;
  authoritativeWindowMatch: boolean;
  windowAgeAtEnrollmentMs: number;
  staleWindow: boolean;
  policyDelayProbeMs: number;
  scheduleVersion: string;
  plannedAgesMsExact: number[];
  lanesToEnroll: Array<'HF_FAST_LOOP' | 'SETTLEMENT_SHADOW'>;
  activityClassification60s: Exp021MaturationShadowActivityClassification;
  activityClassification90s: Exp021MaturationShadowActivityClassification;
  expectedStratumCount: number;
  expectedSlotCount: number;
  expectedEnqueuedJobCount: number;
  windowFreshnessDiagnostic?: Exp021CanaryWindowFreshnessDiagnostic;
  staleWindowsSkipped?: number;
};

export type Exp021CanaryEnrollSuccess = Exp021CanaryDryRunPlan & {
  familyId: string;
  stratumCount: number;
  slotCount: number;
  enqueuedJobCount: number;
};

const AUTHORITATIVE_PHYSICAL_END_SOURCES: ReadonlySet<Exp021PhysicalDriveIntervalAuthority['source']> =
  new Set(['ORCHESTRATOR_CONFIRMED', 'PDI_CANDIDATE']);

export function readPhysicalDriveIntervalAuthority(
  metadataJson: unknown,
): Exp021PhysicalDriveIntervalAuthority | null {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) {
    return null;
  }
  const raw = (metadataJson as Record<string, unknown>)[EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Exp021PhysicalDriveIntervalAuthority;
  if (!record.physicalStartAt || !record.physicalEndAt) {
    return null;
  }
  return record;
}

export function isAuthoritativePhysicalDriveInterval(
  authority: Exp021PhysicalDriveIntervalAuthority,
): boolean {
  return AUTHORITATIVE_PHYSICAL_END_SOURCES.has(authority.source);
}

export function parseCanonicalWindowToIso(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Invalid --canonical-window-to ISO timestamp: ${value}`,
    );
  }
  return parsed;
}

export function evaluateWindowFreshness(
  canonicalWindowTo: Date,
  plannedAgesMsExact: number[],
  now: Date,
  executionSlackMs = EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS,
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

export function findAuthoritativePhysicalEndMatch(
  canonicalWindowTo: Date,
  experiments: Array<{ metadataJson: Prisma.JsonValue }>,
): {
  authoritativeWindowMatch: boolean;
  physicalEndAt: string | null;
  physicalEndSource: string | null;
} {
  const targetMs = canonicalWindowTo.getTime();
  for (const experiment of experiments) {
    const authority = readPhysicalDriveIntervalAuthority(experiment.metadataJson);
    if (!authority || !isAuthoritativePhysicalDriveInterval(authority)) {
      continue;
    }
    const physicalEndMs = Date.parse(authority.physicalEndAt);
    if (Number.isFinite(physicalEndMs) && physicalEndMs === targetMs) {
      return {
        authoritativeWindowMatch: true,
        physicalEndAt: authority.physicalEndAt,
        physicalEndSource: authority.source,
      };
    }
  }
  return {
    authoritativeWindowMatch: false,
    physicalEndAt: null,
    physicalEndSource: null,
  };
}

export function resolveActivityAuthorityForCanonicalWindow(
  speedObservations: Exp021CanarySpeedObservation[],
  canonicalWindowTo: Date,
): Exp021MaturationShadowActivityAuthorityByGeometry {
  return resolveGeometryActivityAuthorityByWindow(speedObservations, canonicalWindowTo);
}

export function buildCanaryDryRunPlan(input: {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  canonicalWindowTo: Date;
  config: ReferenceCaptureConfig;
  activityAuthorityByGeometry?: Exp021MaturationShadowActivityAuthorityByGeometry;
  enrollmentEventId?: string;
  now?: Date;
  windowCloseAuthority?: string;
  authoritativeWindowMatch?: boolean;
  windowFreshnessDiagnostic?: Exp021CanaryWindowFreshnessDiagnostic;
  staleWindowsSkipped?: number;
}): Exp021CanaryDryRunPlan {
  const hfPolicyBase = input.config.getHfRecoveryPolicyConfig();
  const policyDelayProbeMs = resolvePolicyDelayProbeMs(hfPolicyBase, input.tokenId);
  const schedule = buildFrozenFamilySchedule(policyDelayProbeMs);
  const freshness = evaluateWindowFreshness(
    input.canonicalWindowTo,
    schedule.plannedAgesMsExact,
    input.now ?? new Date(),
  );
  const lanesToEnroll: Array<'HF_FAST_LOOP' | 'SETTLEMENT_SHADOW'> = [];
  if (input.config.isExp021MaturationShadowHfLaneEnabled()) {
    lanesToEnroll.push('HF_FAST_LOOP');
  }
  if (input.config.isExp021MaturationShadowSettlementLaneEnabled()) {
    lanesToEnroll.push('SETTLEMENT_SHADOW');
  }
  const activityAuthority = input.activityAuthorityByGeometry ?? {};
  const activityClassification60s = classifyActivityForGeometry(
    60_000,
    activityAuthority[60_000] ?? {},
  );
  const activityClassification90s = classifyActivityForGeometry(
    90_000,
    activityAuthority[90_000] ?? {},
  );
  const expectedStratumCount = lanesToEnroll.length * 2;
  const expectedSlotCount = expectedStratumCount * schedule.plannedAgesMsExact.length;
  return {
    enrollmentEventId: input.enrollmentEventId ?? randomUUID(),
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tokenId: input.tokenId,
    canonicalWindowTo: input.canonicalWindowTo,
    windowCloseAuthority: input.windowCloseAuthority ?? 'OPERATOR_SUPPLIED.canonicalWindowTo',
    authoritativeWindowMatch: input.authoritativeWindowMatch ?? false,
    windowAgeAtEnrollmentMs: freshness.windowAgeAtEnrollmentMs,
    staleWindow: freshness.stale,
    policyDelayProbeMs,
    scheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
    plannedAgesMsExact: schedule.plannedAgesMsExact,
    lanesToEnroll,
    activityClassification60s,
    activityClassification90s,
    expectedStratumCount,
    expectedSlotCount,
    expectedEnqueuedJobCount: expectedSlotCount,
    windowFreshnessDiagnostic: input.windowFreshnessDiagnostic,
    staleWindowsSkipped: input.staleWindowsSkipped,
  };
}

export async function assertCanaryHardGuards(input: {
  tokenId: number;
  config: ReferenceCaptureConfig;
  repository: Pick<
    ReferenceCaptureExp021MaturationShadowRepository,
    'resolveAuthoritativeTokenId' | 'countUnfinishedFamilies'
  >;
}): Promise<Exp021CanaryGuardSnapshot> {
  const canary = EXP021_KS_MX_2024_CANARY;
  if (input.tokenId !== canary.tokenId) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Canary operator CLI requires tokenId ${canary.tokenId}, received ${input.tokenId}`,
    );
  }

  const globalEnabled = input.config.isExp021MaturationShadowEnabled();
  const hfLaneEnabled = input.config.isExp021MaturationShadowHfLaneEnabled();
  const settlementLaneEnabled = input.config.isExp021MaturationShadowSettlementLaneEnabled();
  const allowlistTokenIds = input.config.getExp021MaturationShadowAllowlistTokenIds();
  const maxActiveFamilies = input.config.getExp021MaturationShadowMaxActiveFamilies();

  if (!globalEnabled) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'EXP021 maturation shadow is disabled (EXP021_MATURATION_SHADOW_ENABLED=false)',
    );
  }
  if (!hfLaneEnabled) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'HF lane disabled (EXP021_MATURATION_SHADOW_HF_LANE_ENABLED=false)',
    );
  }
  if (!settlementLaneEnabled) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Settlement lane disabled (EXP021_MATURATION_SHADOW_SETTLEMENT_LANE_ENABLED=false)',
    );
  }
  if (allowlistTokenIds.length !== 1 || allowlistTokenIds[0] !== canary.tokenId) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Allowlist must contain exactly token ${canary.tokenId}, got [${allowlistTokenIds.join(', ')}]`,
    );
  }
  if (maxActiveFamilies !== 1) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `maxActiveFamilies must be exactly 1 for canary, got ${maxActiveFamilies}`,
    );
  }

  const authoritativeTokenId = await input.repository.resolveAuthoritativeTokenId(
    canary.organizationId,
    canary.vehicleId,
    canary.tokenId,
  );

  if (authoritativeTokenId == null || authoritativeTokenId !== canary.tokenId) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Authoritative token binding mismatch: expected ${canary.tokenId}, resolved ${String(authoritativeTokenId)}`,
    );
  }

  const activeUnfinishedFamilies = await input.repository.countUnfinishedFamilies();
  if (activeUnfinishedFamilies >= 1) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Active unfinished maturation shadow families must be 0 before enrollment, found ${activeUnfinishedFamilies}`,
    );
  }

  const runtimeSha = resolveExp021MaturationShadowRuntimeBuildSha({ required: true });

  return {
    organizationId: canary.organizationId,
    vehicleId: canary.vehicleId,
    tokenId: canary.tokenId,
    globalEnabled,
    hfLaneEnabled,
    settlementLaneEnabled,
    allowlistTokenIds,
    maxActiveFamilies,
    runtimeSha,
    authoritativeTokenId,
    activeUnfinishedFamilies,
  };
}

export type Exp021CanaryWindowPollDeps = {
  listSettlementShadowExperiments: () => Promise<
    Array<{ id: string; metadataJson: Prisma.JsonValue; updatedAt: Date }>
  >;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  config: ReferenceCaptureConfig;
  tokenId: number;
};

export type Exp021CanaryWaitWindowResult = {
  canonicalWindowTo: Date;
  experimentId: string;
  physicalEndSource: string;
  physicalEndAt: string;
  detectedAt: Date;
  windowDetectionLagMs: number;
  freshnessGuardMs: number;
  remainingEnrollmentBudgetMs: number;
  staleWindowsSkipped: number;
};

export async function waitForNextFreshAuthoritativeWindowClose(
  deps: Exp021CanaryWindowPollDeps,
  options: {
    afterPhysicalEndMs: number;
    timeoutMs?: number;
    pollMs?: number;
  },
): Promise<Exp021CanaryWaitWindowResult> {
  const timeoutMs = options.timeoutMs ?? EXP021_CANARY_WAIT_NEXT_WINDOW_TIMEOUT_MS;
  const pollMs = options.pollMs ?? EXP021_CANARY_WAIT_NEXT_WINDOW_POLL_MS;
  const startedMs = deps.now().getTime();
  const rejectedPhysicalEndMs = new Set<number>();
  let staleWindowsSkipped = 0;

  const hfPolicyBase = deps.config.getHfRecoveryPolicyConfig();
  const policyDelayProbeMs = resolvePolicyDelayProbeMs(hfPolicyBase, deps.tokenId);
  const schedule = buildFrozenFamilySchedule(policyDelayProbeMs);

  while (deps.now().getTime() - startedMs < timeoutMs) {
    const experiments = await deps.listSettlementShadowExperiments();
    const candidates: Array<{
      experimentId: string;
      physicalEndMs: number;
      physicalEndAt: string;
      physicalEndSource: string;
    }> = [];

    for (const experiment of experiments) {
      const authority = readPhysicalDriveIntervalAuthority(experiment.metadataJson);
      if (!authority || !isAuthoritativePhysicalDriveInterval(authority)) {
        continue;
      }
      const physicalEndMs = Date.parse(authority.physicalEndAt);
      if (
        !Number.isFinite(physicalEndMs) ||
        physicalEndMs <= options.afterPhysicalEndMs ||
        rejectedPhysicalEndMs.has(physicalEndMs)
      ) {
        continue;
      }
      candidates.push({
        experimentId: experiment.id,
        physicalEndMs,
        physicalEndAt: authority.physicalEndAt,
        physicalEndSource: authority.source,
      });
    }

    candidates.sort((a, b) => a.physicalEndMs - b.physicalEndMs);

    for (const candidate of candidates) {
      const detectedAt = deps.now();
      const windowDetectionLagMs = Math.max(0, detectedAt.getTime() - candidate.physicalEndMs);
      const freshness = evaluateWindowFreshness(
        new Date(candidate.physicalEndMs),
        schedule.plannedAgesMsExact,
        detectedAt,
      );

      if (freshness.stale) {
        staleWindowsSkipped += 1;
        rejectedPhysicalEndMs.add(candidate.physicalEndMs);
        continue;
      }

      return {
        canonicalWindowTo: new Date(candidate.physicalEndMs),
        experimentId: candidate.experimentId,
        physicalEndSource: candidate.physicalEndSource,
        physicalEndAt: candidate.physicalEndAt,
        detectedAt,
        windowDetectionLagMs,
        freshnessGuardMs: freshness.freshnessGuardMs,
        remainingEnrollmentBudgetMs: freshness.remainingEnrollmentBudgetMs,
        staleWindowsSkipped,
      };
    }

    await deps.sleep(pollMs);
  }

  throw new Exp021MaturationShadowFamilyIdentityError(
    `Timed out waiting for next fresh authoritative KS MX 2024 physical drive window close (staleWindowsSkipped=${staleWindowsSkipped})`,
  );
}

/** @deprecated Use waitForNextFreshAuthoritativeWindowClose */
export async function waitForNextAuthoritativeWindowClose(
  deps: Omit<Exp021CanaryWindowPollDeps, 'config' | 'tokenId'> & {
    config?: ReferenceCaptureConfig;
    tokenId?: number;
  },
  options: {
    afterPhysicalEndMs: number;
    timeoutMs?: number;
    pollMs?: number;
  },
): Promise<{ canonicalWindowTo: Date; experimentId: string; physicalEndSource: string }> {
  const result = await waitForNextFreshAuthoritativeWindowClose(
    {
      ...deps,
      config:
        deps.config ??
        ({
          getHfRecoveryPolicyConfig: () => ({
            mode: 'V2' as const,
            settlementDelayMs: 8_000,
            recoveryOverlapMs: 6_000,
            hfHistoricalPollIntervalMs: 30_000,
            recoverySweepEnabled: false,
            recoverySweepIntervalMs: 60_000,
            recoverySweepLookbackMs: 300_000,
            canaryOnly: false,
            canaryTokenIds: [],
            availabilityCalibrationEnabled: false,
          }),
        } as unknown as ReferenceCaptureConfig),
      tokenId: deps.tokenId ?? EXP021_KS_MX_2024_CANARY.tokenId,
    },
    options,
  );
  return {
    canonicalWindowTo: result.canonicalWindowTo,
    experimentId: result.experimentId,
    physicalEndSource: result.physicalEndSource,
  };
}

export async function executeCanaryEnrollment(input: {
  args: Exp021CanaryEnrollCliArgs;
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureExp021MaturationShadowRepository;
  enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  activityAuthorityByGeometry?: Exp021MaturationShadowActivityAuthorityByGeometry;
  canonicalWindowTo?: Date;
  windowCloseAuthority?: string;
  authoritativeWindowMatch?: boolean;
  now?: Date;
  windowFreshnessDiagnostic?: Exp021CanaryWindowFreshnessDiagnostic;
  staleWindowsSkipped?: number;
  settlementShadowExperiments?: Array<{ metadataJson: Prisma.JsonValue }>;
}): Promise<Exp021CanaryDryRunPlan | Exp021CanaryEnrollSuccess> {
  const guards = await assertCanaryHardGuards({
    tokenId: input.args.tokenId,
    config: input.config,
    repository: input.repository,
  });

  const canonicalWindowTo = input.canonicalWindowTo;
  const windowCloseAuthority = input.windowCloseAuthority ?? 'OPERATOR_SUPPLIED.canonicalWindowTo';

  if (!canonicalWindowTo) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'canonicalWindowTo is required (use --canonical-window-to or --wait-next-window)',
    );
  }

  let authoritativeWindowMatch = input.authoritativeWindowMatch ?? false;
  if (input.settlementShadowExperiments) {
    const match = findAuthoritativePhysicalEndMatch(
      canonicalWindowTo,
      input.settlementShadowExperiments,
    );
    authoritativeWindowMatch = match.authoritativeWindowMatch;
    if (match.authoritativeWindowMatch && match.physicalEndSource) {
      authoritativeWindowMatch = true;
    }
  }

  if (input.args.execute && !input.args.waitNextWindow && !authoritativeWindowMatch) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Execute requires authoritative persisted physicalEndAt match for --canonical-window-to',
    );
  }

  const plan = buildCanaryDryRunPlan({
    organizationId: guards.organizationId,
    vehicleId: guards.vehicleId,
    tokenId: guards.tokenId,
    canonicalWindowTo,
    config: input.config,
    activityAuthorityByGeometry: input.activityAuthorityByGeometry,
    now: input.now,
    windowCloseAuthority,
    authoritativeWindowMatch,
    windowFreshnessDiagnostic: input.windowFreshnessDiagnostic,
    staleWindowsSkipped: input.staleWindowsSkipped,
  });

  if (plan.staleWindow) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Stale canonicalWindowTo — WINDOW_AGE_AT_ENROLLMENT_MS=${plan.windowAgeAtEnrollmentMs}`,
    );
  }

  if (!input.args.execute) {
    return plan;
  }

  const result = await input.enrollment.enrollWindowFamily({
    organizationId: guards.organizationId,
    vehicleId: guards.vehicleId,
    tokenId: guards.tokenId,
    canonicalWindowTo,
    enrollmentEventId: plan.enrollmentEventId,
    activityAuthorityByGeometry: input.activityAuthorityByGeometry,
  });

  const activeAfter = await input.repository.countUnfinishedFamilies();
  if (activeAfter !== 1) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `Expected exactly 1 active unfinished family after enrollment, found ${activeAfter}`,
    );
  }

  return {
    ...plan,
    familyId: result.familyId,
    stratumCount: result.stratumCount,
    slotCount: result.slotCount,
    enqueuedJobCount: result.enqueuedJobCount,
  };
}

export function formatCanaryCliOutput(
  result: Exp021CanaryDryRunPlan | Exp021CanaryEnrollSuccess,
  mode: 'DRY_RUN' | 'EXECUTE',
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    MODE: mode,
    organizationId: result.organizationId,
    vehicleId: result.vehicleId,
    tokenId: result.tokenId,
    enrollmentEventId: result.enrollmentEventId,
    canonicalWindowTo: result.canonicalWindowTo.toISOString(),
    WINDOW_CLOSE_AUTHORITY: result.windowCloseAuthority,
    AUTHORITATIVE_WINDOW_MATCH: result.authoritativeWindowMatch ? 'YES' : 'NO',
    WINDOW_AGE_AT_ENROLLMENT_MS: result.windowAgeAtEnrollmentMs,
    ENROLLMENT_REJECTED_STALE_WINDOW: result.staleWindow ? 'YES' : 'NO',
    scheduleVersion: result.scheduleVersion,
    policyDelayProbeMs: result.policyDelayProbeMs,
    plannedAgesMsExact: result.plannedAgesMsExact,
    lanesToEnroll: result.lanesToEnroll,
    HF_LANE_ENABLED: result.lanesToEnroll.includes('HF_FAST_LOOP'),
    SETTLEMENT_LANE_ENABLED: result.lanesToEnroll.includes('SETTLEMENT_SHADOW'),
    activityClassification60s: result.activityClassification60s.class,
    activityClassification90s: result.activityClassification90s.class,
    expectedStratumCount: result.expectedStratumCount,
    expectedSlotCount: result.expectedSlotCount,
    expectedEnqueuedJobCount: result.expectedEnqueuedJobCount,
    EXPECTED_PROVIDER_CALLS_DURING_ENROLLMENT: 0,
    KILL_SWITCH_GUIDANCE:
      'Set EXP021_MATURATION_SHADOW_ENABLED=false and perform a rolling PM2 restart to halt shadow execution.',
  };

  if (result.windowFreshnessDiagnostic) {
    base.physicalEndAt = result.windowFreshnessDiagnostic.physicalEndAt;
    base.detectedAt = result.windowFreshnessDiagnostic.detectedAt;
    base.WINDOW_DETECTION_LAG_MS = result.windowFreshnessDiagnostic.windowDetectionLagMs;
    base.freshnessGuardMs = result.windowFreshnessDiagnostic.freshnessGuardMs;
    base.remainingEnrollmentBudgetMs = result.windowFreshnessDiagnostic.remainingEnrollmentBudgetMs;
  }

  if (result.staleWindowsSkipped != null) {
    base.STALE_WINDOWS_SKIPPED = result.staleWindowsSkipped;
  }

  if ('familyId' in result) {
    return {
      ...base,
      familyId: result.familyId,
      stratumCount: result.stratumCount,
      slotCount: result.slotCount,
      enqueuedJobCount: result.enqueuedJobCount,
    };
  }

  return base;
}

export { EXP021_CANARY_SPEED_PROVIDER_FIELDS } from './reference-capture-exp021-maturation-shadow-canary-activity.lib';
