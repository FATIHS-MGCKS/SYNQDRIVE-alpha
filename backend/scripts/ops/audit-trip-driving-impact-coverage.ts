/**
 * Read-only dry-run audit for TripDrivingImpact coverage gaps (Prompt 13).
 *
 * Default: DRY RUN — does not enqueue jobs or mutate production data.
 *
 * Usage (fixtures):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-trip-driving-impact-coverage.ts --fixtures-only
 *
 * Usage (database dry-run):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-trip-driving-impact-coverage.ts \
 *     --organization-id=<ORG_UUID> --limit=100 --max-batch-size=25
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import {
  auditTripDrivingImpactCoverage,
  TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION,
} from '../../src/modules/vehicle-intelligence/driving-impact/trip-driving-impact-coverage.domain';
import { TripDrivingImpactBackfillService } from '../../src/modules/vehicle-intelligence/driving-impact/trip-driving-impact-backfill.service';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function buildSyntheticAuditInputs() {
  const base = (overrides: Partial<Parameters<typeof auditTripDrivingImpactCoverage>[0]>) =>
    auditTripDrivingImpactCoverage({
      tripId: 'trip-normal',
      vehicleId: 'vehicle-1',
      organizationId: 'org-fixture-1',
      tripStatus: 'COMPLETED',
      startTime: '2026-03-01T08:00:00.000Z',
      endTime: '2026-03-01T09:00:00.000Z',
      distanceKm: 42,
      behaviorEnrichmentStatus: 'COMPLETED',
      drivingImpactStatus: 'PENDING',
      drivingImpactComputedAt: null,
      tripAnalysisStatus: 'IN_PROGRESS',
      updatedAt: '2026-03-01T09:05:00.000Z',
      existingTdi: null,
      ...overrides,
    });

  return [
    base({ tripId: 'trip-normal' }),
    base({
      tripId: 'trip-missing-tdi',
      behaviorEnrichmentStatus: 'COMPLETED',
      drivingImpactStatus: 'PENDING',
    }),
    base({
      tripId: 'trip-retry',
      behaviorEnrichmentStatus: 'FAILED_TRANSIENT',
      existingTdi: null,
    }),
    base({
      tripId: 'trip-distance-stale',
      distanceKm: 55,
      existingTdi: {
        tripId: 'trip-distance-stale',
        authoritativeDistanceKm: 42,
        distanceKm: 42,
        sourceFingerprint: 'abc123',
        analysisStatus: 'COMPLETE',
        calculatedAt: '2026-03-01T09:10:00.000Z',
        tripDistanceKmAtSource: 42,
      },
    }),
    base({
      tripId: 'trip-partial',
      behaviorEnrichmentStatus: 'COMPLETED',
      existingTdi: {
        tripId: 'trip-partial',
        authoritativeDistanceKm: 42,
        distanceKm: 42,
        sourceFingerprint: 'partial1',
        analysisStatus: 'PARTIAL',
        calculatedAt: '2026-03-01T09:10:00.000Z',
        tripDistanceKmAtSource: 42,
      },
    }),
    base({
      tripId: 'trip-unsupported',
      distanceKm: 1.2,
      behaviorEnrichmentStatus: 'COMPLETED',
    }),
    base({
      tripId: 'trip-not-final',
      tripStatus: 'ONGOING',
      endTime: null,
    }),
    base({
      tripId: 'trip-cross-tenant',
      organizationId: 'other-org',
    }),
    base({
      tripId: 'trip-complete',
      drivingImpactStatus: 'READY',
      drivingImpactComputedAt: '2026-03-01T09:10:00.000Z',
      existingTdi: {
        tripId: 'trip-complete',
        authoritativeDistanceKm: 42,
        distanceKm: 42,
        sourceFingerprint: 'complete1',
        analysisStatus: 'COMPLETE',
        calculatedAt: '2026-03-01T09:10:00.000Z',
        tripDistanceKmAtSource: 42,
      },
    }),
  ];
}

async function main(): Promise<void> {
  const limitRaw = parseArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const maxBatchRaw = parseArg('--max-batch-size');
  const maxBatchSize = maxBatchRaw ? Number(maxBatchRaw) : 25;
  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');

  let auditRows;
  if (hasFlag('--fixtures-only') || !process.env.DATABASE_URL) {
    auditRows = buildSyntheticAuditInputs();
  } else {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    try {
      const service = app.get(TripDrivingImpactBackfillService);
      auditRows = await service.auditFromDatabase({
        organizationId,
        vehicleId,
        limit,
      });
    } finally {
      await app.close();
    }
  }

  const backfillService = new TripDrivingImpactBackfillService({} as any);
  const plan = backfillService.planBackfill(auditRows, {
    dryRun: !hasFlag('--apply'),
    organizationId,
    vehicleId,
    maxBatchSize,
  });

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const outputDir = parseArg('--output-dir') ?? path.join(repoRoot, 'docs', 'audits', 'data');
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'trip-driving-impact-coverage-dry-run-2026-07.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        auditVersion: TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION,
        dryRun: plan.dryRun,
        reportHash: plan.reportHash,
        summary: {
          audited: auditRows.length,
          autoBackfill: plan.autoBackfill.length,
          manualReview: plan.manualReview.length,
          skipped: plan.skipped.length,
        },
        plan,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        dryRun: plan.dryRun,
        auditVersion: plan.auditVersion,
        reportHash: plan.reportHash,
        jsonPath,
        summary: {
          audited: auditRows.length,
          autoBackfill: plan.autoBackfill.length,
          manualReview: plan.manualReview.length,
          skipped: plan.skipped.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
