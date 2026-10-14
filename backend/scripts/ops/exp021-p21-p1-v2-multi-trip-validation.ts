#!/usr/bin/env ts-node
/**
 * EXP021 P1 V2 — multi-trip V1/V2 stationary QC regression (read-only DB).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  EXP021_P1_V2_POLICY_IMPLEMENTATION_SHA,
  EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
  EXP021_P21_REFERENCE_TRIP_EXCLUDED,
  computeMultiTripRegressionVerdict,
  type P21InventoryRow,
  runP21V1V2PolicyCompareOnLoadedContext,
  selectTripsForMultiCompare,
  tripUtcDateLabel,
} from './exp021-p21-p1-v2-policy-compare.lib';

const ORG_DEFAULT = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

type FrozenManifestTrip = {
  tripId: string;
  vehicleId: string;
  workItemId: string;
  shadowRunId: string;
  pinnedSnapshotHash: string;
};

function reqOrg(): string {
  return process.env.EXP021_P21_ORG_ID ?? ORG_DEFAULT;
}

function loadFrozenManifest(filePath: string): FrozenManifestTrip[] {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    selected: FrozenManifestTrip[];
  };
  return raw.selected;
}

async function loadInventory(prisma: PrismaClient, organizationId: string): Promise<P21InventoryRow[]> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
      const rows = await tx.$queryRaw<
        Array<{
          work_item_id: string;
          trip_id: string;
          vehicle_id: string;
          pinned_snapshot_hash: string;
          shadow_run_id: string;
          completed_at: Date;
          start_time: Date;
          duration_minutes: number | null;
          interval_count: number;
          stationary_band_count: number;
        }>
      >`
        WITH active_primary AS (
          SELECT DISTINCT ON (trip_id) id, trip_id
          FROM di_v0_s4_work_items
          WHERE organization_id = ${organizationId}
            AND run_purpose = 'PRIMARY'
            AND purpose_discriminator = 'PRIMARY'
            AND status <> 'SUPERSEDED'
          ORDER BY trip_id, boundary_occurrence DESC, created_at DESC
        ),
        shadow_stats AS (
          SELECT
            si.shadow_run_id,
            si.organization_id,
            si.trip_id,
            COUNT(*)::int AS interval_count,
            COUNT(*) FILTER (
              WHERE si.motion_state = 'STATIONARY_SUPPORTED'
                AND si.speed_evidence_state = 'STATIONARY_BAND'
            )::int AS stationary_band_count,
            MIN(si.reference_time) AS shadow_start_time,
            EXTRACT(EPOCH FROM (MAX(si.reference_time) - MIN(si.reference_time))) / 60.0 AS duration_minutes
          FROM di_v0_shadow_intervals si
          GROUP BY si.shadow_run_id, si.organization_id, si.trip_id
        )
        SELECT
          wi.id AS work_item_id,
          wi.trip_id,
          wi.vehicle_id,
          wi.pinned_snapshot_hash,
          wi.shadow_run_id,
          wi.completed_at,
          ss.shadow_start_time AS start_time,
          ss.duration_minutes,
          ss.interval_count,
          ss.stationary_band_count
        FROM di_v0_s4_work_items wi
        INNER JOIN active_primary ap ON ap.id = wi.id AND ap.trip_id = wi.trip_id
        INNER JOIN shadow_stats ss
          ON ss.shadow_run_id = wi.shadow_run_id
          AND ss.organization_id = wi.organization_id
          AND ss.trip_id = wi.trip_id
        INNER JOIN di_v0_s4_evidence_snapshots es
          ON es.organization_id = wi.organization_id
          AND es.trip_id = wi.trip_id
          AND es.snapshot_hash = wi.pinned_snapshot_hash
        WHERE wi.organization_id = ${organizationId}
          AND wi.status = 'COMPLETED'
          AND wi.pinned_snapshot_hash IS NOT NULL
          AND wi.shadow_run_id IS NOT NULL
        ORDER BY wi.completed_at DESC`;
      return rows.map((r) => ({
        work_item_id: r.work_item_id,
        trip_id: r.trip_id,
        vehicle_id: r.vehicle_id,
        pinned_snapshot_hash: r.pinned_snapshot_hash,
        shadow_run_id: r.shadow_run_id,
        completed_at: r.completed_at,
        start_time: r.start_time,
        duration_minutes: r.duration_minutes,
        interval_count: r.interval_count,
        stationary_band_count: r.stationary_band_count,
      }));
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 },
  );
}

function inventoryRowFromFrozen(
  frozen: FrozenManifestTrip,
  inventory: P21InventoryRow[],
): P21InventoryRow | null {
  return (
    inventory.find(
      (r) =>
        r.trip_id === frozen.tripId &&
        r.work_item_id === frozen.workItemId &&
        r.shadow_run_id === frozen.shadowRunId &&
        r.pinned_snapshot_hash === frozen.pinnedSnapshotHash,
    ) ?? null
  );
}

async function main(): Promise<void> {
  const organizationId = reqOrg();
  const policyImplementationSha =
    process.env.EXP021_POLICY_IMPLEMENTATION_SHA ?? EXP021_P1_V2_POLICY_IMPLEMENTATION_SHA;
  const validationRunnerSha = process.env.EXP021_VALIDATION_RUNNER_SHA ?? 'unknown';
  const outDir = process.env.EXP021_P21_EVIDENCE_DIR ?? path.join(process.cwd(), 'tmp', 'exp021-p21-multi');
  const fixedManifestPath = process.env.EXP021_P21_FIXED_MANIFEST_PATH;
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  const excluded: Array<{ tripId: string; workItemId?: string; reason: string }> = [];
  const manifestMismatches: Array<{ tripId: string; field: string; expected: string; actual: string }> = [];

  try {
    const inventory = await loadInventory(prisma, organizationId);
    const eligibleDistinctTrips = inventory.length;

    let manifestTrips: FrozenManifestTrip[];
    let selectionSource: 'FROZEN_MANIFEST' | 'LIVE_INVENTORY_GREEDY';

    if (fixedManifestPath) {
      manifestTrips = loadFrozenManifest(fixedManifestPath);
      selectionSource = 'FROZEN_MANIFEST';
    } else {
      const selected = selectTripsForMultiCompare(inventory, {
        excludeTripIds: [EXP021_P21_REFERENCE_TRIP_EXCLUDED],
        maxTrips: 10,
      });
      manifestTrips = selected.map((r) => ({
        tripId: r.trip_id,
        vehicleId: r.vehicle_id,
        workItemId: r.work_item_id,
        shadowRunId: r.shadow_run_id,
        pinnedSnapshotHash: r.pinned_snapshot_hash,
      }));
      selectionSource = 'LIVE_INVENTORY_GREEDY';
    }

    const manifest = {
      schema: 'EXP021_P1_V2_MULTI_TRIP_SELECTION_MANIFEST_V2',
      policyImplementationSha,
      validationRunnerSha,
      selectionSource,
      organizationId,
      selectionRule: EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
      referenceTripExcluded: EXP021_P21_REFERENCE_TRIP_EXCLUDED,
      inventoryEligibleDistinctTrips: eligibleDistinctTrips,
      selectedTripCount: manifestTrips.length,
      selected: manifestTrips,
    };
    fs.writeFileSync(path.join(outDir, 'EXP021_P1_V2_MULTI_TRIP_SELECTION_MANIFEST.json'), JSON.stringify(manifest, null, 2));

    const tripResults: Array<ReturnType<typeof runP21V1V2PolicyCompareOnLoadedContext> & { tripDateUtc: string }> = [];
    let readOnlyObserved = true;
    let repeatableReadObserved = true;
    let manifestIdentityOk = true;

    for (const frozen of manifestTrips) {
      const invRow = inventoryRowFromFrozen(frozen, inventory);
      if (!invRow) {
        manifestIdentityOk = false;
        excluded.push({
          tripId: frozen.tripId,
          workItemId: frozen.workItemId,
          reason: 'MANIFEST_ROW_NOT_IN_CURRENT_INVENTORY',
        });
        continue;
      }
      try {
        const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
          organizationId,
          tripId: frozen.tripId,
          workItemId: frozen.workItemId,
        });
        if (ctx.dbTransactionReadOnly !== 'on') readOnlyObserved = false;
        if (!ctx.dbTransactionIsolation.toLowerCase().includes('repeatable')) repeatableReadObserved = false;

        const bindChecks: Array<[string, string, string]> = [
          ['vehicleId', frozen.vehicleId, ctx.workItem!.vehicle_id],
          ['shadowRunId', frozen.shadowRunId, ctx.shadowRun.id],
          ['pinnedSnapshotHash', frozen.pinnedSnapshotHash, ctx.pinnedSnapshotHash],
          ['tripId', frozen.tripId, ctx.workItem!.trip_id],
          ['workItemId', frozen.workItemId, ctx.workItem!.id],
        ];
        for (const [field, expected, actual] of bindChecks) {
          if (expected !== actual) {
            manifestIdentityOk = false;
            manifestMismatches.push({ tripId: frozen.tripId, field, expected, actual });
          }
        }
        if (!ctx.snapshotVerified) {
          manifestIdentityOk = false;
          manifestMismatches.push({
            tripId: frozen.tripId,
            field: 'snapshotVerified',
            expected: 'true',
            actual: 'false',
          });
        }

        const result = runP21V1V2PolicyCompareOnLoadedContext(ctx);
        tripResults.push({ ...result, tripDateUtc: tripUtcDateLabel(invRow.start_time) });
      } catch (e) {
        excluded.push({
          tripId: frozen.tripId,
          workItemId: frozen.workItemId,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const totals = tripResults.reduce(
      (acc, t) => {
        acc.intervals += t.intervalCount;
        acc.stationaryCandidates += t.stationaryCandidates;
        acc.contractualNullPath += t.contractualNullPathIntervals;
        acc.v2Accepted += t.v2StationaryAccepted;
        acc.v2Withheld += t.v2StationaryWithheld;
        acc.changesOutside += t.changesOutsideAllowedPath;
        acc.nullToZero += t.nullToZeroConversions;
        acc.intervalwiseMismatches += t.intervalwiseQcSpeedMismatches;
        acc.acceptanceContractViolations += t.acceptanceContractViolations;
        acc.releaseFrozenObserved += t.releaseFrozenIntervalsObserved;
        acc.releaseFrozenAccepted += t.releaseFrozenV2Accepted;
        for (const [k, v] of Object.entries(t.withheldReasonBreakdown)) {
          acc.withheld[k] = (acc.withheld[k] ?? 0) + v;
        }
        if (!t.intervalwiseNumericComparisonComplete) acc.intervalwiseIncompleteTrips += 1;
        if (!t.regressionPass) acc.failingTrips += 1;
        return acc;
      },
      {
        intervals: 0,
        stationaryCandidates: 0,
        contractualNullPath: 0,
        v2Accepted: 0,
        v2Withheld: 0,
        changesOutside: 0,
        nullToZero: 0,
        intervalwiseMismatches: 0,
        acceptanceContractViolations: 0,
        releaseFrozenObserved: 0,
        releaseFrozenAccepted: 0,
        withheld: {} as Record<string, number>,
        intervalwiseIncompleteTrips: 0,
        failingTrips: 0,
      },
    );

    const vehiclesEvaluated = new Set(tripResults.map((t) => t.vehicleId)).size;
    const distinctDates = new Set(tripResults.map((t) => t.tripDateUtc)).size;
    const allTripsRegressionPass = tripResults.length > 0 && tripResults.every((t) => t.regressionPass);

    const regressionVerdict = computeMultiTripRegressionVerdict({
      manifestTripCount: manifestTrips.length,
      evaluatedTripCount: tripResults.length,
      excludedCount: excluded.length,
      readOnlyObserved,
      repeatableReadObserved,
      manifestIdentityOk,
      allTripsRegressionPass,
    });

    const report = {
      schema: 'EXP021_P1_V2_MULTI_TRIP_RESULT_V2',
      policyImplementationSha,
      validationRunnerSha,
      selectionSource,
      organizationId,
      selectionRule: EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
      eligibleDistinctTrips,
      additionalTripsEvaluated: tripResults.length,
      manifestTripCount: manifestTrips.length,
      vehiclesEvaluated,
      distinctTripDates: distinctDates,
      excludedInputsAndReasons: excluded,
      manifestIdentityMismatches: manifestMismatches,
      snapshotIdentitiesVerified:
        tripResults.length > 0 && manifestIdentityOk && manifestMismatches.length === 0,
      readOnlyObserved,
      repeatableReadObserved,
      transactionAndIdentityGatesPass:
        readOnlyObserved && repeatableReadObserved && manifestIdentityOk && tripResults.length === manifestTrips.length,
      totals,
      releaseFrozenCaseCounts: {
        intervalsObserved: totals.releaseFrozenObserved,
        v2AcceptedOnReleaseOrFrozenCenter: totals.releaseFrozenAccepted,
        acceptedViolationCount: totals.releaseFrozenAccepted,
        scope:
          'Counts shadow center positionState RELEASE or FROZEN_UNRESOLVED; violations only when V2 OK_STATIONARY_NULL_SPEED on those centers',
        notObserved:
          totals.releaseFrozenAccepted === 0
            ? 'RELEASE_FROZEN_V2_ACCEPT'
            : null,
      },
      perTrip: tripResults.map((t) => ({
        tripId: t.tripId,
        vehicleId: t.vehicleId,
        tripDateUtc: t.tripDateUtc,
        workItemId: t.workItemId,
        intervalCount: t.intervalCount,
        stationaryCandidates: t.stationaryCandidates,
        contractualNullPathIntervals: t.contractualNullPathIntervals,
        v2StationaryAccepted: t.v2StationaryAccepted,
        v2StationaryWithheld: t.v2StationaryWithheld,
        withheldReasonBreakdown: t.withheldReasonBreakdown,
        trustedNumericV1: t.trustedNumericCountV1,
        trustedNumericV2: t.trustedNumericCountV2,
        coverageV1: t.trustedNumericCoverageV1,
        coverageV2: t.trustedNumericCoverageV2,
        maxV1: t.qcTrustedMaxV1,
        maxV2: t.qcTrustedMaxV2,
        intervalwiseNumericComparisonComplete: t.intervalwiseNumericComparisonComplete,
        changesOutsideAllowedPath: t.changesOutsideAllowedPath,
        regressionPass: t.regressionPass,
        violationSample: t.violations.slice(0, 5),
      })),
      regressionVerdict,
      independentGroundTruthAvailable: false,
      productionMutations: false,
      providerCalls: false,
      customerRuntimeActivated: false,
    };

    const reportPath = path.join(outDir, 'EXP021_P1_V2_MULTI_TRIP_RESULT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
