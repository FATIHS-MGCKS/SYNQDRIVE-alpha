#!/usr/bin/env ts-node
/**
 * EXP-021 maturation shadow canary operator enrollment CLI.
 * Manual invocation only. No HTTP endpoint. No automatic cron.
 *
 * Modes:
 *  - Token-scoped forensic: --token-id <id> + (--wait-next-window | --canonical-window-to)
 *  - Production cohort watch: --watch-cohort [--execute]
 *
 * Default: DRY RUN (no DB writes, no BullMQ jobs, no provider calls unless execute).
 */
import { PrismaService } from '@shared/database/prisma.service';
import {
  bootstrapExp021CanaryEnrollApplicationContext,
  resolveExp021CanaryEnrollNestServices,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-bootstrap.lib';
import {
  EXP021_CANARY_ACTIVITY_AUTHORITY,
  EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY,
  EXP021_CANARY_POLICY_DELAY_AUTHORITY,
  EXP021_CANARY_WINDOW_CLOSE_AUTHORITY,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { parseStrictCanaryTokenId } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-activity.lib';
import { waitForNextCanaryWindowWithRefreshingDb } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-cli-wiring.lib';
import {
  executeCanaryEnrollment,
  findAuthoritativePhysicalEndMatch,
  formatCanaryCliOutput,
  parseCanonicalWindowToIso,
  resolveActivityAuthorityForCanonicalWindow,
  EXP021_CANARY_SPEED_PROVIDER_FIELDS,
  type Exp021CanaryEnrollCliArgs,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import {
  resolveCohortForMaturationOperator,
  buildSettlementShadowLoaderForMember,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-cohort-operator.lib';
import {
  buildCohortWatchStartupReport,
  resolveCohortForWatchFromEnv,
  runCohortMaturationWatchLoop,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-cohort-watch.lib';
import { resolveExp021MaturationShadowRuntimeBuildSha } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-runtime-sha.lib';
import type { Exp021CanaryCohortMember } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { Exp021MaturationShadowFamilyIdentityError } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow.errors';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseArgValue(flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  const eqHit = process.argv.find((arg) => arg.startsWith(eqPrefix));
  if (eqHit) return eqHit.slice(eqPrefix.length);
  const index = process.argv.indexOf(flag);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return undefined;
}

type CliInvocation =
  | { mode: 'COHORT_WATCH'; execute: boolean }
  | { mode: 'TOKEN_SCOPED'; args: Exp021CanaryEnrollCliArgs };

function parseCliInvocation(): CliInvocation {
  const watchCohort = hasFlag('--watch-cohort');
  const tokenIdRaw = parseArgValue('--token-id');

  if (watchCohort && tokenIdRaw) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Use either --watch-cohort or --token-id, not both',
    );
  }

  if (watchCohort) {
    return { mode: 'COHORT_WATCH', execute: hasFlag('--execute') };
  }

  if (!tokenIdRaw) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Provide --watch-cohort for cohort operator mode or --token-id for token-scoped mode',
    );
  }

  let tokenId: number;
  try {
    tokenId = parseStrictCanaryTokenId(tokenIdRaw);
  } catch (error) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      error instanceof Error ? error.message : 'Invalid --token-id',
    );
  }

  const canonicalWindowToRaw = parseArgValue('--canonical-window-to');
  const canonicalWindowTo = canonicalWindowToRaw
    ? parseCanonicalWindowToIso(canonicalWindowToRaw)
    : undefined;

  if (hasFlag('--wait-next-window') && canonicalWindowTo) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Use either --wait-next-window or --canonical-window-to, not both',
    );
  }
  if (!hasFlag('--wait-next-window') && !canonicalWindowTo) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Token-scoped mode requires --canonical-window-to <ISO> or --wait-next-window',
    );
  }

  return {
    mode: 'TOKEN_SCOPED',
    args: {
      tokenId,
      execute: hasFlag('--execute'),
      waitNextWindow: hasFlag('--wait-next-window'),
      canonicalWindowTo,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCliCohortMember(tokenId: number): Exp021CanaryCohortMember {
  const cohort = resolveCohortForMaturationOperator();
  const member = cohort.membersByTokenId.get(tokenId);
  if (!member) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      `tokenId ${tokenId} is not in configured EXP-021 canary cohort`,
    );
  }
  return member;
}

async function loadSpeedObservationsForWindow(
  prisma: PrismaService,
  member: Exp021CanaryCohortMember,
  canonicalWindowTo: Date,
) {
  const windowFrom = new Date(canonicalWindowTo.getTime() - 90_000);
  return prisma.referenceCaptureObservation.findMany({
    where: {
      organizationId: member.organizationId,
      vehicleId: member.vehicleId,
      providerField: { in: [...EXP021_CANARY_SPEED_PROVIDER_FIELDS] },
      providerTimestamp: {
        gte: windowFrom,
        lte: canonicalWindowTo,
      },
    },
    orderBy: { providerTimestamp: 'asc' },
    select: {
      providerField: true,
      providerTimestamp: true,
      normalizedValueJson: true,
      rawValueJson: true,
    },
  });
}

async function runTokenScopedMode(
  args: Exp021CanaryEnrollCliArgs,
  prisma: PrismaService,
  config: Awaited<ReturnType<typeof resolveExp021CanaryEnrollNestServices>>['config'],
  repository: Awaited<ReturnType<typeof resolveExp021CanaryEnrollNestServices>>['repository'],
  enrollment: Awaited<ReturnType<typeof resolveExp021CanaryEnrollNestServices>>['enrollment'],
): Promise<void> {
  const cohortMember = resolveCliCohortMember(args.tokenId);
  const loadCanarySettlementShadowExperiments = buildSettlementShadowLoaderForMember(
    prisma,
    cohortMember,
  );

  const settlementShadowExperiments = await loadCanarySettlementShadowExperiments();

  let canonicalWindowTo = args.canonicalWindowTo;
  let windowCloseAuthority = EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY;
  let authoritativeWindowMatch = false;
  let windowFreshnessDiagnostic:
    | {
        physicalEndAt: string;
        detectedAt: string;
        windowDetectionLagMs: number;
        freshnessGuardMs: number;
        remainingEnrollmentBudgetMs: number;
        stale: boolean;
      }
    | undefined;
  let staleWindowsSkipped: number | undefined;

  if (args.waitNextWindow) {
    const waited = await waitForNextCanaryWindowWithRefreshingDb({
      startupBaselineExperiments: settlementShadowExperiments,
      loadSettlementShadowExperiments: loadCanarySettlementShadowExperiments,
      sleep,
      now: () => new Date(),
      config,
      tokenId: cohortMember.tokenId,
    });
    canonicalWindowTo = waited.canonicalWindowTo;
    windowCloseAuthority = `${EXP021_CANARY_WINDOW_CLOSE_AUTHORITY}@${waited.physicalEndSource}`;
    authoritativeWindowMatch = true;
    staleWindowsSkipped = waited.staleWindowsSkipped;
    windowFreshnessDiagnostic = {
      physicalEndAt: waited.physicalEndAt,
      detectedAt: waited.detectedAt.toISOString(),
      windowDetectionLagMs: waited.windowDetectionLagMs,
      freshnessGuardMs: waited.freshnessGuardMs,
      remainingEnrollmentBudgetMs: waited.remainingEnrollmentBudgetMs,
      stale: false,
    };
  } else if (canonicalWindowTo) {
    const match = findAuthoritativePhysicalEndMatch(
      canonicalWindowTo,
      settlementShadowExperiments,
    );
    authoritativeWindowMatch = match.authoritativeWindowMatch;
    if (match.authoritativeWindowMatch && match.physicalEndSource) {
      windowCloseAuthority = `${EXP021_CANARY_WINDOW_CLOSE_AUTHORITY}@${match.physicalEndSource}`;
    }
  }

  const speedObservations = await loadSpeedObservationsForWindow(
    prisma,
    cohortMember,
    canonicalWindowTo!,
  );
  const activityAuthorityByGeometry = resolveActivityAuthorityForCanonicalWindow(
    speedObservations,
    canonicalWindowTo!,
  );

  const result = await executeCanaryEnrollment({
    args,
    config,
    cohort: resolveCohortForMaturationOperator(),
    repository,
    enrollment,
    activityAuthorityByGeometry,
    canonicalWindowTo,
    windowCloseAuthority,
    authoritativeWindowMatch,
    settlementShadowExperiments,
    windowFreshnessDiagnostic,
    staleWindowsSkipped,
  });

  const startup = {
    MODE: 'TOKEN_SCOPED' as const,
    COHORT_SIZE: resolveCohortForMaturationOperator().members.length,
    COHORT_MEMBERS: resolveCohortForMaturationOperator().members.map((m) => ({
      label: m.label,
      vehicleId: m.vehicleId,
      tokenId: m.tokenId,
    })),
    EXECUTE: args.execute,
    RUNTIME_SHA: resolveExp021MaturationShadowRuntimeBuildSha({ required: true }),
  };

  const output = {
    ...startup,
    WINDOW_CLOSE_AUTHORITY: EXP021_CANARY_WINDOW_CLOSE_AUTHORITY,
    CANONICAL_WINDOW_TO_AUTHORITY: EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY,
    ACTIVITY_AUTHORITY: EXP021_CANARY_ACTIVITY_AUTHORITY,
    POLICY_DELAY_AUTHORITY: EXP021_CANARY_POLICY_DELAY_AUTHORITY,
    ...formatCanaryCliOutput(result, args.execute ? 'EXECUTE' : 'DRY_RUN'),
  };

  console.log(JSON.stringify(output, null, 2));
}

async function runCohortWatchMode(
  execute: boolean,
  prisma: PrismaService,
  config: Awaited<ReturnType<typeof resolveExp021CanaryEnrollNestServices>>['config'],
  repository: Awaited<ReturnType<typeof resolveExp021CanaryEnrollNestServices>>['repository'],
  enrollment: Awaited<ReturnType<typeof resolveExp021CanaryEnrollNestServices>>['enrollment'],
): Promise<void> {
  const cohort = resolveCohortForWatchFromEnv();
  const startup = buildCohortWatchStartupReport({ cohort, execute });
  console.log(JSON.stringify(startup, null, 2));

  const controller = new AbortController();
  const shutdown = () => {
    controller.abort();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await runCohortMaturationWatchLoop({
    cohort,
    execute,
    config,
    repository,
    enrollment,
    memberDeps: (member) => ({
      member,
      loadSettlementShadowExperiments: buildSettlementShadowLoaderForMember(prisma, member),
      sleep,
      now: () => new Date(),
    }),
    loadSpeedObservationsForWindow: (member, windowTo) =>
      loadSpeedObservationsForWindow(prisma, member, windowTo),
    signal: controller.signal,
    onDiagnostics: (diagnostics) => {
      console.log(
        JSON.stringify({
          COHORT_WATCH_DIAGNOSTICS: diagnostics,
        }),
      );
    },
  });
}

async function main(): Promise<void> {
  const invocation = parseCliInvocation();
  const app = await bootstrapExp021CanaryEnrollApplicationContext({
    logger: ['error', 'warn', 'log'],
  });

  try {
    const { config, repository, enrollment, prisma } = resolveExp021CanaryEnrollNestServices(app);
    if (invocation.mode === 'COHORT_WATCH') {
      await runCohortWatchMode(invocation.execute, prisma, config, repository, enrollment);
      return;
    }
    await runTokenScopedMode(invocation.args, prisma, config, repository, enrollment);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  if (error instanceof Exp021MaturationShadowFamilyIdentityError) {
    const stale = error.message.includes('Stale canonicalWindowTo');
    console.error(
      JSON.stringify(
        {
          error: error.message,
          code: error.code,
          ENROLLMENT_REJECTED_STALE_WINDOW: stale ? 'YES' : 'NO',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
