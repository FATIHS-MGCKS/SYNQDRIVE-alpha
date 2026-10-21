#!/usr/bin/env ts-node
/**
 * M3.3F F5.1 — bounded read-only natural calibration report (stdout JSON).
 *
 * Usage:
 *   cd backend
 *   BATTERY_F5_ALLOW_PRODUCTION_READONLY=true \
 *     npm run battery:f5:natural-calibration-report -- \
 *       --cohort=f46_sustained --as-of=2026-09-28T20:22:00.000Z
 */
import { PrismaClient } from '@prisma/client';
import { assertF5NaturalCalibrationReportDatabaseAllowed } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-natural-calibration-report.env';
import {
  F5_MAX_REVISIONS_DEFAULT,
  F5_MAX_REVISIONS_HARD,
  F5_PRIMARY_COHORT_V1,
  F5_REPORT_TIMEOUT_MS_DEFAULT,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-natural-calibration-report.constants';
import { runF5NaturalCalibrationReport } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-natural-calibration-report.service';
import {
  F5ReportBoundExceededError,
  F5ReportTimeoutError,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/f5-natural-calibration-report/f5-natural-calibration-report.types';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

function parseIntArg(prefix: string, fallback: number, hardMax: number): number {
  const raw = parseArg(prefix);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid ${prefix}: ${raw}`);
  }
  if (n > hardMax) {
    throw new F5ReportBoundExceededError(`${prefix}=${n} exceeds hard max ${hardMax}`);
  }
  return n;
}

async function main(): Promise<void> {
  try {
    assertF5NaturalCalibrationReportDatabaseAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const cohort = parseArg('--cohort') ?? F5_PRIMARY_COHORT_V1;
  if (cohort !== F5_PRIMARY_COHORT_V1) {
    console.error(`Unsupported cohort: ${cohort}. V1 supports: ${F5_PRIMARY_COHORT_V1}`);
    process.exit(1);
  }

  const asOfRaw = parseArg('--as-of');
  if (!asOfRaw) {
    console.error(
      'Usage: battery-f5-natural-calibration-report.ts --cohort=f46_sustained --as-of=<ISO-UTC>',
    );
    process.exit(1);
  }
  const asOf = new Date(asOfRaw);
  if (Number.isNaN(asOf.getTime())) {
    console.error(`Invalid --as-of: ${asOfRaw}`);
    process.exit(1);
  }

  const maxRevisions = parseIntArg('--max-revisions', F5_MAX_REVISIONS_DEFAULT, F5_MAX_REVISIONS_HARD);
  const timeoutMs = parseIntArg('--timeout-ms', F5_REPORT_TIMEOUT_MS_DEFAULT, 120_000);

  const dbUrl = (process.env.DATABASE_URL ?? '').split('?')[0];
  const prisma = new PrismaClient(
    dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined,
  );

  try {
    const report = await runF5NaturalCalibrationReport(prisma, {
      asOf,
      cohort: F5_PRIMARY_COHORT_V1,
      maxRevisions,
      timeoutMs,
      generatedAt: new Date().toISOString(),
      runtimeAuthority: {
        observedProcessShaA: parseArg('--observed-sha-a') ?? null,
        observedProcessShaB: parseArg('--observed-sha-b') ?? null,
        d3EffectiveA: parseArg('--d3-a') === 'true' ? true : parseArg('--d3-a') === 'false' ? false : null,
        d3EffectiveB: parseArg('--d3-b') === 'true' ? true : parseArg('--d3-b') === 'false' ? false : null,
      },
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (error) {
    if (error instanceof F5ReportBoundExceededError) {
      console.error(error.message);
      process.exit(2);
    }
    if (error instanceof Error && error.message.includes('timeout')) {
      console.error(error.message);
      process.exit(3);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main();
