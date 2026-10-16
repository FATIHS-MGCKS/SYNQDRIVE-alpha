#!/usr/bin/env ts-node
/**
 * EXP021 — post-production coverage & motion diagnostic (read-only DB).
 * No provider calls, no projection writes, no flag/QC changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.version';
import { evaluateExp021PersistedAggregateReplayMatch } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/exp021-persisted-aggregate-replay-match';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import {
  partitionTripIntervalsV2,
  summarizeAccelBrakeReadiness,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-exp021-coverage-interval-partition';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  EXP021_COVERAGE_DIAGNOSTIC_SELECTION_RULE_V1,
  selectTripsForCoverageDiagnostic,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/exp021-coverage-diagnostic-selection';
import type { P21InventoryRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/exp021-p21-p1-v2-multi-trip-selection';

const ORG_DEFAULT = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const ANALYSIS_IMPLEMENTATION_SHA = process.env.GIT_SHA ?? 'workspace';

function reqOrg(): string {
  return process.env.EXP021_COVERAGE_ORG_ID ?? ORG_DEFAULT;
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
          source_family: string;
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
          ss.stationary_band_count,
          wi.source_family::text AS source_family
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
        source_family: r.source_family,
      }));
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

async function loadVehicleConnectivity(
  prisma: PrismaClient,
  organizationId: string,
  vehicleIds: string[],
): Promise<Record<string, unknown>> {
  if (vehicleIds.length === 0) return {};
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
      const links = await tx.$queryRaw<
        Array<{
          vehicle_id: string;
          provider: string;
          source_type: string;
          source_subtype: string | null;
          is_active: boolean;
          dimo_vehicle_id: string | null;
          source_reference_id: string | null;
        }>
      >`
        SELECT vdl.vehicle_id,
               vdl.provider,
               vdl.source_type,
               vdl.source_subtype,
               vdl.is_active,
               vdl.dimo_vehicle_id,
               vdl.source_reference_id
        FROM vehicle_data_source_links vdl
        INNER JOIN vehicles v ON v.id = vdl.vehicle_id
        WHERE v.organization_id = ${organizationId}
          AND vdl.vehicle_id::text IN (${Prisma.join(vehicleIds.map((id) => Prisma.sql`${id}`))})
          AND vdl.is_active = true
        ORDER BY vdl.vehicle_id, vdl.provider`;
      return { activeLinks: links };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

async function loadPersistedCurrentV2(
  prisma: PrismaClient,
  organizationId: string,
  tripId: string,
  workItemId: string,
): Promise<Record<string, unknown> | null> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          projection_json: unknown;
          content_fingerprint: string;
          qc_policy_version: string;
          projection_version: string;
          lifecycle_status: string;
          created_at: Date;
        }>
      >`
        SELECT id, projection_json, content_fingerprint, qc_policy_version, projection_version,
               lifecycle_status, created_at
        FROM di_v0_trip_speed_quality_projections_v1
        WHERE organization_id = ${organizationId}
          AND trip_id = ${tripId}
          AND work_item_id = ${workItemId}
          AND lifecycle_status = 'CURRENT'
          AND qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
          AND projection_version = ${DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1}
        LIMIT 1`;
      return rows[0] ?? null;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

function aggregateFleet(rows: Array<{ summary: ReturnType<typeof partitionTripIntervalsV2>['summary'] }>) {
  let totalSeconds = 0;
  const primary: Record<string, number> = {};
  const causes: Record<string, number> = {};
  for (const r of rows) {
    const n = r.summary.intervalCount;
    totalSeconds += n;
    for (const [k, v] of Object.entries(r.summary.primarySeconds)) {
      primary[k] = (primary[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(r.summary.unassessableCauseSeconds)) {
      causes[k] = (causes[k] ?? 0) + v;
    }
  }
  const pct = (x: number) => (totalSeconds > 0 ? Math.round((x / totalSeconds) * 1000) / 10 : null);
  return {
    tripCount: rows.length,
    totalIntervalSeconds: totalSeconds,
    timeWeightedTrustedNumericPercent: pct(primary.TRUSTED_NUMERIC ?? 0),
    timeWeightedNumericShadowPercent: null as number | null,
    timeWeightedUnassessableCausePercent: Object.fromEntries(
      Object.entries(causes).map(([k, v]) => [k, pct(v)]),
    ),
    primarySeconds: primary,
    unassessableCauseSeconds: causes,
  };
}

async function main(): Promise<void> {
  const organizationId = reqOrg();
  const outPath =
    process.env.EXP021_COVERAGE_OUT ??
    path.join(process.cwd(), 'exp021-coverage-diagnostic-report.json');
  const observedAtUtc = new Date().toISOString();
  const prisma = new PrismaClient();
  try {
    const inventoryRaw = await loadInventory(prisma, organizationId);
    const inventory: P21InventoryRow[] = inventoryRaw.map((r) => ({
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
    const selection = selectTripsForCoverageDiagnostic(inventory, { maxTrips: 20 });
    const vehicleIds = [...new Set(selection.selected.map((s) => s.vehicle_id))];
    const connectivity = await loadVehicleConnectivity(prisma, organizationId, vehicleIds);

    const tripReports: unknown[] = [];
    for (const pick of selection.selected) {
      const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
        organizationId,
        tripId: pick.trip_id,
        workItemId: pick.work_item_id,
      });
      const replayProjection = buildDiV0TripSpeedQualityProjectionV1({
        organizationId,
        vehicleId: pick.vehicle_id,
        tripId: pick.trip_id,
        workItemId: pick.work_item_id,
        shadowRunId: pick.shadow_run_id,
        pinnedSnapshotHash: pick.pinned_snapshot_hash,
        boundaryFingerprint: ctx.workItem!.boundary_fingerprint,
        sourceFamily: ctx.workItem!.source_family as never,
        combinedInputIdentity: ctx.workItem!.combined_input_identity,
        shadowInputEvidenceVersion: ctx.shadowRun.inputEvidenceVersion,
        workItemCompletedAt: ctx.workItem!.completed_at,
        snapshotVerified: true,
        evidence: ctx.evidence,
        shadowIntervals: ctx.shadowIntervals,
        qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      });
      const partitioned = partitionTripIntervalsV2({
        shadowIntervals: ctx.shadowIntervals,
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        pinnedSnapshotHash: pick.pinned_snapshot_hash,
        acquisitionWindow: ctx.acquisitionWindow,
      });
      const accel = summarizeAccelBrakeReadiness(ctx.shadowIntervals, partitioned.intervals);
      const persisted = await loadPersistedCurrentV2(prisma, organizationId, pick.trip_id, pick.work_item_id);
      const replayMatch = evaluateExp021PersistedAggregateReplayMatch({
        persisted,
        replay: {
          trustedNumericCoveragePercent: replayProjection.quality.trustedNumericCoveragePercent,
          numericCoveragePercent: replayProjection.quality.numericCoveragePercent,
          trustedLimitedStationaryCount: replayProjection.quality.trustedLimitedStationaryCount,
          qcTrustedMaxKmh: replayProjection.speed.qcTrustedMaxKmh,
        },
      });

      const invRow = inventoryRaw.find((r) => r.trip_id === pick.trip_id);
      tripReports.push({
        tripId: pick.trip_id,
        vehicleId: pick.vehicle_id,
        workItemId: pick.work_item_id,
        sourceFamily: invRow?.source_family ?? ctx.workItem!.source_family,
        intervalCount: pick.interval_count,
        durationMinutes: pick.duration_minutes,
        partition: partitioned.summary,
        replayProjection: {
          numericCoveragePercent: replayProjection.quality.numericCoveragePercent,
          trustedNumericCoveragePercent: replayProjection.quality.trustedNumericCoveragePercent,
          trustedLimitedStationaryCount: replayProjection.quality.trustedLimitedStationaryCount,
          qcTrustedMaxKmh: replayProjection.speed.qcTrustedMaxKmh,
          qcTrustedMeanKmh: replayProjection.speed.qcTrustedMeanKmh,
        },
        persistedAggregateReplayMatch: replayMatch,
        accelBrakeReadiness: accel,
        dbSession: {
          readOnly: ctx.dbTransactionReadOnly,
          isolation: ctx.dbTransactionIsolation,
        },
      });
    }

    const fleet = aggregateFleet(
      tripReports.map((t) => ({ summary: (t as { partition: ReturnType<typeof partitionTripIntervalsV2>['summary'] }).partition })),
    );

    const persistedStatuses = tripReports.map(
      (t) => (t as { persistedAggregateReplayMatch: { status: string } }).persistedAggregateReplayMatch.status,
    );
    const persistedAggregateSummary = {
      analyzedTrips: tripReports.length,
      withPersistedCurrentV2Row: persistedStatuses.filter((s) => s === 'PASS' || s === 'FAIL').length,
      aggregateMatchPass: persistedStatuses.filter((s) => s === 'PASS').length,
      aggregateMatchFail: persistedStatuses.filter((s) => s === 'FAIL').length,
      aggregateMatchNa: persistedStatuses.filter((s) => s === 'N/A').length,
      wrongProjectionVersionFilterImpact:
        'Selection and partition/replay use inventory + pinned snapshot only; erroneous projection_version=V2 filter affected only legacy persistedAggregateReplayMatch comparison (never PASS on empty set).',
    };

    const report = {
      kind: 'EXP021_COVERAGE_DIAGNOSTIC_V1',
      observedAtUtc,
      analysisImplementationSha: ANALYSIS_IMPLEMENTATION_SHA,
      organizationId,
      selectionRule: EXP021_COVERAGE_DIAGNOSTIC_SELECTION_RULE_V1,
      inventoryPoolSize: selection.poolSize,
      inventoryOmissions: {
        note: 'Trips without completed PRIMARY + pinned snapshot + shadow + evidence snapshot are excluded from pool.',
        excludedReferenceTrip: 'd0af9cc7-ce0d-4e40-9854-2c1341e83bed',
      },
      selectedTripIds: selection.selected.map((s) => s.trip_id),
      forcedTripIds: selection.forcedIncluded,
      greedyTripIds: selection.greedyIncluded,
      vehicleConnectivity: connectivity,
      fleetTimeWeighted: fleet,
      persistedAggregateSummary,
      trips: tripReports,
      productionMutations: 'NONE',
      intervalStorageNote: 'Persisted interval arrays N/A; compute-interval partition from shadow replay only.',
    };

    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, outPath, tripCount: tripReports.length, fleet }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
