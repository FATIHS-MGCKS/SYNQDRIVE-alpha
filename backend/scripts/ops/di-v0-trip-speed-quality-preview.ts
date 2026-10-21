#!/usr/bin/env ts-node
/**
 * EXP-021 P2.1 — read-only trip speed quality preview (single work item).
 * Does NOT persist projections, mutate S4/S2, or call external providers.
 *
 * Required: DATABASE_URL (read-only DB role recommended for production previews — see authority doc).
 *
 * Scope input (exactly one path):
 *   A) CLI flags: --organizationId <uuid> --tripId <uuid> --workItemId <uuid>
 *   B) Env bundle: DI_V0_P21_ORGANIZATION_ID, DI_V0_P21_TRIP_ID, DI_V0_P21_WORK_ITEM_ID (all three)
 *
 * Optional QC policy (defaults V1): --qcPolicyVersion or DI_V0_P21_QC_POLICY_VERSION
 *
 * Generic ORGANIZATION_ID is intentionally NOT accepted.
 */
import { PrismaClient } from '@prisma/client';
import { previewDiV0TripSpeedQualityForWorkItem } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-preview';
import {
  DiV0P21PreviewScopeError,
  exitCodeForPreviewOutcome,
  resolveDiV0P21PreviewScope,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-preview-cli.scope';

function scopeExitCode(error: DiV0P21PreviewScopeError): number {
  if (error.code === 'INVALID_UUID') return 4;
  if (error.code === 'MIXED_INPUT_SOURCES' || error.code === 'AMBIGUOUS_ENV') return 5;
  return 2;
}

async function writeStdoutLine(line: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(`${line}\n`, (err) => (err ? reject(err) : resolve()));
  });
}

/** Returns process exit code; never calls process.exit (caller disconnects Prisma first). */
export async function runDiV0TripSpeedQualityPreviewCli(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const scope = resolveDiV0P21PreviewScope(argv, env);
  const prisma = new PrismaClient();
  try {
    const report = await previewDiV0TripSpeedQualityForWorkItem(prisma, {
      organizationId: scope.organizationId,
      tripId: scope.tripId,
      workItemId: scope.workItemId,
      qcPolicyVersion: scope.qcPolicyVersion,
    });
    await writeStdoutLine(JSON.stringify(report, null, 2));
    return exitCodeForPreviewOutcome(report.outcome);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<number> {
  try {
    return await runDiV0TripSpeedQualityPreviewCli(process.argv, process.env);
  } catch (error) {
    if (error instanceof DiV0P21PreviewScopeError) {
      console.error(error.message);
      return scopeExitCode(error);
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
