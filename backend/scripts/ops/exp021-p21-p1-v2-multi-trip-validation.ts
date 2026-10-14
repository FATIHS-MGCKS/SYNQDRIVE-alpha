#!/usr/bin/env ts-node
/**
 * EXP021 P1 V2 — multi-trip V1/V2 stationary QC regression (read-only DB).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
  EXP021_P21_REFERENCE_TRIP_EXCLUDED,
  type P21InventoryRow,
  runP21V1V2PolicyCompareOnLoadedContext,
  selectTripsForMultiCompare,
  tripUtcDateLabel,
} from './exp021-p21-p1-v2-policy-compare.lib';

const ORG_DEFAULT = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function reqOrg(): string {
  return process.env.EXP021_P21_ORG_ID ?? ORG_DEFAULT;
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

async function main(): Promise<void> {
  const organizationId = reqOrg();
  const executedCodeSha = process.env.EXP021_EXECUTED_CODE_SHA ?? 'unknown';
  const outDir = process.env.EXP021_P21_EVIDENCE_DIR ?? path.join(process.cwd(), 'tmp', 'exp021-p21-multi');
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  const excluded: Array<{ tripId: string; workItemId?: string; reason: string }> = [];

  try {
    const inventory = await loadInventory(prisma, organizationId);
    const eligibleDistinctTrips = inventory.length;
    const selected = selectTripsForMultiCompare(inventory, {
      excludeTripIds: [EXP021_P21_REFERENCE_TRIP_EXCLUDED],
      maxTrips: 10,
    });

    const manifest = {
      schema: 'EXP021_P1_V2_MULTI_TRIP_SELECTION_MANIFEST_V1',
      executedCodeSha,
      organizationId,
      selectionRule: EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
      referenceTripExcluded: EXP021_P21_REFERENCE_TRIP_EXCLUDED,
      inventoryEligibleDistinctTrips: eligibleDistinctTrips,
      selectedTripCount: selected.length,
      selected: selected.map((r) => ({
        tripId: r.trip_id,
        vehicleId: r.vehicle_id,
        workItemId: r.work_item_id,
        shadowRunId: r.shadow_run_id,
        pinnedSnapshotHash: r.pinned_snapshot_hash,
        tripDateUtc: tripUtcDateLabel(r.start_time),
        durationMinutes: r.duration_minutes,
        intervalCount: r.interval_count,
        stationaryBandCount: r.stationary_band_count,
      })),
      inventorySummary: {
        distinctVehicles: new Set(inventory.map((r) => r.vehicle_id)).size,
        distinctTripDates: new Set(inventory.map((r) => tripUtcDateLabel(r.start_time))).size,
      },
    };
    fs.writeFileSync(path.join(outDir, 'EXP021_P1_V2_MULTI_TRIP_SELECTION_MANIFEST.json'), JSON.stringify(manifest, null, 2));

    const tripResults: Array<ReturnType<typeof runP21V1V2PolicyCompareOnLoadedContext> & { tripDateUtc: string }> = [];
    let readOnlyObserved = true;
    let repeatableReadObserved = true;

    for (const row of selected) {
      try {
        const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
          organizationId,
          tripId: row.trip_id,
          workItemId: row.work_item_id,
        });
        if (ctx.dbTransactionReadOnly !== 'on') readOnlyObserved = false;
        if (!ctx.dbTransactionIsolation.toLowerCase().includes('repeatable')) repeatableReadObserved = false;
        const result = runP21V1V2PolicyCompareOnLoadedContext(ctx);
        tripResults.push({ ...result, tripDateUtc: tripUtcDateLabel(row.start_time) });
      } catch (e) {
        excluded.push({
          tripId: row.trip_id,
          workItemId: row.work_item_id,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const totals = tripResults.reduce(
      (acc, t) => {
        acc.intervals += t.intervalCount;
        acc.stationaryCandidates += t.stationaryCandidates;
        acc.v2Accepted += t.v2StationaryAccepted;
        acc.v2Withheld += t.v2StationaryWithheld;
        acc.changesOutside += t.changesOutsideAllowedPath;
        acc.nullToZero += t.nullToZeroConversions;
        acc.unsafe += t.unsafePromotions;
        for (const [k, v] of Object.entries(t.withheldReasonBreakdown)) {
          acc.withheld[k] = (acc.withheld[k] ?? 0) + v;
        }
        if (!t.numericValuesUnchanged) acc.numericDriftTrips += 1;
        if (!t.numericCoverageUnchanged) acc.coverageDriftTrips += 1;
        if (!t.regressionPass) acc.failingTrips += 1;
        return acc;
      },
      {
        intervals: 0,
        stationaryCandidates: 0,
        v2Accepted: 0,
        v2Withheld: 0,
        changesOutside: 0,
        nullToZero: 0,
        unsafe: 0,
        withheld: {} as Record<string, number>,
        numericDriftTrips: 0,
        coverageDriftTrips: 0,
        failingTrips: 0,
      },
    );

    const vehiclesEvaluated = new Set(tripResults.map((t) => t.vehicleId)).size;
    const distinctDates = new Set(tripResults.map((t) => t.tripDateUtc)).size;

    let regressionVerdict: 'PASS' | 'PARTIAL' | 'FAIL' | 'INSUFFICIENT_EXISTING_EVIDENCE' = 'PASS';
    if (selected.length === 0 && eligibleDistinctTrips <= 1) {
      regressionVerdict = 'INSUFFICIENT_EXISTING_EVIDENCE';
    } else if (totals.failingTrips > 0 || excluded.length > 0) {
      regressionVerdict = totals.failingTrips === tripResults.length ? 'FAIL' : 'PARTIAL';
    }

    const report = {
      schema: 'EXP021_P1_V2_MULTI_TRIP_RESULT_V1',
      executedCodeSha,
      organizationId,
      selectionRule: EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
      eligibleDistinctTrips,
      additionalTripsEvaluated: tripResults.length,
      vehiclesEvaluated,
      distinctTripDates: distinctDates,
      excludedInputsAndReasons: excluded,
      snapshotIdentitiesVerified: tripResults.every((t) => t.pinnedSnapshotHash.length > 0),
      readOnlyObserved,
      repeatableReadObserved,
      totals,
      perTrip: tripResults.map((t) => ({
        tripId: t.tripId,
        vehicleId: t.vehicleId,
        tripDateUtc: t.tripDateUtc,
        workItemId: t.workItemId,
        intervalCount: t.intervalCount,
        stationaryCandidates: t.stationaryCandidates,
        v2StationaryAccepted: t.v2StationaryAccepted,
        v2StationaryWithheld: t.v2StationaryWithheld,
        withheldReasonBreakdown: t.withheldReasonBreakdown,
        trustedNumericV1: t.trustedNumericCountV1,
        trustedNumericV2: t.trustedNumericCountV2,
        coverageV1: t.trustedNumericCoverageV1,
        coverageV2: t.trustedNumericCoverageV2,
        maxV1: t.qcTrustedMaxV1,
        maxV2: t.qcTrustedMaxV2,
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
