#!/usr/bin/env ts-node
/**
 * EXP-021 KS MX 2024 — single-family canary operator enrollment CLI.
 * Manual invocation only. No HTTP endpoint. No automatic cron.
 *
 * Default: DRY RUN (no DB writes, no BullMQ jobs, no provider calls).
 * Execute requires explicit --execute flag.
 */
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { AppModule } from '../../src/app.module';
import { ReferenceCaptureConfig } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.config';
import {
  EXP021_CANARY_ACTIVITY_AUTHORITY,
  EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY,
  EXP021_CANARY_POLICY_DELAY_AUTHORITY,
  EXP021_CANARY_WINDOW_CLOSE_AUTHORITY,
  EXP021_KS_MX_2024_CANARY,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  executeCanaryEnrollment,
  formatCanaryCliOutput,
  parseCanonicalWindowToIso,
  readPhysicalDriveIntervalAuthority,
  resolveActivityAuthorityFromSignalsLatest,
  waitForNextAuthoritativeWindowClose,
  type Exp021CanaryEnrollCliArgs,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { Exp021MaturationShadowFamilyIdentityError } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow.errors';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow.repository';

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
  const tokenId = Number.parseInt(tokenIdRaw, 10);
  if (!Number.isFinite(tokenId)) {
    throw new Exp021MaturationShadowFamilyIdentityError(`Invalid --token-id: ${tokenIdRaw}`);
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

async function main(): Promise<void> {
  const args = parseCliArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const config = app.get(ReferenceCaptureConfig);
    const repository = app.get(ReferenceCaptureExp021MaturationShadowRepository);
    const enrollment = app.get(ReferenceCaptureExp021MaturationShadowEnrollmentService);
    const prisma = app.get(PrismaService);

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: EXP021_KS_MX_2024_CANARY.vehicleId,
        organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      },
      select: { latestState: { select: { rawPayloadJson: true } } },
    });
    const activityAuthorityByGeometry = resolveActivityAuthorityFromSignalsLatest(
      vehicle?.latestState?.rawPayloadJson,
    );

    let canonicalWindowTo = args.canonicalWindowTo;
    let windowCloseAuthority = EXP021_CANARY_CANONICAL_WINDOW_TO_AUTHORITY;

    if (args.waitNextWindow) {
      const recent = await prisma.referenceCaptureSettlementShadowExperiment.findMany({
        where: {
          organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
          vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
          tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, metadataJson: true, updatedAt: true },
      });

      let afterPhysicalEndMs = 0;
      for (const experiment of recent) {
        const physical = readPhysicalDriveIntervalAuthority(experiment.metadataJson);
        const endMs = physical?.physicalEndAt ? Date.parse(physical.physicalEndAt) : NaN;
        if (Number.isFinite(endMs) && endMs > afterPhysicalEndMs) {
          afterPhysicalEndMs = endMs;
        }
      }

      const waited = await waitForNextAuthoritativeWindowClose(
        {
          listSettlementShadowExperiments: async () =>
            prisma.referenceCaptureSettlementShadowExperiment.findMany({
              where: {
                organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
                vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
                tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
              },
              orderBy: { updatedAt: 'desc' },
              take: 20,
              select: { id: true, metadataJson: true, updatedAt: true },
            }),
          sleep,
          now: () => new Date(),
        },
        { afterPhysicalEndMs },
      );
      canonicalWindowTo = waited.canonicalWindowTo;
      windowCloseAuthority = `${EXP021_CANARY_WINDOW_CLOSE_AUTHORITY}@${waited.physicalEndSource}`;
    }

    const result = await executeCanaryEnrollment({
      args,
      config,
      repository,
      enrollment,
      activityAuthorityByGeometry,
      canonicalWindowTo,
      windowCloseAuthority,
      providerCallsDuringEnrollment: 0,
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
