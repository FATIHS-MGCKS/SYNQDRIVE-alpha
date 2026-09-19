#!/usr/bin/env ts-node
/**
 * EXP-021 KS MX 2024 — single-family canary operator enrollment CLI.
 * Manual invocation only. No HTTP endpoint. No automatic cron.
 *
 * Default: DRY RUN (no DB writes, no BullMQ jobs, no provider calls).
 * Execute requires explicit --execute flag.
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
  EXP021_KS_MX_2024_CANARY,
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

function parseCliArgs(): Exp021CanaryEnrollCliArgs {
  const tokenIdRaw = parseArgValue('--token-id');
  if (!tokenIdRaw) {
    throw new Exp021MaturationShadowFamilyIdentityError('--token-id is required');
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
      'Provide --canonical-window-to <ISO> or --wait-next-window',
    );
  }

  return {
    tokenId,
    execute: hasFlag('--execute'),
    waitNextWindow: hasFlag('--wait-next-window'),
    canonicalWindowTo,
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

async function main(): Promise<void> {
  const args = parseCliArgs();
  const cohortMember = resolveCliCohortMember(args.tokenId);
  const app = await bootstrapExp021CanaryEnrollApplicationContext({
    logger: ['error', 'warn', 'log'],
  });

  try {
    const { config, repository, enrollment, prisma } = resolveExp021CanaryEnrollNestServices(app);
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

    const output = {
      WINDOW_CLOSE_AUTHORITY: EXP021_CANARY_WINDOW_CLOSE_AUTHORITY,
      CANONICAL_WINDOW_TO_AUTHORITY: EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY,
      ACTIVITY_AUTHORITY: EXP021_CANARY_ACTIVITY_AUTHORITY,
      POLICY_DELAY_AUTHORITY: EXP021_CANARY_POLICY_DELAY_AUTHORITY,
      ...formatCanaryCliOutput(result, args.execute ? 'EXECUTE' : 'DRY_RUN'),
    };

    console.log(JSON.stringify(output, null, 2));
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
